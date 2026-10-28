# Phase 7: XGBoost candidate

This add-on trains a class-weighted XGBoost candidate on the corrected `data/processed_onset` dataset and merges its **validation metrics** into a new report. It keeps the existing logistic/HGB report unchanged and never reads `test.csv`.

## Prerequisites

- Phase 6 target-fix code and corrected `data/processed_onset` output are installed.
- The existing comparison report exists at `ml-service/artifacts_onset/sepsis_onset_model_comparison_validation.json`.
- The environment has XGBoost installed (`python -m pip install xgboost`).

## Install optional dependency declaration

The `pyproject.toml` in this add-on declares an optional extra. It is not necessary to reinstall if XGBoost 3.4.1 is already installed, but this makes the environment reproducible:

```powershell
python -m pip install -e ".[xgboost]"
```

## Run tests

From `ml-service`, with the virtual environment active:

```powershell
python -m unittest discover -s tests -v
```

## Run the XGBoost experiment

```powershell
python -m bedallocation_ml.compare_models_xgboost --data-dir data/processed_onset --artifact-dir artifacts_onset
```

The trainer uses `tree_method="hist"`, PR-AUC (`aucpr`) as its early-stopping metric, 40-round early stopping, and `scale_pos_weight = training negatives / training positives`. It fits on `train.csv` and uses `validation.csv` for early stopping and comparison. Since the same validation split supports early stopping and reporting, treat the reported validation metric as a model-selection metric, not an unbiased final estimate.

## Outputs

- `artifacts_onset/sepsis_onset_next_6h_xgboost_weighted.joblib`
- `artifacts_onset/sepsis_onset_xgboost_model_metadata.json`
- `artifacts_onset/sepsis_onset_xgboost_model_comparison_validation.json`

The original `sepsis_onset_model_comparison_validation.json`, old model files, processed datasets, and test evaluation report are preserved. The new combined report includes existing logistic/HGB validation metrics and the XGBoost validation results.

If output files already exist, the command stops rather than overwriting them. Only use `--overwrite` when you intend to replace this candidate's validation experiment:

```powershell
python -m bedallocation_ml.compare_models_xgboost --data-dir data/processed_onset --artifact-dir artifacts_onset --overwrite
```

## Limits

XGBoost natively handles missing values. Infinities are converted to missing values. Class weighting can distort probability calibration, so `predict_proba` scores are uncalibrated. Threshold 0.5 is only a technical metric, not a clinical cutoff. This model predicts the dataset's inferred sepsis-onset-within-six-hours target; it is not an ICU-admission model and must not control live clinical prioritization or allocation. Do not evaluate or tune on the held-out test split in this command.
