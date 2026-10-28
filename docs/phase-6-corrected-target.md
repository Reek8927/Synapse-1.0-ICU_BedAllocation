# Phase 6: Corrected sepsis-onset target

## Why this correction is necessary

The official PhysioNet Challenge 2019 documentation defines source `SepsisLabel` as 1 from six hours before the annotated sepsis onset onward for patients with sepsis; it is not a label that turns back to 0 after onset. Therefore, defining a target as “any positive source `SepsisLabel` in the next six rows” causes all retained post-transition rows with future positive labels to be positive too. That makes many post-onset observations positive examples and does not measure early prediction of onset.

Official source: https://physionet.org/content/challenge-2019/1.0.0/

## Corrected prototype target

The updated pipeline infers the annotated onset position for a sepsis-positive record as the first row with source `SepsisLabel == 1` plus the documented six-hour shift. For horizon `h`, a row is positive when that inferred onset falls in the next 1..h hourly positions. For the six-hour horizon, this selects the six rows immediately before the inferred onset (subject to record boundaries).

- Source `SepsisLabel` and `patient_id` are not model features.
- For septic patients, rows at or after the inferred onset are excluded rather than treated as prospective negatives.
- For records with no positive source label, the final `h` rows are dropped because their future observation window is incomplete.
- A source label sequence that reverts from 1 to 0 is rejected as inconsistent with this source-label definition.
- Train/validation/test splits remain patient-level and non-overlapping.
- Output target column: `target_sepsis_onset_next_6h`.

## Important limitations

This is a retrospective research target inferred from the shifted source label. It is not an ICU-admission target, clinical priority score, clinical validation, or evidence that a prediction can improve outcomes. Results from models trained on the previous target are not comparable to the corrected target and must be retained only as historical experiments.

## Rebuild procedure

1. Keep the existing `data/processed` directory and old models/metrics as historical artifacts.
2. Update the ML source/tests from the Phase 6 patch while keeping `data/raw`, `.venv`, website `.env` files, and the hospital database unchanged.
3. Run unit tests.
4. Generate corrected patient-separated datasets into the new `data/processed_onset` directory: `python -m bedallocation_ml.prepare_dataset --raw-dir data/raw --output-dir data/processed_onset`.
5. Inspect `data/processed_onset/schema.json` and its target distribution.
6. Train/compare candidates using train and validation only: `python -m bedallocation_ml.compare_models --data-dir data/processed_onset --artifact-dir artifacts_onset`.
7. Select a candidate based on validation criteria. Evaluate the held-out test split once with `python -m bedallocation_ml.evaluate_test --data-dir data/processed_onset --artifact-dir artifacts_onset --model-key hist_gradient_boosting`.

Because earlier iterations examined the same source cohort/test split under a different target, any corrected-target test result remains provisional. External or prospective validation would be necessary before any real-world clinical use.
