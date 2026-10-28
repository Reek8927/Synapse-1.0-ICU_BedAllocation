"""Load PhysioNet PSV files and construct a time-aligned onset target.

The source PhysioNet SepsisLabel is shifted six hours before its annotated onset:
for sepsis patients it stays 1 from onset-minus-six-hours onward, including after
onset. Therefore, taking `any(SepsisLabel == 1 in the next six rows)` creates a
persistent positive target after the label turns on. This module instead infers
the annotated onset position from the first source-positive row plus the source's
six-hour shift, builds a target for an onset in the next horizon, and excludes
post-onset rows for sepsis patients.
"""
from __future__ import annotations
from pathlib import Path
from typing import Iterable
import numpy as np
import pandas as pd

SEPSIS_LABEL = "SepsisLabel"
SOURCE_LABEL_SHIFT_HOURS = 6
DEFAULT_HORIZON = 6
TARGET_COLUMN = "target_sepsis_onset_next_6h"


def target_column_for_horizon(horizon: int) -> str:
    return f"target_sepsis_onset_next_{horizon}h"


def list_patient_files(raw_dir: str | Path) -> list[Path]:
    """Return raw PSV files deterministically."""
    root = Path(raw_dir).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"Raw dataset directory does not exist: {root}")
    files = sorted(path for path in root.rglob("*.psv") if path.is_file())
    if not files:
        raise FileNotFoundError(
            f"No .psv patient files found under {root}. Download/extract the raw "
            "PhysioNet Challenge 2019 training files into ml-service/data/raw/."
        )
    return files


def read_header(path: str | Path) -> list[str]:
    """Read a PSV header and validate required label/feature names."""
    frame = pd.read_csv(path, sep="|", nrows=0)
    columns = [str(column).strip() for column in frame.columns]
    if SEPSIS_LABEL not in columns:
        raise ValueError(f"Missing required {SEPSIS_LABEL!r} column in {path}")
    features = [column for column in columns if column != SEPSIS_LABEL]
    if not features:
        raise ValueError(f"No feature columns found in {path}")
    if len(features) != len(set(features)):
        raise ValueError(f"Duplicate feature names found in {path}")
    return columns


def _validated_labels(values: Iterable[object], source: str = "SepsisLabel") -> np.ndarray:
    labels = pd.to_numeric(pd.Series(values), errors="coerce").to_numpy(dtype="float64")
    if labels.size == 0:
        return labels.astype("int8")
    if not np.isfinite(labels).all():
        raise ValueError(f"{source} contains missing or non-numeric labels")
    if not np.isin(labels, [0, 1]).all():
        invalid = np.unique(labels[~np.isin(labels, [0, 1])])[:5]
        raise ValueError(f"{source} must be binary 0/1; unexpected values: {invalid}")
    return labels.astype("int8")


def sepsis_onset_target(labels: Iterable[object], horizon: int = DEFAULT_HORIZON) -> tuple[np.ndarray, int]:
    """Return an actual-onset-within-horizon target and number of retained rows.

    For sepsis patients, first source SepsisLabel==1 marks estimated onset minus
    six hours according to the official PhysioNet label definition. `onset_index`
    is therefore `first_positive_index + SOURCE_LABEL_SHIFT_HOURS`. Retain only
    rows strictly before the inferred onset. A row is positive when inferred
    onset is in the next 1..horizon hourly rows. Rows at/after onset are excluded
    because they are not prospective prediction examples.

    For patients whose source labels are all 0, there is no observed onset; the
    final `horizon` rows are dropped because the dataset has no full forward
    observation window for confirming a negative target.

    Returns (target aligned to the retained rows, number of rows to retain).
    """
    if isinstance(horizon, bool) or not isinstance(horizon, int) or horizon < 1:
        raise ValueError("horizon must be a positive integer")
    labels_array = _validated_labels(labels)
    n_rows = len(labels_array)
    if n_rows == 0:
        return np.zeros(0, dtype="int8"), 0

    positive_positions = np.flatnonzero(labels_array == 1)
    if len(positive_positions) == 0:
        n_keep = max(0, n_rows - horizon)
        return np.zeros(n_keep, dtype="int8"), n_keep

    first_positive = int(positive_positions[0])
    # PhysioNet's source label is 1 from onset-6h onward, so a 1->0 transition
    # violates the source target's documented construction and must fail closed.
    if not np.all(labels_array[first_positive:] == 1):
        raise ValueError(
            "SepsisLabel is not a monotonic 0...0,1...1 sequence; cannot infer onset safely"
        )

    onset_index = first_positive + SOURCE_LABEL_SHIFT_HOURS
    n_keep = min(n_rows, onset_index)  # exclude rows at/after inferred onset
    target = np.zeros(n_keep, dtype="int8")
    positive_start = max(0, onset_index - horizon)
    positive_end = min(onset_index, n_keep)
    if positive_end > positive_start:
        target[positive_start:positive_end] = 1
    return target, n_keep


def patient_target_presence(path: str | Path, horizon: int = DEFAULT_HORIZON) -> int | None:
    """Return target presence for patient-level stratification, or None if too short."""
    label_frame = pd.read_csv(path, sep="|", usecols=[SEPSIS_LABEL])
    target, n_keep = sepsis_onset_target(label_frame[SEPSIS_LABEL].to_numpy(), horizon=horizon)
    if n_keep == 0 or target.size == 0:
        return None
    return int(target.max())


def patient_id_for_file(path: str | Path, raw_dir: str | Path) -> str:
    """Create stable pseudonymous ID from the relative filename."""
    relative = Path(path).resolve().relative_to(Path(raw_dir).expanduser().resolve())
    return relative.with_suffix("").as_posix()


def read_patient_dataset(
    path: str | Path,
    raw_dir: str | Path,
    feature_columns: list[str],
    horizon: int = DEFAULT_HORIZON,
) -> pd.DataFrame:
    """Load one patient file, excluding post-onset or censored rows."""
    patient = pd.read_csv(path, sep="|")
    if SEPSIS_LABEL not in patient.columns:
        raise ValueError(f"Missing required {SEPSIS_LABEL!r} column in {path}")
    actual_features = [column for column in patient.columns if column != SEPSIS_LABEL]
    if set(actual_features) != set(feature_columns):
        missing = sorted(set(feature_columns) - set(actual_features))
        extra = sorted(set(actual_features) - set(feature_columns))
        raise ValueError(
            f"Inconsistent columns in {path}; missing={missing}, extra={extra}"
        )

    target, n_keep = sepsis_onset_target(patient[SEPSIS_LABEL].to_numpy(), horizon=horizon)
    target_name = target_column_for_horizon(horizon)
    if n_keep == 0:
        return pd.DataFrame(columns=["patient_id", *feature_columns, target_name])

    feature_frame = patient.iloc[:n_keep][feature_columns].copy()
    for column in feature_columns:
        feature_frame[column] = pd.to_numeric(feature_frame[column], errors="coerce").astype("float32")
    feature_frame.insert(0, "patient_id", patient_id_for_file(path, raw_dir))
    feature_frame[target_name] = target
    return feature_frame
