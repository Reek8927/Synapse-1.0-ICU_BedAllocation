"""Evaluate one selected onset model on the held-out test split once."""
from __future__ import annotations
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
import joblib
import numpy as np
from .train_baseline import evaluate_scores, load_split

MODEL_FILES = {
    "logistic_baseline": "sepsis_onset_next_6h_logistic_baseline.joblib",
    "logistic_full_train": "sepsis_onset_next_6h_logistic_full_train.joblib",
    "hist_gradient_boosting": "sepsis_onset_next_6h_hist_gradient_boosting.joblib",
}


def evaluate_test(data_dir: Path, artifact_dir: Path, model_key: str, threshold: float = 0.5) -> dict:
    """Run the one-time final-split evaluation; do not overwrite an existing report."""
    if model_key not in MODEL_FILES:
        raise ValueError(f"Unknown model_key {model_key!r}; choose from {sorted(MODEL_FILES)}")
    schema_path = data_dir / "schema.json"
    if not schema_path.exists():
        raise FileNotFoundError(f"Missing {schema_path}; run prepare_dataset first")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    target_column = schema.get("target_column")
    if not isinstance(target_column, str) or not target_column.startswith("target_sepsis_onset_next_"):
        raise ValueError("Prepared schema is not using the corrected sepsis-onset target")
    if schema.get("source_label_shift_hours") != 6:
        raise ValueError("Unexpected source label shift; review schema before test evaluation")

    model_path = artifact_dir / MODEL_FILES[model_key]
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}; run model comparison first")
    report_path = artifact_dir / f"{model_path.stem}_test_evaluation.json"
    if report_path.exists():
        raise FileExistsError(
            f"Test report already exists: {report_path}. Refusing to overwrite or repeat test evaluation."
        )

    features = schema["feature_columns"]
    X_test, y_test = load_split(data_dir / "test.csv", features, target_column)
    model = joblib.load(model_path)
    classifier = model.named_steps["classifier"]
    classes = list(classifier.classes_)
    if 1 not in classes:
        raise ValueError("Model does not contain the positive target class")
    scores = model.predict_proba(X_test)[:, classes.index(1)]
    if not np.isfinite(scores).all():
        raise ValueError("Model returned non-finite test scores")
    metrics = evaluate_scores(y_test, scores, threshold=threshold)
    result = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "model_key": model_key,
        "model_file": model_path.name,
        "target_column": target_column,
        "target_definition": schema["target_definition"],
        "source_label_shift_hours": schema["source_label_shift_hours"],
        "evaluation_split": "test",
        "metrics": metrics,
        "threshold_note": "This threshold is a reporting benchmark, not a clinical cutoff.",
        "clinical_status": "Research only; not clinically validated; not an ICU-admission model.",
        "evaluation_caveat": (
            "This test split was examined in an earlier project iteration under a different, flawed target. "
            "Treat results as provisional and seek an external/prospective evaluation before any clinical use."
        ),
    }
    report_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"Saved test report: {report_path.resolve()}")
    print("Do not connect this model to live ICU priority or allocation.")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("data/processed_onset"))
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--model-key", choices=sorted(MODEL_FILES), required=True)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args(argv)
    try:
        evaluate_test(args.data_dir, args.artifact_dir, args.model_key, args.threshold)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
