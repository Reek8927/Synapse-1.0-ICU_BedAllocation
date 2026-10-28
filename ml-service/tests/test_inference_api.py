from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from fastapi.testclient import TestClient
import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

from bedallocation_ml.inference_api import APISettings, create_app


class FakeClassifier:
    classes_ = np.array([0, 1])

    def predict_proba(self, frame):
        # Deliberately return a deterministic *uncalibrated* test score.
        return np.array([[0.82, 0.18]], dtype=float)


class InferenceAPITests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        base = Path(self.tmp.name)
        self.features = ["HR", "O2Sat", "Temp"]
        self.schema = {
            "feature_columns": self.features,
            "target_column": "target_sepsis_onset_next_6h",
            "target_definition": (
                "In the next 1..6 hourly rows, inferred annotated sepsis onset; "
                "post-onset rows excluded."
            ),
            "horizon_hours": 6,
            "source_label_shift_hours": 6,
        }
        self.metadata = {
            "feature_columns_in_order": self.features,
            "target_column": self.schema["target_column"],
            "target_definition": self.schema["target_definition"],
            "models": {
                "hist_gradient_boosting": {
                    "model_file": "model.joblib",
                    "model_type": "test fake",
                }
            },
        }
        self.settings = APISettings(
            model_path=base / "model.joblib",
            schema_path=base / "schema.json",
            metadata_path=base / "metadata.json",
            api_key="x" * 40,
            model_key="hist_gradient_boosting",
            model_version="test-v1",
            environment="test",
            low_completeness_fraction=0.8,
        )
        self.client = TestClient(
            create_app(
                self.settings,
                model=FakeClassifier(),
                schema=self.schema,
                metadata=self.metadata,
            )
        )

    def tearDown(self):
        self.client.close()
        self.tmp.cleanup()

    def test_health_is_readiness_only(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ready"])


    def test_health_not_ready_without_configured_api_key(self):
        settings = APISettings(
            model_path=self.settings.model_path,
            schema_path=self.settings.schema_path,
            metadata_path=self.settings.metadata_path,
            api_key="",
            model_key="hist_gradient_boosting",
            model_version="test-v1",
            environment="test",
        )
        client = TestClient(create_app(
            settings, model=FakeClassifier(), schema=self.schema, metadata=self.metadata
        ))
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["ready"])
        self.assertFalse(response.json()["authentication_configured"])
        protected = client.get("/v1/model-info")
        self.assertEqual(protected.status_code, 503)
        client.close()

    def test_invalid_completeness_floor_is_rejected(self):
        bad_settings = APISettings(
            model_path=self.settings.model_path,
            schema_path=self.settings.schema_path,
            metadata_path=self.settings.metadata_path,
            api_key=self.settings.api_key,
            model_key=self.settings.model_key,
            model_version=self.settings.model_version,
            environment="test",
            low_completeness_fraction=0,
        )
        with self.assertRaises(RuntimeError):
            from bedallocation_ml.inference_api import ModelRuntime
            ModelRuntime(FakeClassifier(), self.schema, self.metadata, bad_settings)

    def test_model_info_requires_api_key(self):
        response = self.client.get("/v1/model-info")
        self.assertEqual(response.status_code, 401)
        response = self.client.get(
            "/v1/model-info", headers={"X-API-Key": self.settings.api_key}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["target_column"], self.schema["target_column"])

    def test_prediction_is_research_score_and_has_no_side_effects(self):
        response = self.client.post(
            "/v1/predict",
            headers={"X-API-Key": self.settings.api_key},
            json={"features": {"HR": 90, "O2Sat": 97}},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertIsNone(payload["score"])
        self.assertEqual(payload["score_status"], "withheld")
        self.assertIn("too few non-missing", payload["withheld_reason"])
        self.assertEqual(payload["score_type"], "uncalibrated_model_score")
        self.assertTrue(payload["low_feature_completeness"])
        self.assertAlmostEqual(payload["feature_completeness_fraction"], 2 / 3, places=3)
        self.assertFalse(payload["persisted"])
        self.assertFalse(payload["changes_patient_record"])
        self.assertFalse(payload["changes_queue_or_bed_status"])
        self.assertIn("Temp", payload["missing_features"])

    def test_prediction_is_available_when_completeness_floor_is_met(self):
        response = self.client.post(
            "/v1/predict",
            headers={"X-API-Key": self.settings.api_key},
            json={"features": {"HR": 90, "O2Sat": 97, "Temp": 37.1}},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["score"], 0.18)
        self.assertEqual(payload["score_status"], "available")
        self.assertIsNone(payload["withheld_reason"])
        self.assertFalse(payload["low_feature_completeness"])

    def test_unknown_features_are_rejected(self):
        response = self.client.post(
            "/v1/predict",
            headers={"X-API-Key": self.settings.api_key},
            json={"features": {"HR": 90, "patient_id": "do-not-accept"}},
        )
        self.assertEqual(response.status_code, 422)

    def test_non_numeric_or_boolean_values_are_rejected(self):
        for value in ["ninety", True]:
            response = self.client.post(
                "/v1/predict",
                headers={"X-API-Key": self.settings.api_key},
                json={"features": {"HR": value}},
            )
            self.assertEqual(response.status_code, 422, response.text)

        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as raised:
            self.client.app.state.runtime.predict({"HR": float("inf")})
        self.assertEqual(raised.exception.status_code, 422)

    def test_all_missing_values_are_rejected(self):
        response = self.client.post(
            "/v1/predict",
            headers={"X-API-Key": self.settings.api_key},
            json={"features": {"HR": None, "O2Sat": None}},
        )
        self.assertEqual(response.status_code, 422)


    def test_service_loads_model_from_trusted_local_artifact(self):
        base = Path(self.tmp.name)
        model_path = base / "model.joblib"
        schema_path = base / "schema.json"
        metadata_path = base / "metadata.json"
        # Exercise the same sklearn Pipeline shape used by the real HGB artifact.
        training = pd.DataFrame({
            "HR": [60, 65, 72, 80, 88, 92, 100, 105, 74, 83, 95, 110],
            "O2Sat": [99, 98, 97, 96, 94, 93, 91, 90, 98, 95, 92, 89],
            "Temp": [36.4, 36.5, 36.7, 37.0, 37.3, 37.6, 38.0, 38.2, 36.8, 37.1, np.nan, 38.4],
        })
        labels = np.array([0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1])
        trained_pipeline = Pipeline(steps=[
            ("imputer", SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True)),
            ("classifier", HistGradientBoostingClassifier(max_iter=3, min_samples_leaf=2, early_stopping=False, random_state=7)),
        ])
        trained_pipeline.fit(training, labels)
        joblib.dump(trained_pipeline, model_path)
        schema_path.write_text(json.dumps(self.schema), encoding="utf-8")
        metadata_path.write_text(json.dumps(self.metadata), encoding="utf-8")

        file_settings = APISettings(
            model_path=model_path,
            schema_path=schema_path,
            metadata_path=metadata_path,
            api_key=self.settings.api_key,
            model_key="hist_gradient_boosting",
            model_version="test-file-load-v1",
            environment="test",
        )
        with TestClient(create_app(file_settings)) as file_client:
            health = file_client.get("/health")
            self.assertEqual(health.status_code, 200)
            self.assertTrue(health.json()["ready"])
            response = file_client.post(
                "/v1/predict",
                headers={"X-API-Key": file_settings.api_key},
                json={"features": {"HR": 88}},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["model_version"], "test-file-load-v1")

    def test_invalid_body_does_not_echo_sensitive_input(self):
        sensitive = "synthetic-person-secret-value"
        response = self.client.post(
            "/v1/predict",
            headers={"X-API-Key": self.settings.api_key},
            json={"features": {"HR": 80}, "patient_name": sensitive},
        )
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(sensitive, response.text)

    def test_wrong_metadata_target_is_rejected(self):
        schema = dict(self.schema)
        schema["target_column"] = "target_icu_admission"
        with self.assertRaises(RuntimeError):
            from bedallocation_ml.inference_api import ModelRuntime
            ModelRuntime(FakeClassifier(), schema, self.metadata, self.settings)

    def test_incorrect_artifact_metadata_is_rejected(self):
        wrong = dict(self.metadata)
        wrong["target_column"] = "target_wrong"
        with self.assertRaises(RuntimeError):
            from bedallocation_ml.inference_api import _metadata_matches
            _metadata_matches(wrong, self.schema, self.settings)


if __name__ == "__main__":
    unittest.main()
