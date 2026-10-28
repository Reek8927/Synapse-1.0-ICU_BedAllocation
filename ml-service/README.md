# BedAllocation ML service

This is a local research workspace for target construction, model training/comparison and an optional private research inference API. Raw PhysioNet files, generated dataset splits and trained artifacts are intentionally not included in source packages and should remain local/private.

**Important:** This model predicts an inferred annotated sepsis-onset target within the next six hourly positions. It is not an ICU-admission model or a clinically validated score. The inference API is read-only and must not influence eligibility, priority ranking, bed state, or final allocation.

## Current local artifacts

- Corrected dataset: `data/processed_onset/`.
- Corrected HGB research reference: `artifacts_onset/sepsis_onset_next_6h_hist_gradient_boosting.joblib`.
- XGBoost challenger: `artifacts_onset/sepsis_onset_next_6h_xgboost_weighted.joblib`.
- HGB metadata: `artifacts_onset/sepsis_onset_comparison_model_metadata.json`.
- XGBoost metadata: `artifacts_onset/sepsis_onset_xgboost_model_metadata.json`.
- Provisional HGB test report: `artifacts_onset/sepsis_onset_next_6h_hist_gradient_boosting_test_evaluation.json`.

Keep historical experiments under `data/processed/` and `artifacts/` separate. Do not re-use their metrics for the corrected target. The recorded test report is provisional because this cohort was examined in an earlier iteration under a flawed target.

## Research inference API setup (Phase 8)

From this `ml-service` directory in PowerShell, with your existing `.venv` active:

```powershell
python -m pip install -e ".[api,test]"
python -m unittest discover -s tests -v
```

Configure the local HGB research reference and start the API:

```powershell
if (!(Test-Path .ml-api-key.local)) {
  python -c "from pathlib import Path; import secrets; Path('.ml-api-key.local').write_text(secrets.token_urlsafe(48), encoding='utf-8')"
}
$env:BEDALLOCATION_ML_API_KEY = (Get-Content .ml-api-key.local -Raw).Trim()
$env:BEDALLOCATION_ENV = "development"
$env:BEDALLOCATION_MODEL_PATH = "artifacts_onset/sepsis_onset_next_6h_hist_gradient_boosting.joblib"
$env:BEDALLOCATION_SCHEMA_PATH = "data/processed_onset/schema.json"
$env:BEDALLOCATION_MODEL_METADATA_PATH = "artifacts_onset/sepsis_onset_comparison_model_metadata.json"
$env:BEDALLOCATION_MODEL_KEY = "hist_gradient_boosting"
$env:BEDALLOCATION_MODEL_VERSION = "research-candidate-v1"
uvicorn bedallocation_ml.inference_api:app --host 127.0.0.1 --port 8001
```

Open another terminal, `cd` to `ml-service`, and load the same key before making a protected request:

```powershell
$env:BEDALLOCATION_ML_API_KEY = (Get-Content .ml-api-key.local -Raw).Trim()
$headers = @{ "X-API-Key" = $env:BEDALLOCATION_ML_API_KEY }
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8001/v1/model-info" -Headers $headers
```

Check `http://127.0.0.1:8001/health`. In development, `http://127.0.0.1:8001/docs` shows the API schema. Requests to `/v1/model-info` and `/v1/predict` require `X-API-Key`. Keep the key server-side and do not expose it in browser JavaScript or any `NEXT_PUBLIC_*` variable. The `.ml-api-key.local` file is ignored by Git; it is a local development convenience, not production secret management.

A request uses only exact model feature names, accepts numeric values or null, and may omit features; it rejects unknown keys, booleans, strings, infinities, and requests where all features are missing. The response reports the number of supplied and missing features. Since the hospital app currently records fewer than the 40 research model features, the service will often mark input completeness as low. A returned score is uncalibrated and must not be used as a clinical probability or a cutoff-based alert.

The service does not persist input, write to MongoDB, or change patient/queue/bed/allocation records. Keep it on localhost/private service networking. Do not expose port 8001 publicly. Only load trusted locally-created `joblib` model files.

To serve XGBoost instead, set both model and matching metadata paths before starting the process:

```powershell
$env:BEDALLOCATION_MODEL_PATH = "artifacts_onset/sepsis_onset_next_6h_xgboost_weighted.joblib"
$env:BEDALLOCATION_MODEL_METADATA_PATH = "artifacts_onset/sepsis_onset_xgboost_model_metadata.json"
$env:BEDALLOCATION_MODEL_KEY = "xgboost_hist_weighted"
```

## Useful commands

Prepare the corrected dataset without overwriting older files:

```powershell
python -m bedallocation_ml.prepare_dataset --raw-dir data/raw --output-dir data/processed_onset
```

Compare HGB/logistic candidates using train/validation only:

```powershell
python -m bedallocation_ml.compare_models --data-dir data/processed_onset --artifact-dir artifacts_onset
```

Add the weighted XGBoost challenger using train/validation only:

```powershell
python -m bedallocation_ml.compare_models_xgboost --data-dir data/processed_onset --artifact-dir artifacts_onset
```

Read `../docs/phase-6-corrected-target.md`, `../docs/model-card-research-candidate-v1.md`, and `../docs/phase-8-inference-api.md` before interpreting results or running the service.
