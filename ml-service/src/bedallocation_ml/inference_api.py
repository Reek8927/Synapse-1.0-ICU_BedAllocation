"""Read-only research inference API for BedAllocation.

This service exposes an uncalibrated research score for the corrected, inferred
sepsis-onset target. It does not make an ICU admission or priority decision.
Inputs are not persisted or logged by this module.
"""
from __future__ import annotations

import hmac
import json
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal
from uuid import uuid4

import joblib
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

EXPECTED_TARGET_PREFIX = "target_sepsis_onset_next_"
RESEARCH_LIMITATIONS = [
    "Research prototype only; not clinically validated.",
    "The score is uncalibrated and must not be interpreted as a clinical probability.",
    "The target is inferred annotated sepsis onset within the next six hourly rows, not ICU admission need.",
    "This output must not determine eligibility, queue position, bed reservation, or ICU placement.",
    "A qualified clinician must make clinical decisions using approved procedures and the full patient context.",
]


@dataclass(frozen=True)
class APISettings:
    model_path: Path
    schema_path: Path
    metadata_path: Path
    api_key: str
    model_key: str = "hist_gradient_boosting"
    model_version: str = "research-candidate-v1"
    environment: str = "development"
    max_feature_count: int = 40
    low_completeness_fraction: float = 0.5

    @classmethod
    def from_environment(cls) -> "APISettings":
        return cls(
            model_path=Path(os.getenv(
                "BEDALLOCATION_MODEL_PATH",
                "artifacts_onset/sepsis_onset_next_6h_hist_gradient_boosting.joblib",
            )).resolve(),
            schema_path=Path(os.getenv(
                "BEDALLOCATION_SCHEMA_PATH",
                "data/processed_onset/schema.json",
            )).resolve(),
            metadata_path=Path(os.getenv(
                "BEDALLOCATION_MODEL_METADATA_PATH",
                "artifacts_onset/sepsis_onset_comparison_model_metadata.json",
            )).resolve(),
            api_key=os.getenv("BEDALLOCATION_ML_API_KEY", ""),
            model_key=os.getenv("BEDALLOCATION_MODEL_KEY", "hist_gradient_boosting"),
            model_version=os.getenv("BEDALLOCATION_MODEL_VERSION", "research-candidate-v1"),
            environment=os.getenv("BEDALLOCATION_ENV", "development").lower(),
            low_completeness_fraction=float(os.getenv("BEDALLOCATION_MIN_FEATURE_COMPLETENESS", "0.5")),
        )


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    features: dict[str, Any] = Field(
        min_length=1,
        description="Subset of the model's numeric features. Unknown feature names are rejected; omitted values are treated as missing.",
    )


class PredictResponse(BaseModel):
    request_id: str
    generated_at_utc: str
    model_key: str
    model_version: str
    target_column: str
    target_definition: str
    score: float | None
    score_status: Literal["available", "withheld"]
    withheld_reason: str | None = None
    feature_completeness_fraction: float
    score_type: str = "uncalibrated_model_score"
    expected_feature_count: int
    supplied_non_missing_feature_count: int
    missing_feature_count: int
    missing_features: list[str]
    low_feature_completeness: bool
    persisted: bool = False
    changes_patient_record: bool = False
    changes_queue_or_bed_status: bool = False
    clinical_limitations: list[str]


class ModelRuntime:
    def __init__(self, model: Any, schema: dict[str, Any], metadata: dict[str, Any], settings: APISettings):
        self.model = model
        self.schema = schema
        self.metadata = metadata
        self.settings = settings
        self.features = list(schema["feature_columns"])
        self.target_column = schema["target_column"]
        self.target_definition = schema["target_definition"]
        if not self.features or len(self.features) > settings.max_feature_count:
            raise RuntimeError("Unexpected model feature count in schema")
        if not 0 < settings.low_completeness_fraction <= 1:
            raise RuntimeError("BEDALLOCATION_MIN_FEATURE_COMPLETENESS must be greater than 0 and at most 1")
        if self.target_column != "target_sepsis_onset_next_6h":
            raise RuntimeError("The inference API only serves target_sepsis_onset_next_6h")
        if "inferred annotated sepsis onset" not in str(self.target_definition).lower():
            raise RuntimeError("Schema does not contain the corrected inferred-onset target definition")
        if not hasattr(model, "predict_proba"):
            raise RuntimeError("The configured artifact does not expose predict_proba")
        classes = getattr(model, "classes_", None)
        if classes is None or 1 not in list(classes):
            raise RuntimeError("The configured model does not expose positive class 1")

    def predict(self, supplied_features: dict[str, Any]) -> tuple[float | None, list[str], int, str | None]:
        unexpected = sorted(set(supplied_features) - set(self.features))
        if unexpected:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "unknown_features", "features": unexpected},
            )

        clean: dict[str, float] = {}
        for name, value in supplied_features.items():
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"code": "feature_must_be_numeric_or_null", "feature": name},
                )
            value_float = float(value)
            if not np.isfinite(value_float):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"code": "feature_must_be_finite", "feature": name},
                )
            clean[name] = value_float

        if not clean:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "no_non_missing_features"},
            )

        missing_features = [
            name for name in self.features if name not in clean
        ]
        completeness = len(clean) / len(self.features)
        if completeness < self.settings.low_completeness_fraction:
            # Do not produce even a research score when the input is too incomplete.
            # This guard is a prototype data-quality rule, not a clinical sufficiency threshold.
            return (
                None,
                missing_features,
                len(clean),
                "Score withheld because too few non-missing model features were supplied.",
            )

        # Missing fields above the completeness floor are passed as NaN only because
        # the research pipeline was trained with missing-value handling/native missing support.
        row = {name: clean.get(name, np.nan) for name in self.features}
        frame = pd.DataFrame([row], columns=self.features, dtype=float)
        try:
            probability_matrix = np.asarray(self.model.predict_proba(frame), dtype=float)
        except Exception as exc:
            # Do not expose features, patient context, or library internals.
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "model_inference_failed", "message": "Research model could not score this input."},
            ) from exc

        classes = list(self.model.classes_)
        positive_index = classes.index(1)
        if probability_matrix.shape != (1, len(classes)):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "invalid_model_output"},
            )
        score = float(probability_matrix[0, positive_index])
        if not np.isfinite(score) or score < 0 or score > 1:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "invalid_model_score"},
            )
        return score, missing_features, len(clean), None


def _metadata_matches(metadata: dict[str, Any], schema: dict[str, Any], settings: APISettings) -> None:
    meta_target = metadata.get("target_column")
    meta_features = metadata.get("feature_columns_in_order")
    expected_target = "target_sepsis_onset_next_6h"
    features = schema.get("feature_columns")
    if schema.get("target_column") != expected_target or meta_target != expected_target:
        raise RuntimeError("Model metadata target does not match the corrected six-hour onset schema")
    if not isinstance(features, list) or not features or not all(isinstance(item, str) for item in features):
        raise RuntimeError("Processed dataset schema has invalid feature_columns")
    if settings.environment not in {"test"} and len(features) != 40:
        raise RuntimeError("This model version expects the documented 40-feature PhysioNet schema")
    if any(name in features for name in (expected_target, "SepsisLabel", "patient_id")):
        raise RuntimeError("Target, source label and patient_id must not be model features")
    if meta_features != features:
        raise RuntimeError("Model metadata feature order does not match processed dataset schema")
    if schema.get("horizon_hours") != 6 or schema.get("source_label_shift_hours") != 6:
        raise RuntimeError("This API only supports the documented six-hour research target and source-label shift")
    meta_definition = metadata.get("target_definition")
    if meta_definition is not None and meta_definition != schema.get("target_definition"):
        raise RuntimeError("Model metadata target definition does not match processed dataset schema")
    # Verify both filename and model key when metadata records it.
    single = metadata.get("model_file")
    metadata_model_key = metadata.get("model_key")
    model_records = metadata.get("models", {})
    artifact_was_identified = False
    if isinstance(single, str):
        artifact_was_identified = True
        if settings.model_path.name != single:
            raise RuntimeError("Configured model artifact does not match the selected metadata file")
    if isinstance(metadata_model_key, str):
        if settings.model_key != metadata_model_key:
            raise RuntimeError("Configured model key does not match the selected metadata file")
    if isinstance(model_records, dict) and model_records:
        matched_records = {
            key: value for key, value in model_records.items()
            if isinstance(value, dict) and value.get("model_file") == settings.model_path.name
        }
        if matched_records:
            artifact_was_identified = True
            if settings.model_key not in matched_records:
                raise RuntimeError("Configured model key does not identify the configured artifact")
    if not artifact_was_identified:
        raise RuntimeError("Selected metadata does not identify the configured model artifact")


def create_app(
    settings: APISettings | None = None,
    *,
    model: Any | None = None,
    schema: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> FastAPI:
    settings = settings or APISettings.from_environment()
    docs_enabled = settings.environment not in {"production", "prod"}

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if app.state.runtime is None:
            if not settings.model_path.is_file():
                raise RuntimeError(
                    f"Model artifact not found: {settings.model_path}. "
                    "Train the corrected-target model and set BEDALLOCATION_MODEL_PATH."
                )
            if not settings.schema_path.is_file():
                raise RuntimeError(f"Dataset schema not found: {settings.schema_path}")
            if not settings.metadata_path.is_file():
                raise RuntimeError(f"Model metadata not found: {settings.metadata_path}")
            loaded_schema = json.loads(settings.schema_path.read_text(encoding="utf-8"))
            loaded_metadata = json.loads(settings.metadata_path.read_text(encoding="utf-8"))
            _metadata_matches(loaded_metadata, loaded_schema, settings)
            loaded_model = joblib.load(settings.model_path)  # Only load locally trusted artifacts.
            app.state.runtime = ModelRuntime(loaded_model, loaded_schema, loaded_metadata, settings)
        yield

    app = FastAPI(
        title="BedAllocation Research Inference API",
        description=(
            "Private research scoring endpoint. This service does not make clinical decisions "
            "and must not be used to determine ICU priority or allocation."
        ),
        version="0.1.0",
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )
    app.state.runtime = None
    if model is not None:
        if schema is None or metadata is None:
            raise ValueError("Tests injecting a model must also provide schema and metadata")
        _metadata_matches(metadata, schema, settings)
        app.state.runtime = ModelRuntime(model, schema, metadata, settings)

    async def require_api_key(
        request: Request,
        x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    ) -> None:
        expected = settings.api_key
        if not expected or len(expected) < 32:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "inference_auth_not_configured"},
            )
        if x_api_key is None or not hmac.compare_digest(x_api_key, expected):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "invalid_api_key"},
                headers={"WWW-Authenticate": "ApiKey"},
            )

    @app.get("/health", tags=["health"])
    async def health(request: Request) -> dict[str, Any]:
        ready = request.app.state.runtime is not None and len(settings.api_key) >= 32
        return {
            "status": "ok" if ready else "not_ready",
            "service": "bedallocation-research-inference",
            "ready": ready,
            "authentication_configured": len(settings.api_key) >= 32,
        }

    @app.get("/v1/model-info", response_model=None, dependencies=[Depends(require_api_key)], tags=["research"])
    async def model_info(request: Request) -> dict[str, Any]:
        runtime: ModelRuntime | None = request.app.state.runtime
        if runtime is None:
            raise HTTPException(status_code=503, detail={"code": "model_not_ready"})
        return {
            "model_key": settings.model_key,
            "model_version": settings.model_version,
            "target_column": runtime.target_column,
            "target_definition": runtime.target_definition,
            "feature_count": len(runtime.features),
            "feature_names": runtime.features,
            "score_type": "uncalibrated_model_score",
            "clinical_status": "research-only; not clinically validated; not an ICU-admission model",
            "test_results_are_provisional": True,
        }

    @app.post("/v1/predict", response_model=PredictResponse, dependencies=[Depends(require_api_key)], tags=["research"])
    async def predict(payload: PredictRequest, request: Request) -> PredictResponse:
        runtime: ModelRuntime | None = request.app.state.runtime
        if runtime is None:
            raise HTTPException(status_code=503, detail={"code": "model_not_ready"})
        score, missing_features, supplied_count, withheld_reason = runtime.predict(payload.features)
        completeness = supplied_count / len(runtime.features)
        return PredictResponse(
            request_id=str(uuid4()),
            generated_at_utc=datetime.now(timezone.utc).isoformat(),
            model_key=settings.model_key,
            model_version=settings.model_version,
            target_column=runtime.target_column,
            target_definition=runtime.target_definition,
            score=score,
            score_status="withheld" if score is None else "available",
            withheld_reason=withheld_reason,
            feature_completeness_fraction=round(completeness, 4),
            expected_feature_count=len(runtime.features),
            supplied_non_missing_feature_count=supplied_count,
            missing_feature_count=len(missing_features),
            missing_features=missing_features,
            low_feature_completeness=(completeness < settings.low_completeness_fraction),
            clinical_limitations=RESEARCH_LIMITATIONS,
        )

    @app.exception_handler(RequestValidationError)
    async def safe_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Avoid reflecting invalid input values that could contain sensitive data.
        return JSONResponse(
            status_code=422,
            content={"detail": {"code": "invalid_request", "message": "Request body is invalid."}},
        )

    @app.exception_handler(Exception)
    async def safe_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        # Keep exception details and any request data out of HTTP responses.
        return JSONResponse(
            status_code=500,
            content={"detail": {"code": "internal_error", "message": "Unexpected inference service error."}},
        )

    return app


app = create_app()
