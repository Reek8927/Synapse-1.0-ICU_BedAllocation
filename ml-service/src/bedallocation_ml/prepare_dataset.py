"""Prepare patient-separated train/validation/test CSVs from raw PSV files."""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

from bedallocation_ml.data import (
    SEPSIS_LABEL,
    SOURCE_LABEL_SHIFT_HOURS,
    list_patient_files,
    patient_id_for_file,
    patient_target_presence,
    read_header,
    read_patient_dataset,
    target_column_for_horizon,
)

DEFAULT_HORIZON = 6


def _split_patients(patient_meta: pd.DataFrame, random_state: int) -> dict[str, set[str]]:
    if len(patient_meta) < 20:
        raise ValueError(
            "At least 20 usable patient files are recommended for a stratified "
            "70/15/15 patient-level split. Add more raw training files."
        )
    counts = patient_meta["has_positive_target"].value_counts()
    if len(counts) < 2 or int(counts.min()) < 8:
        raise ValueError(
            "Both patient-level target classes need at least eight patients for this "
            "split. Check the labels or use more training files."
        )

    train_meta, temp_meta = train_test_split(
        patient_meta,
        test_size=0.30,
        random_state=random_state,
        stratify=patient_meta["has_positive_target"],
    )
    val_meta, test_meta = train_test_split(
        temp_meta,
        test_size=0.50,
        random_state=random_state,
        stratify=temp_meta["has_positive_target"],
    )
    splits = {
        "train": set(train_meta["patient_id"].tolist()),
        "validation": set(val_meta["patient_id"].tolist()),
        "test": set(test_meta["patient_id"].tolist()),
    }
    if (splits["train"] & splits["validation"]) or (splits["train"] & splits["test"]) or (splits["validation"] & splits["test"]):
        raise RuntimeError("Patient leakage detected across data splits")
    return splits


def prepare_dataset(raw_dir: Path, output_dir: Path, horizon: int = DEFAULT_HORIZON, random_state: int = 42) -> dict:
    files = list_patient_files(raw_dir)
    header = read_header(files[0])
    feature_columns = [column for column in header if column != SEPSIS_LABEL]
    target_column = target_column_for_horizon(horizon)

    metadata_rows: list[dict] = []
    skipped_short = 0
    for index, path in enumerate(files, start=1):
        this_header = read_header(path)
        if set(this_header) != set(header):
            raise ValueError(f"Feature columns differ between {files[0]} and {path}")
        patient_id = patient_id_for_file(path, raw_dir)
        has_positive = patient_target_presence(path, horizon=horizon)
        if has_positive is None:
            skipped_short += 1
            continue
        metadata_rows.append({
            "patient_id": patient_id,
            "path": str(path.resolve()),
            "has_positive_target": int(has_positive),
        })
        if index % 1000 == 0:
            print(f"Inspected {index:,}/{len(files):,} patient files...")

    patient_meta = pd.DataFrame(metadata_rows)
    if patient_meta.empty:
        raise ValueError("No patient files had enough rows to create the target")

    splits = _split_patients(patient_meta, random_state=random_state)
    output_dir.mkdir(parents=True, exist_ok=True)
    for split_name in ["train", "validation", "test"]:
        destination = output_dir / f"{split_name}.csv"
        if destination.exists():
            destination.unlink()

    rows_by_split = Counter()
    positive_rows_by_split = Counter()
    patients_by_split = Counter()
    metadata_lookup = {row["patient_id"]: Path(row["path"]) for row in metadata_rows}

    for split_name, patient_ids in splits.items():
        destination = output_dir / f"{split_name}.csv"
        header_written = False
        for patient_id in sorted(patient_ids):
            file_path = metadata_lookup[patient_id]
            patient_data = read_patient_dataset(file_path, raw_dir, feature_columns, horizon=horizon)
            if patient_data.empty:
                continue
            positive_count = int(patient_data[target_column].sum())
            rows_by_split[split_name] += len(patient_data)
            positive_rows_by_split[split_name] += positive_count
            patients_by_split[split_name] += 1
            patient_data.to_csv(destination, mode="a", index=False, header=not header_written)
            header_written = True
        if not header_written:
            raise ValueError(f"The {split_name} split did not produce any rows")
        print(
            f"{split_name}: {patients_by_split[split_name]:,} patients, "
            f"{rows_by_split[split_name]:,} hourly samples, "
            f"{positive_rows_by_split[split_name]:,} positive targets"
        )

    schema = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_dataset": "PhysioNet/Computing in Cardiology Challenge 2019 raw training PSV files",
        "source_columns_excluded_from_features": [SEPSIS_LABEL, "patient_id"],
        "feature_columns": feature_columns,
        "target_column": target_column,
        "target_definition": (
            f"1 if inferred annotated sepsis onset occurs in the next 1..{horizon} hourly rows; "
            "otherwise 0. For sepsis patients, onset position is inferred as the first source "
            f"SepsisLabel=1 row plus the documented {SOURCE_LABEL_SHIFT_HOURS}-hour source-label shift. "
            "Rows at/after inferred onset are excluded. For non-sepsis patients, the final horizon "
            "rows are dropped because the future observation window is incomplete."
        ),
        "horizon_hours": horizon,
        "source_label_shift_hours": SOURCE_LABEL_SHIFT_HOURS,
        "random_state": random_state,
        "split_method": "stratified patient-level 70/15/15 split; a patient appears in only one split",
        "patient_files_found": len(files),
        "usable_patient_files": len(patient_meta),
        "skipped_too_short_patient_files": skipped_short,
        "splits": {
            name: {
                "patients": patients_by_split[name],
                "rows": rows_by_split[name],
                "positive_rows": positive_rows_by_split[name],
                "positive_fraction": (
                    positive_rows_by_split[name] / rows_by_split[name] if rows_by_split[name] else None
                ),
            }
            for name in ["train", "validation", "test"]
        },
        "important_label_note": (
            "The previous project target (any positive source SepsisLabel in the next six rows) "
            "was not appropriate for early-onset prediction because the source label remains positive "
            "after the annotated onset-minus-six-hour point. This corrected target infers the onset "
            "position from the first source-positive row plus six hours, labels only rows where onset "
            "is in the next horizon, and excludes post-onset rows. This remains a retrospective research "
            "target derived from a shifted label, not an ICU-admission model or clinically validated tool."
        ),
    }
    (output_dir / "schema.json").write_text(json.dumps(schema, indent=2), encoding="utf-8")
    return schema


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw"), help="Root directory containing extracted .psv patient files")
    parser.add_argument("--output-dir", type=Path, default=Path("data/processed_onset"), help="Output directory for corrected onset-target split CSV files and schema.json")
    parser.add_argument("--horizon", type=int, default=DEFAULT_HORIZON, help="Number of future hourly rows in the target (default: 6)")
    parser.add_argument("--random-state", type=int, default=42)
    args = parser.parse_args(argv)
    try:
        schema = prepare_dataset(args.raw_dir, args.output_dir, args.horizon, args.random_state)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(f"Prepared dataset files in {args.output_dir.resolve()}")
    print(f"Features: {len(schema['feature_columns'])}; horizon: {schema['horizon_hours']} future hourly rows")
    print("Target corrected: inferred sepsis onset within the next horizon; post-onset rows excluded.")
    print("Reminder: this output is a research prototype dataset, not a clinical decision policy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
