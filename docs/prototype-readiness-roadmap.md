# BedAllocation prototype readiness roadmap

The goal is a reliable hackathon demonstration, not a claim of clinical readiness. Preserve the old project and all current local datasets/model artifacts. Use synthetic records for demonstrations.

## Decisions already made

1. Keep `data/processed` and old model artifacts as historical experiments; corrected target artifacts live under `data/processed_onset` and `artifacts_onset`.
2. Histogram Gradient Boosting is the default **research reference** only because its corrected-target validation PR-AUC is marginally higher; XGBoost remains a challenger. Neither model affects operational workflow.
3. Keep a private Python inference service. It exposes only an uncalibrated research score, target/model metadata and feature completeness.
4. Never send the model score into ICU queue sorting, clinical eligibility, bed reservation or final allocation.
5. Treat the current test result as provisional because the test cohort was examined in an earlier iteration under a flawed target. No claim of independent final validation.

## Priority order for a working prototype

### 1. Inference service (current phase)
- Pass API-key protection, schema/metadata checks and input validation tests.
- Run locally bound to `127.0.0.1`; do not expose port 8001 publicly.
- Verify the actual locally trained artifact loads correctly.

### 2. Operational allocation lifecycle (next major app feature)
- Define a clear queue-entry lifecycle: waiting, recommendation pending, staff confirmed, allocated, withdrawn/cancelled.
- Implement a backend transaction/atomic guarded update that checks tenant, candidate eligibility, bed readiness, and no existing conflicting allocation.
- Require explicit authorized staff confirmation. A recommendation alone never reserves or occupies a bed.
- Record actor, timestamp, decision, reason, bed, queue entry, and audit events.
- Make duplicate/submitted-twice requests idempotent and prevent two concurrent requests from assigning the same bed.
- Add backend integration tests, not only helper/unit tests.

### 3. Eight-minute ICU-waiting reminder worker
- Persist due/attempt/sent/failed state and deduplicate reminders per queue entry/time bucket.
- Scope each reminder by tenant and only active ICU-waiting patients.
- Reminder requests manual observations; it does not fabricate a measurement or change the old clinical assessment just because time passed.
- Add a manual run/test mode and verify scheduler delivery/logging. Ward patients receive no recurring eight-minute reminder.

### 4. Medical-report upload and extraction
- Authenticated upload; strict size/type/content validation; private non-public storage; random object keys; do not accept arbitrary remote URLs.
- OCR/AI extracts candidate fields only. Show a preview, source location/page, uncertainty and original document.
- Authorized staff verify each accepted value before it becomes an observation. Keep extraction output separate from confirmed observations.
- Add malicious-file, wrong-patient, low-quality scan and ambiguous-unit tests.

### 5. Private research-score display (only after local API works)
- Add an authenticated Express proxy that keeps the API key server-side; do not call the Python service directly from browser code.
- Only display scores in a clearly labelled research-only panel with model version, corrected target definition and feature completeness.
- Never show a red/yellow/green clinical risk badge or actionable recommendation based solely on this score.
- If service fails, show “research prediction unavailable”; do not block patient/bed workflows or fabricate a score.

### 6. End-to-end/security hardening
- Cross-tenant API tests for every patient, report, queue, bed and allocation route.
- End-to-end happy-path and failure-path workflow tests.
- Check auth, CSRF, rate-limiting, XSS, NoSQL injection, upload security, secrets, dependency audit, accessibility, keyboard operation and mobile layout.
- Configure recurring worker on a host supporting the required interval; do not assume every Vercel plan supports an eight-minute cron.
- Use synthetic data for demo mode; keep analytics free of patient information.
- Smoke-test clean installation from the README and document known limitations before the hackathon demo.

## Definition of demo-ready

- Fresh setup starts using documented commands.
- Platform admin can create a tenant; tenant users cannot cross tenant boundaries.
- Register patient, add an observation, view history, manage bed state, enter/withdraw queue entry.
- Authorized user can confirm a valid allocation with capacity/concurrency protections and audit trail.
- ICU-waiting reminder fires in a deterministic test; wards are excluded.
- Report upload produces reviewable candidate fields but nothing is saved as an observation without staff confirmation.
- ML research API responds securely to synthetic input and fails safely when missing data/model/service is not usable.
- CI/unit/integration tests pass; production dependency build and deployment checks are documented.
