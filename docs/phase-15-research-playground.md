# Phase 15: Synthetic Research Prediction Playground

## Purpose

Add a small, read-only demonstration area to the authenticated hospital dashboard so the project can demonstrate model inference without scoring real patient records. General-purpose GenAI report extraction remains paused.

## What it does

- Adds `POST /api/research-model/demo-predict` for hospital administrators and doctors only.
- Requires the application's normal authenticated hospital session, hospital tenant, and CSRF validation.
- Applies an endpoint-specific rate limit.
- Accepts only a predefined `profileId` and an optional Boolean `compareModels`; it rejects arbitrary feature maps, patient IDs, names, observations, and unknown request fields.
- Creates all synthetic feature values on the backend. The browser never submits or selects patient data.
- Runs the primary Histogram Gradient Boosting model through the existing private Python inference API.
- Optionally runs the same synthetic profile against a separately configured XGBoost inference process. A missing or unavailable XGBoost service does not prevent the primary model result.
- Displays score withholding, feature completeness, missing feature names, model/version/target metadata, and clear disclaimers.
- Does not persist demo requests or results and does not alter patient records, queue position, staff review tier, reminders, bed status, admissions, or allocation.

## Synthetic profiles

1. `complete_synthetic`: a fixed, fully populated set of 40 fictional feature values for demonstrating the service path.
2. `incomplete_synthetic`: seven fictional features, intended to demonstrate the inference API's low-completeness score-withholding behavior.

These are software test inputs, not clinically constructed or validated example patients. A score from `complete_synthetic` must not be interpreted as a clinical probability.

## Optional XGBoost comparison service

The primary service remains Histogram Gradient Boosting on `127.0.0.1:8001`. To enable side-by-side output, configure `BEDALLOCATION_XGBOOST_SERVICE_URL=http://127.0.0.1:8002` in `backend/.env`, and start a second private Uvicorn process configured for the trained XGBoost artifact and its metadata. The XGBoost comparison option remains disabled unless the second service URL and a valid API key are configured.

## API behavior

- `GET /api/research-model/status` now reports whether the optional XGBoost service is configured, without revealing its URL or secret.
- `POST /api/research-model/demo-predict` request shape:

```json
{
  "profileId": "complete_synthetic",
  "compareModels": false
}
```

Allowed `profileId` values are `complete_synthetic` and `incomplete_synthetic` only. Unknown properties are rejected. This request does not accept feature data or patient identifiers.

## Security and safety controls

- Authenticated hospital session, hospital tenant and doctor/hospital-admin role are required.
- CSRF validation is required for POST.
- Model API keys stay in backend environment variables and are forwarded server-side only.
- Redirects are rejected; model requests have a timeout and disable caching.
- Upstream target/model metadata and response invariants are validated before output reaches the browser.
- Synthetic requests are rate-limited and are not stored.

## Limitations

The model score is uncalibrated and the target is inferred sepsis onset in the next six hourly rows, not ICU admission need. HGB and class-weighted XGBoost scores are not guaranteed to be directly comparable. The UI uses only backend-generated synthetic data. It deliberately does not offer patient-specific scoring or integrate predictions into the clinical workflow.
