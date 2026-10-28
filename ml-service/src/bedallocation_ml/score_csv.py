"""Score a CSV of hourly feature rows with a locally trained model (research only)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import pandas as pd


def score_csv(model_path: Path, metadata_path: Path, input_csv: Path, output_csv: Path) -> None:
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    feature_columns = metadata["feature_columns_in_order"]
    model = joblib.load(model_path)
    data = pd.read_csv(input_csv)
    if data.empty:
        raise ValueError("Input CSV contains no rows")
    available = set(data.columns)
    if not available.intersection(feature_columns):
        raise ValueError("Input CSV does not contain any known model feature columns")
    aligned = data.reindex(columns=feature_columns)
    for column in feature_columns:
        aligned[column] = pd.to_numeric(aligned[column], errors="coerce").astype("float32")
    positive_index = list(model.named_steps["classifier"].classes_).index(1)
    scores = model.predict_proba(aligned)[:, positive_index]
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({
        "row_number": range(1, len(scores) + 1),
        "uncalibrated_model_score": scores,
        "interpretation": "Research-only score for inferred sepsis onset in the next six hours; not an ICU recommendation",
    }).to_csv(output_csv, index=False)
    print(f"Wrote {len(scores):,} research-only scores to {output_csv.resolve()}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=Path("artifacts/sepsis_onset_next_6h_logistic_baseline.joblib"))
    parser.add_argument("--metadata", type=Path, default=Path("artifacts/sepsis_onset_next_6h_model_metadata.json"))
    parser.add_argument("--input-csv", type=Path, required=True, help="CSV of hourly feature rows using the model's feature names")
    parser.add_argument("--output-csv", type=Path, default=Path("artifacts/research_scores.csv"))
    args = parser.parse_args(argv)
    try:
        score_csv(args.model, args.metadata, args.input_csv, args.output_csv)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
