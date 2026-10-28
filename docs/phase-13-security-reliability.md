# Phase 13 — Security and Reliability Preflight

## Purpose

This phase is a focused hardening increment after local testing confirmed the hospital patient workflow, ICU allocation, reminder acknowledgement, and queue-review flow. It does not add new clinical decision logic or connect an ML score to allocation.

## Fixes included

1. **Reminder freshness guard.** A future-dated observation (within the API's tolerated five-minute clock-skew window) can no longer clear an existing ICU waiting reminder. Only an observation timestamp at or before recording time and younger than the configured reminder interval can supersede that reminder. The existing input validation still rejects observations more than five minutes in the future.
2. **Complete backend syntax scan.** `npm run check` now recursively checks JavaScript files in `backend/src` and `backend/test`, including worker/controller/utility files that could otherwise be omitted from a hand-maintained command.
3. **Private response caching.** `/api/auth/*` and `/api/platform/*` now return `Cache-Control: no-store` through a route-level middleware, protecting authentication/bootstrap and platform-admin responses from browser/proxy caching.
4. **Proxy configuration validation.** `TRUST_PROXY_HOPS` must be an integer from 0 to 10. This avoids ambiguous or accidental trust-proxy configuration that can affect client IP interpretation and rate limiting.
5. **Preflight script.** `scripts/prototype-preflight.ps1` runs backend syntax checks/tests, the frontend production build, ML unit tests when the local venv is present, and a best-effort check that local secret files are not tracked by Git. It does not make or modify database records.

## Apply

Copy only these changed files into the current project, merging folders:

- `backend/package.json`
- `backend/src/app.js`
- `backend/src/config/env.js`
- `backend/src/controllers/patientController.js`
- `backend/src/scripts/checkSyntax.js`
- `backend/src/utils/observationFreshness.js`
- `backend/test/observationFreshness.test.js`
- `backend/test/runtimeConfig.test.js`
- `scripts/prototype-preflight.ps1`
- this document

Do not replace `.env`, `.env.local`, `.venv`, datasets, trained artifacts, or the MongoDB database. No seed script should be rerun.

## Run checks on Windows

From the project root in PowerShell:

```powershell
.\scripts\prototype-preflight.ps1
```

To skip the frontend build if its dependencies aren't installed yet:

```powershell
.\scripts\prototype-preflight.ps1 -SkipFrontendBuild
```

The script runs backend unit tests and syntax checks, a Next.js production build unless skipped, and Python tests if `ml-service/.venv/Scripts/python.exe` is present. It never prints environment secrets and does not modify patient data.

## Manual end-to-end security/reliability matrix

Use synthetic data only. Perform these tests in the local dev environment and record the observed result:

1. **Authentication:** logged-out request to `/api/patients` returns `401`.
2. **Tenant isolation:** create two hospital workspaces and confirm a user in Hospital B receives no access to Hospital A's patient, observation, queue, bed, reminder or admission by directly requesting the known identifier. Expected `404`/`403`, with no record body.
3. **Role authorization:** operations staff/nurses cannot call `PATCH /api/icu/queue/:id/priority`; only the authorized roles succeed. CSRF-invalid write requests return `403`.
4. **Double allocation:** two staff sessions attempt to allocate the same ready bed at nearly the same time. Only one allocation may commit; the other should receive a conflict, never a second active patient-bed link.
5. **Assignment integrity:** occupied beds cannot be manually reset to ready; closing an admission moves the bed to Cleaning; staff must explicitly mark it Ready after cleaning.
6. **Reminder idempotency:** worker sweep for an overdue active waiting entry creates one pending reminder; repeated sweeps update/reuse the existing pending reminder and don't create duplicates.
7. **Reminder lifecycle:** a current observation supersedes the pending reminder; a backdated or future-dated observation must not clear it; withdrawal/admission supersedes it; ward patients are never candidates for recurring reminders.
8. **Queue review:** a new observation sets `priorityReviewRequired`; unauthorized roles cannot change review tier; authorized assignment records reason, actor, timestamp and audit event.
9. **Audit and privacy:** important changes produce audit events; logs do not contain request bodies, passwords, cookies, tokens, report contents, or observation values.
10. **Secrets/build:** local secrets are not tracked in Git; production environment uses HTTPS, exact public CORS origins, secure cookies, a strong JWT secret, and the documented proxy hop count.

## Verification limitations

The changed helper and configuration tests can be run locally without a live database. This assistant environment cannot authenticate to your private MongoDB deployment or execute requests against your locally running servers. The manual integration checks above therefore remain necessary. Passing a preflight is not a penetration test, not external security certification, and not clinical validation.

General-purpose GenAI report extraction remains paused. ML models remain research-only and do not assign clinical urgency, queue priority, bed reservations, or admissions.

The project `.gitignore` also excludes `ml-service/.ml-api-key.local`, and the preflight checks that any existing local API key file is both untracked and ignored.
