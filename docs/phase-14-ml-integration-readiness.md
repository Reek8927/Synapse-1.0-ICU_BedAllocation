# Phase 14: ML Integration Readiness

## Purpose

This phase connects the ICU dashboard to a server-side, read-only research-model status endpoint and strengthens the inference API's handling of incomplete inputs. It does **not** add patient-level inference to the hospital workflow.

## What changed

- Added `GET /api/research-model/status` to Express.
- The route requires a valid authenticated hospital session, a hospital tenant, and either `hospital_admin` or `doctor` role.
- Express contacts the private Python service at a server-configured URL using the API key stored on the server. The key is never sent to the browser.
- Redirects are rejected, requests time out, service responses are not cached, and returned metadata must match the expected target and 40-feature schema.
- Added a read-only ML model status panel to the ICU workspace for hospital administrators and doctors.
- The panel shows connection status and model/target metadata. It explicitly says patient-level scoring is disabled and that no score is displayed or applied to queue review, ordering, bed status, or allocation.
- The Python prediction endpoint now returns `score_status: "withheld"` and `score: null` if non-missing supplied features are below `BEDALLOCATION_MIN_FEATURE_COMPLETENESS` (default `0.5`). This is a basic prototype input-completeness guard, **not** a clinical sufficiency rule.

## Why patient-level scoring remains disabled

The live application currently captures only a subset of the 40 model inputs. Other model features include ICU-derived timing and laboratory variables that are not collected in the existing patient workflow. The research model was trained on an ICU dataset and predicts inferred annotated sepsis onset in the next six hourly rows; it is not an ICU admission model. Mapping partial ward records to it would be a domain and data-quality risk.

## Local configuration

In `backend/.env`, configure:

```env
BEDALLOCATION_ML_SERVICE_URL=http://127.0.0.1:8001
BEDALLOCATION_ML_API_KEY=the_same_private_key_used_by_the_python_service
```

The key must be at least 32 characters and match `BEDALLOCATION_ML_API_KEY` used by the Python process. Do not commit either key or the `.ml-api-key.local` file. The service URL comes from trusted environment configuration; it is not accepted from a request.

For production, use HTTPS for non-loopback service URLs and store both services' secrets in the deployment secret manager. Do not expose the Python inference port publicly.

## What is intentionally not included

- No patient-specific scoring from database observations.
- No automatic ICU eligibility decision or ML-driven review tier.
- No queue reordering, bed reservation, placement, or patient-record mutation by ML.
- No general-purpose GenAI report extraction; this remains paused as requested.

## Validation in the build environment

- Backend JavaScript syntax check passed for 54 source/test files.
- Backend unit tests: 48 passed.
- Python ML tests: 29 passed.
- Frontend JSX syntax transpilation passed for `ICUWorkspace.jsx` and `ResearchModelPanel.jsx`.
- The user's own complete Next.js production build and live local API proxy should be verified after applying this patch. The tests above are not a penetration test or clinical validation.
