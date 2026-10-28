"""Train and compare full-data logistic and histogram-gradient-boosting models.

Only the training split is used for fitting and only the validation split is
used for model comparison. The held-out test split is deliberately never read
by this command; use it once after selecting a candidate by validation evidence.
This is a research experiment, not a clinical validation or ICU allocation tool.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .train_baseline import cap_training_rows, evaluate_scores, load_split


def build_models(random_state: int, hgb_max_iter: int) -> dict[str, Pipeline]:
    """Return comparable pipelines using the same features and class weighting."""
    logistic = Pipeline(steps=[
        ("imputer", SimpleImputer(
            strategy="median", add_indicator=True, keep_empty_features=True
        )),
        ("scaler", StandardScaler()),
        ("classifier", LogisticRegression(
            class_weight="balanced",
            solver="lbfgs",
            max_iter=300,
            random_state=random_state,
        )),
    ])

    gradient_boosting = Pipeline(steps=[
        ("imputer", SimpleImputer(
            strategy="median", add_indicator=True, keep_empty_features=True
        )),
        ("classifier", HistGradientBoostingClassifier(
            loss="log_loss",
            learning_rate=0.08,
            max_iter=hgb_max_iter,
            max_leaf_nodes=31,
            min_samples_leaf=100,
            l2_regularization=1.0,
            class_weight="balanced",
            early_stopping=False,
            random_state=random_state,
        )),
    ])
    return {
        "logistic_full_train": logistic,
        "hist_gradient_boosting": gradient_boosting,
    }


def _positive_scores(model: Pipeline, X: pd.DataFrame) -> np.ndarray:
    classifier = model.named_steps["classifier"]
    classes = list(classifier.classes_)
    if 1 not in classes:
        raise ValueError("Fitted model does not contain the positive class 1")
    scores = model.predict_proba(X)[:, classes.index(1)]
    if not np.isfinite(scores).all():
        raise ValueError("Model returned non-finite validation scores")
    return scores


def compare_models(
    data_dir: Path,
    artifact_dir: Path,
    max_train_rows: int = 0,
    random_state: int = 42,
    hgb_max_iter: int = 100,
) -> dict:
    """Fit both models on train.csv and compare on validation.csv only."""
    if max_train_rows < 0:
        raise ValueError("max_train_rows must be zero (all rows) or a positive integer")
    if hgb_max_iter < 1:
        raise ValueError("hgb_max_iter must be at least 1")

    schema_path = data_dir / "schema.json"
    if not schema_path.exists():
        raise FileNotFoundError(f"Missing {schema_path}; run prepare_dataset first")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    features = schema.get("feature_columns")
    target_column = schema.get("target_column")
    if not isinstance(features, list) or not features:
        raise ValueError("schema.json does not contain feature_columns")
    if not isinstance(target_column, str) or not target_column.startswith("target_sepsis_onset_next_"):
        raise ValueError("Target column in schema.json is missing or unexpected; rerun prepare_dataset using the corrected onset target")
    if target_column in features or "SepsisLabel" in features or "patient_id" in features:
        raise ValueError("Target/source label/patient ID must not be model features")

    train_path = data_dir / "train.csv"
    X_train, y_train = load_split(train_path, features, target_column)
    total_train_rows = len(y_train)
    X_train, y_train, _ = cap_training_rows(
        X_train, y_train, max_train_rows, random_state
    )
    if y_train.nunique() < 2:
        raise ValueError("Training data has only one target class")

    # Load validation after training data. Do not load test.csv here: candidate
    # selection must not be influenced by the final held-out test results.
    X_validation, y_validation = load_split(
        data_dir / "validation.csv", features, target_column
    )
    model_specs = build_models(random_state, hgb_max_iter)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    result: dict[str, object] = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "target_column": target_column,
        "target_definition": schema["target_definition"],
        "horizon_hours": schema["horizon_hours"],
        "feature_count": len(features),
        "features": features,
        "train_rows_available": total_train_rows,
        "train_rows_used": len(y_train),
        "train_positive_fraction_used": float(y_train.mean()),
        "validation_rows": len(y_validation),
        "validation_positive_fraction": float(y_validation.mean()),
        "validation_threshold_note": "Threshold 0.5 is a reporting benchmark only, not a clinical cutoff.",
        "selection_policy": "Compare candidates primarily by validation average precision (PR-AUC), then review recall, precision, false-positive burden, calibration and patient-level metrics. Do not inspect test metrics during candidate selection.",
        "test_split_used": False,
        "clinical_status": "research experiment only; not clinically validated; not an ICU-admission model",
        "models": {},
    }

    for key, model in model_specs.items():
        started = time.perf_counter()
        print(f"Training {key.replace('_', ' ')} on {len(y_train):,} rows...")
        model.fit(X_train, y_train)
        training_seconds = time.perf_counter() - started
        scores = _positive_scores(model, X_validation)
        validation_metrics = evaluate_scores(y_validation, scores, threshold=0.5)
        validation_metrics["score_interpretation"] = (
            "Uncalibrated predict_proba score. Threshold 0.5 is a technical benchmark, not a clinical cutoff."
        )
        model_filename = (
            "sepsis_onset_next_6h_logistic_full_train.joblib"
            if key == "logistic_full_train"
            else "sepsis_onset_next_6h_hist_gradient_boosting.joblib"
        )
        model_path = artifact_dir / model_filename
        joblib.dump(model, model_path)
        result["models"][key] = {
            "model_file": model_filename,
            "model_type": (
                "median imputation + missingness indicators + standard scaling + balanced logistic regression"
                if key == "logistic_full_train"
                else f"median imputation + missingness indicators + balanced HistGradientBoostingClassifier ({hgb_max_iter} iterations)"
            ),
            "training_seconds": round(training_seconds, 3),
            "validation_metrics": validation_metrics,
        }
        print(
            f"{key}: validation PR-AUC="
            f"{validation_metrics['average_precision_pr_auc']:.4f}; "
            f"ROC-AUC={validation_metrics['roc_auc']:.4f}; "
            f"precision@0.5={validation_metrics['precision_at_threshold']:.4f}; "
            f"recall@0.5={validation_metrics['recall_at_threshold']:.4f}; "
            f"flagged={float(np.mean(scores >= 0.5)):.2%}"
        )
        del scores

    # The sort order is only a reproducible validation ranking. It is not a
    # clinical recommendation and does not trigger automatic model deployment.
    ranked = sorted(
        result["models"].items(),
        key=lambda item: item[1]["validation_metrics"]["average_precision_pr_auc"],
        reverse=True,
    )
    result["validation_rank_by_average_precision"] = [key for key, _ in ranked]

    report_path = artifact_dir / "sepsis_onset_model_comparison_validation.json"
    report_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    metadata = {
        "created_at_utc": result["created_at_utc"],
        "feature_columns_in_order": features,
        "target_column": target_column,
        "target_definition": schema["target_definition"],
        "horizon_hours": schema["horizon_hours"],
        "source_dataset": schema.get("source_dataset"),
        "models": {
            key: {"model_file": value["model_file"], "model_type": value["model_type"]}
            for key, value in result["models"].items()
        },
        "clinical_status": result["clinical_status"],
    }
    (artifact_dir / "sepsis_onset_comparison_model_metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    print(f"Saved validation-only comparison: {report_path.resolve()}")
    print("The held-out test split was not loaded or evaluated by this command.")
    print("Do not connect either model to live ICU priority or allocation.")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("data/processed_onset"))
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts"))
    parser.add_argument(
        "--max-train-rows", type=int, default=0,
        help="Optional stratified row cap for a quick experiment; default 0 uses all training rows",
    )
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument(
        "--hgb-max-iter", type=int, default=100,
        help="Number of boosting iterations (default 100)",
    )
    args = parser.parse_args(argv)
    try:
        compare_models(
            data_dir=args.data_dir,
            artifact_dir=args.artifact_dir,
            max_train_rows=args.max_train_rows,
            random_state=args.random_state,
            hgb_max_iter=args.hgb_max_iter,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
