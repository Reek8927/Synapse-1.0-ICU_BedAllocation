"""Add a class-weighted XGBoost candidate to the corrected-target comparison.

This command uses training and validation splits only. It never reads test.csv.
The existing logistic-regression and histogram-gradient-boosting results are
loaded from the prior validation report and retained unchanged. XGBoost is saved
as a separate candidate; no model is selected or deployed automatically.
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from xgboost import XGBClassifier

from .train_baseline import evaluate_scores, load_split

PRIOR_REPORT_NAME = "sepsis_onset_model_comparison_validation.json"
COMBINED_REPORT_NAME = "sepsis_onset_xgboost_model_comparison_validation.json"
MODEL_FILENAME = "sepsis_onset_next_6h_xgboost_weighted.joblib"
METADATA_FILENAME = "sepsis_onset_xgboost_model_metadata.json"


def _validate_schema(schema: dict[str, Any]) -> tuple[list[str], str]:
    features = schema.get("feature_columns")
    target = schema.get("target_column")
    if not isinstance(features, list) or not features:
        raise ValueError("schema.json must contain a non-empty feature_columns list")
    if not isinstance(target, str) or not target.startswith("target_sepsis_onset_next_"):
        raise ValueError(
            "Expected the corrected sepsis-onset target. Use data/processed_onset."
        )
    if target in features or "SepsisLabel" in features or "patient_id" in features:
        raise ValueError("Target, source label and patient_id must never be model features")
    return features, target


def _prepare_xgb_features(frame: pd.DataFrame) -> pd.DataFrame:
    """XGBoost handles NaN natively; normalize infinities to missing values."""
    result = frame.replace([np.inf, -np.inf], np.nan)
    return result


def _validate_prior_report(
    prior_report_path: Path,
    target_column: str,
    features: list[str],
) -> dict[str, Any]:
    if not prior_report_path.exists():
        raise FileNotFoundError(
            f"Prior comparison report not found: {prior_report_path}. "
            "First run the existing corrected-target comparison command."
        )
    prior = json.loads(prior_report_path.read_text(encoding="utf-8"))
    if prior.get("target_column") != target_column:
        raise ValueError(
            "Prior comparison target does not match current schema. "
            "Do not combine results from different target definitions."
        )
    if prior.get("features") != features:
        raise ValueError(
            "Prior comparison feature order does not match current schema. "
            "Re-run the corrected-target comparison before adding XGBoost."
        )
    models = prior.get("models")
    if not isinstance(models, dict) or not {
        "logistic_full_train", "hist_gradient_boosting"
    }.issubset(models):
        raise ValueError(
            "Prior validation report must include logistic_full_train and "
            "hist_gradient_boosting results."
        )
    return prior


def _make_model(
    y_train: pd.Series,
    random_state: int,
    n_estimators: int,
    early_stopping_rounds: int,
    n_jobs: int,
) -> XGBClassifier:
    positives = int((y_train == 1).sum())
    negatives = int((y_train == 0).sum())
    if positives == 0 or negatives == 0:
        raise ValueError("Training set must include positive and negative target rows")
    scale_pos_weight = negatives / positives
    return XGBClassifier(
        objective="binary:logistic",
        eval_metric="aucpr",
        tree_method="hist",
        n_estimators=n_estimators,
        learning_rate=0.05,
        max_depth=5,
        min_child_weight=10,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=5.0,
        reg_alpha=0.0,
        max_bin=256,
        scale_pos_weight=scale_pos_weight,
        early_stopping_rounds=early_stopping_rounds,
        random_state=random_state,
        n_jobs=n_jobs,
        verbosity=0,
    )


def compare_xgboost(
    data_dir: Path,
    artifact_dir: Path,
    prior_report_path: Path | None = None,
    random_state: int = 42,
    n_estimators: int = 600,
    early_stopping_rounds: int = 40,
    n_jobs: int = -1,
    overwrite: bool = False,
) -> dict[str, Any]:
    """Train weighted XGBoost and append validation metrics to a new report."""
    if n_estimators < 1:
        raise ValueError("n_estimators must be at least 1")
    if early_stopping_rounds < 1:
        raise ValueError("early_stopping_rounds must be at least 1")

    data_dir = data_dir.resolve()
    artifact_dir = artifact_dir.resolve()
    schema_path = data_dir / "schema.json"
    if not schema_path.exists():
        raise FileNotFoundError(f"Missing {schema_path}; prepare the corrected dataset first")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    features, target_column = _validate_schema(schema)

    prior_path = (prior_report_path or (artifact_dir / PRIOR_REPORT_NAME)).resolve()
    prior = _validate_prior_report(prior_path, target_column, features)

    model_path = artifact_dir / MODEL_FILENAME
    report_path = artifact_dir / COMBINED_REPORT_NAME
    metadata_path = artifact_dir / METADATA_FILENAME
    existing = [p for p in (model_path, report_path, metadata_path) if p.exists()]
    if existing and not overwrite:
        paths = ", ".join(str(p) for p in existing)
        raise FileExistsError(
            f"XGBoost outputs already exist: {paths}. Review them, or pass --overwrite "
            "to intentionally replace this validation experiment."
        )

    # Load training and validation only. Do not load test.csv here.
    print(f"Loading training split from {data_dir / 'train.csv'}...")
    X_train, y_train = load_split(data_dir / "train.csv", features, target_column)
    print(f"Loading validation split from {data_dir / 'validation.csv'}...")
    X_validation, y_validation = load_split(
        data_dir / "validation.csv", features, target_column
    )
    if y_train.nunique() != 2 or y_validation.nunique() != 2:
        raise ValueError("Train and validation splits must each contain both target classes")

    X_train = _prepare_xgb_features(X_train)
    X_validation = _prepare_xgb_features(X_validation)
    model = _make_model(
        y_train=y_train,
        random_state=random_state,
        n_estimators=n_estimators,
        early_stopping_rounds=early_stopping_rounds,
        n_jobs=n_jobs,
    )
    scale_pos_weight = float(model.get_params()["scale_pos_weight"])
    started = time.perf_counter()
    print(
        f"Training weighted XGBoost on {len(y_train):,} rows "
        f"(scale_pos_weight={scale_pos_weight:.2f}, max_estimators={n_estimators})..."
    )
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_validation, y_validation)],
        verbose=False,
    )
    training_seconds = time.perf_counter() - started

    class_labels = list(model.classes_)
    if 1 not in class_labels:
        raise ValueError("Fitted XGBoost model does not contain positive class 1")
    scores = model.predict_proba(X_validation)[:, class_labels.index(1)]
    if not np.isfinite(scores).all():
        raise ValueError("XGBoost produced non-finite validation scores")
    validation_metrics = evaluate_scores(y_validation, scores, threshold=0.5)
    validation_metrics["score_interpretation"] = (
        "Uncalibrated class-weighted XGBoost predict_proba score; threshold 0.5 "
        "is a technical benchmark only, not a clinical cutoff."
    )
    validation_metrics["threshold_note"] = (
        "No threshold was selected for clinical or operational use."
    )

    best_iteration = getattr(model, "best_iteration", None)
    best_score = getattr(model, "best_score", None)
    xgb_model_result = {
        "model_file": MODEL_FILENAME,
        "model_type": "XGBClassifier with histogram trees, native missing-value handling, and class weighting",
        "xgboost_version": xgb.__version__,
        "training_seconds": round(training_seconds, 3),
        "train_rows_used": int(len(y_train)),
        "train_positive_fraction": float(y_train.mean()),
        "scale_pos_weight": scale_pos_weight,
        "max_estimators": n_estimators,
        "early_stopping_rounds": early_stopping_rounds,
        "best_iteration_zero_based": int(best_iteration) if best_iteration is not None else None,
        "best_validation_aucpr_from_xgboost": float(best_score) if best_score is not None else None,
        "validation_metrics": validation_metrics,
    }

    # Keep the original report intact. The combined report is a separate file.
    combined = copy.deepcopy(prior)
    combined["created_at_utc_xgboost_added"] = datetime.now(timezone.utc).isoformat()
    combined["xgboost_experiment"] = {
        "model_key": "xgboost_hist_weighted",
        "test_split_used": False,
        "xgboost_version": xgb.__version__,
        "early_stopping_metric": "aucpr on validation split",
        "class_weighting": "scale_pos_weight = train negatives / train positives",
        "notes": [
            "XGBoost fit used train.csv and validation.csv only.",
            "Validation metrics are candidate-selection metrics, not an independent final evaluation.",
            "Class weighting can affect probability calibration; scores are not calibrated.",
            "The held-out test split was not read by this command.",
        ],
    }
    combined.setdefault("models", {})["xgboost_hist_weighted"] = xgb_model_result
    ranked = sorted(
        combined["models"].items(),
        key=lambda item: item[1].get("validation_metrics", {}).get(
            "average_precision_pr_auc", -1.0
        ),
        reverse=True,
    )
    combined["validation_rank_by_average_precision"] = [key for key, _ in ranked]
    combined["test_split_used"] = False
    combined["clinical_status"] = (
        "Research only; not clinically validated; not an ICU-admission model."
    )

    artifact_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)
    report_path.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    metadata = {
        "created_at_utc": combined["created_at_utc_xgboost_added"],
        "model_file": MODEL_FILENAME,
        "feature_columns_in_order": features,
        "target_column": target_column,
        "target_definition": schema.get("target_definition"),
        "horizon_hours": schema.get("horizon_hours"),
        "source_dataset": schema.get("source_dataset"),
        "xgboost_version": xgb.__version__,
        "scale_pos_weight": scale_pos_weight,
        "parameters": model.get_params(),
        "best_iteration_zero_based": int(best_iteration) if best_iteration is not None else None,
        "best_validation_aucpr_from_xgboost": float(best_score) if best_score is not None else None,
        "validation_metrics": validation_metrics,
        "clinical_status": "research only; not clinically validated; not an ICU-admission model",
    }
    metadata_path.write_text(json.dumps(metadata, indent=2, default=str), encoding="utf-8")

    print(
        "xgboost_hist_weighted: validation PR-AUC="
        f"{validation_metrics['average_precision_pr_auc']:.4f}; "
        f"ROC-AUC={validation_metrics['roc_auc']:.4f}; "
        f"precision@0.5={validation_metrics['precision_at_threshold']:.4f}; "
        f"recall@0.5={validation_metrics['recall_at_threshold']:.4f}; "
        f"flagged={float(np.mean(scores >= 0.5)):.2%}"
    )
    print(f"Best iteration (zero-based): {best_iteration}")
    print(f"Saved XGBoost model: {model_path}")
    print(f"Saved combined validation comparison: {report_path}")
    print("The held-out test split was not loaded or evaluated by this command.")
    print("Do not connect any candidate to live ICU priority or allocation.")
    return combined


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("data/processed_onset"))
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts_onset"))
    parser.add_argument(
        "--prior-report", type=Path, default=None,
        help="Existing validation comparison report; defaults to <artifact-dir>/" + PRIOR_REPORT_NAME,
    )
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--n-estimators", type=int, default=600)
    parser.add_argument("--early-stopping-rounds", type=int, default=40)
    parser.add_argument("--n-jobs", type=int, default=-1)
    parser.add_argument("--overwrite", action="store_true", help="Replace existing XGBoost candidate outputs")
    args = parser.parse_args(argv)
    try:
        compare_xgboost(
            data_dir=args.data_dir,
            artifact_dir=args.artifact_dir,
            prior_report_path=args.prior_report,
            random_state=args.random_state,
            n_estimators=args.n_estimators,
            early_stopping_rounds=args.early_stopping_rounds,
            n_jobs=args.n_jobs,
            overwrite=args.overwrite,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
