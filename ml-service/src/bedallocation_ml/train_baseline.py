"""Train and evaluate a first baseline using patient-separated prepared data."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split



def load_split(path: Path, feature_columns: list[str], target_column: str) -> tuple[pd.DataFrame, pd.Series]:
    required = [*feature_columns, target_column]
    if not path.exists():
        raise FileNotFoundError(f"Missing prepared split {path}; run prepare_dataset first")
    dtype_map = {name: "float32" for name in feature_columns}
    dtype_map[target_column] = "int8"
    frame = pd.read_csv(path, usecols=required, dtype=dtype_map, low_memory=False)
    if frame.empty:
        raise ValueError(f"Prepared split has no rows: {path}")
    X = frame[feature_columns]
    y = frame[target_column].astype("int8")
    if y.nunique() < 2:
        raise ValueError(f"Prepared split {path} contains only one target class")
    return X, y


def cap_training_rows(X: pd.DataFrame, y: pd.Series, max_rows: int, random_state: int) -> tuple[pd.DataFrame, pd.Series, int]:
    original_count = len(y)
    if max_rows <= 0 or original_count <= max_rows:
        return X, y, original_count
    if y.value_counts().min() < 2:
        raise ValueError("The training split needs at least two rows in each class")
    indices = np.arange(original_count)
    try:
        selected, _unused = train_test_split(
            indices,
            train_size=max_rows,
            random_state=random_state,
            stratify=y.to_numpy(),
        )
    except ValueError as exc:
        raise ValueError(
            f"Cannot make a stratified sample of {max_rows:,} rows from this training split: {exc}"
        ) from exc
    return X.iloc[selected].reset_index(drop=True), y.iloc[selected].reset_index(drop=True), original_count


def evaluate_scores(y_true: pd.Series, scores: np.ndarray, threshold: float = 0.5) -> dict:
    predictions = (scores >= threshold).astype("int8")
    matrix = confusion_matrix(y_true, predictions, labels=[0, 1])
    result = {
        "rows_evaluated": int(len(y_true)),
        "positive_target_rows": int(y_true.sum()),
        "positive_fraction": float(y_true.mean()),
        "average_precision_pr_auc": float(average_precision_score(y_true, scores)),
        "roc_auc": float(roc_auc_score(y_true, scores)) if y_true.nunique() == 2 else None,
        "threshold_for_confusion_metrics_only": threshold,
        "precision_at_threshold": float(precision_score(y_true, predictions, zero_division=0)),
        "recall_at_threshold": float(recall_score(y_true, predictions, zero_division=0)),
        "f1_at_threshold": float(f1_score(y_true, predictions, zero_division=0)),
        "accuracy_at_threshold": float(accuracy_score(y_true, predictions)),
        "confusion_matrix_labels_0_then_1": matrix.tolist(),
    }
    return result


def train_and_evaluate(data_dir: Path, artifact_dir: Path, max_train_rows: int, random_state: int) -> dict:
    schema_path = data_dir / "schema.json"
    if not schema_path.exists():
        raise FileNotFoundError(f"Missing {schema_path}; run prepare_dataset first")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    features = schema["feature_columns"]
    target_column = schema.get("target_column")
    if not isinstance(target_column, str) or not target_column.startswith("target_sepsis_onset_next_"):
        raise ValueError("Target column in schema.json is missing or unexpected; rerun prepare_dataset using the corrected onset target")

    X_train, y_train = load_split(data_dir / "train.csv", features, target_column)
    total_train_rows = len(y_train)
    X_train, y_train, _ = cap_training_rows(X_train, y_train, max_train_rows, random_state)
    if y_train.nunique() < 2:
        raise ValueError("Sampled training data has only one target class")

    model = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True)),
        ("scaler", StandardScaler()),
        ("classifier", LogisticRegression(
            class_weight="balanced",
            solver="lbfgs",
            max_iter=300,
            random_state=random_state,
        )),
    ])
    print(f"Training baseline on {len(y_train):,} of {total_train_rows:,} training rows...")
    model.fit(X_train, y_train)
    del X_train, y_train

    metrics: dict[str, object] = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "model_type": "median imputation + missingness indicators + standard scaling + balanced logistic regression",
        "target_column": target_column,
        "target_definition": schema["target_definition"],
        "horizon_hours": schema["horizon_hours"],
        "feature_count": len(features),
        "features": features,
        "train_rows_available": total_train_rows,
        "train_rows_used": min(total_train_rows, max_train_rows) if max_train_rows > 0 else total_train_rows,
        "train_positive_fraction_available": float(pd.read_csv(
            data_dir / "train.csv", usecols=[target_column], dtype={target_column: "int8"}
        )[target_column].mean()),
        "class_weight": "balanced",
        "clinical_status": "research baseline only; not clinically validated; not an ICU-admission model",
        "metrics": {},
    }

    for split_name in ["validation"]:
        X_eval, y_eval = load_split(data_dir / f"{split_name}.csv", features, target_column)
        scores = model.predict_proba(X_eval)[:, list(model.named_steps["classifier"].classes_).index(1)]
        split_metrics = evaluate_scores(y_eval, scores, threshold=0.5)
        split_metrics["score_interpretation"] = (
            "Uncalibrated model score from predict_proba; threshold 0.5 is a technical benchmark only, not a clinical cutoff."
        )
        metrics["metrics"][split_name] = split_metrics
        print(
            f"{split_name}: PR-AUC={split_metrics['average_precision_pr_auc']:.4f}; "
            f"ROC-AUC={split_metrics['roc_auc'] if split_metrics['roc_auc'] is not None else 'N/A'}; "
            f"recall@0.5={split_metrics['recall_at_threshold']:.4f}"
        )
        del X_eval, y_eval, scores

    artifact_dir.mkdir(parents=True, exist_ok=True)
    model_path = artifact_dir / "sepsis_onset_next_6h_logistic_baseline.joblib"
    metadata_path = artifact_dir / "sepsis_onset_next_6h_model_metadata.json"
    metrics_path = artifact_dir / "sepsis_onset_next_6h_evaluation_metrics.json"
    joblib.dump(model, model_path)
    model_metadata = {
        "model_file": model_path.name,
        "created_at_utc": metrics["created_at_utc"],
        "feature_columns_in_order": features,
        "target_column": target_column,
        "target_definition": schema["target_definition"],
        "horizon_hours": schema["horizon_hours"],
        "source_dataset": schema["source_dataset"],
        "model_type": metrics["model_type"],
        "clinical_status": metrics["clinical_status"],
    }
    metadata_path.write_text(json.dumps(model_metadata, indent=2), encoding="utf-8")
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"Saved local development model: {model_path.resolve()}")
    print(f"Saved evaluation metrics: {metrics_path.resolve()}")
    print("The held-out test split was not loaded or evaluated by this command.")
    print("Do not connect this model to live ICU priority or allocation until independently reviewed and validated.")
    return metrics


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("data/processed_onset"))
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--max-train-rows", type=int, default=250_000, help="Cap for local baseline training; set 0 to use all training rows")
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args(argv)
    if args.max_train_rows < 0:
        parser.error("--max-train-rows must be zero (all rows) or a positive integer")
    try:
        train_and_evaluate(args.data_dir, args.artifact_dir, args.max_train_rows, args.random_state)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
