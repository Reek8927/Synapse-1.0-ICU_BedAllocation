# BedAllocation Architecture — SaaS Foundation and Ward Patient Records

## Browser and service flow

```text
Public browser / private dashboard
             |
             v
Next.js App Router (SSR public pages + noindex private routes)
             | /api/* rewrite
             v
Express API (cookie session + CSRF + role checks)
             |
             v
MongoDB (Tenant, User, ContactMessage, Patient, PatientObservation, ICUBed, ICUQueueEntry, AuditEvent)
```

## Why Next.js

The public SaaS site needs crawlable, page-specific metadata and public routes. Next.js is still React, with server-rendered public pages, `metadata` exports, sitemap and robots route handlers. The API remains a separate Express service.

## Multi-tenant model

- `Tenant` stores workspace metadata and status.
- Hospital `User` records always have a `tenantId`.
- `platform_admin` records have no `tenantId` and are restricted to explicit platform-level routes.
- Hospital administrator user creation derives `tenantId` from the authenticated user and does not accept a tenant ID from the request body.
- A tenant-aware filter helper is provided for future patient, report, bed, observation and allocation records.
- Patient, observation, ICU bed, ICU queue and audit records carry `tenantId`; tenant filters always derive from authenticated middleware. Patient and bed IDs supplied by clients are looked up together with the authenticated tenant.
- Patient registration/updates and observation creation write their audit event in the same MongoDB transaction. Use MongoDB Atlas or a replica-set deployment.
- Patient API responses send `Cache-Control: no-store`.

## Authentication and request integrity

- Passwords use bcrypt hashing.
- Session JWT is held only in an HttpOnly cookie, with `Secure` in production and a configurable `SameSite` setting.
- The API verifies the JWT algorithm, issuer and audience, then loads the current user and tenant status from MongoDB.
- Mutating requests require a signed double-submit CSRF value sent in `X-CSRF-Token`; its cookie is HttpOnly and the value is supplied to the frontend through a no-store bootstrap response.
- Origin allowlisting, CORS credentials, bounded JSON, Helmet, NoSQL sanitization and rate limits are enabled.
- Error/log output avoids body fields, credentials, cookies, tokens and medical information.

## Public SEO

- Distinct titles, descriptions and canonical paths per public route.
- Open Graph and Twitter preview image generated as a static public asset.
- Sitemap lists only public pages.
- Robots disallows application and utility routes but is not considered access control.
- `/login`, `/dashboard` and `/thank-you` send `noindex` metadata.
- Google Analytics is not yet wired; it must be configured to exclude all patient and clinical information.

## Current endpoints

- `GET /api/health`: readiness only.
- `GET /api/auth/csrf`: initialize CSRF cookie.
- `POST /api/auth/login`: secure session-cookie login.
- `POST /api/auth/logout`: revoke browser session cookie.
- `GET /api/auth/me`: current identity and tenant.
- `POST /api/auth/users`: hospital-admin provisioning of doctor/nurse/staff users in the current tenant.
- `GET /api/platform/tenants`, `POST /api/platform/tenants`: platform admin tenant management.
- `GET /api/patients`: tenant-scoped pagination without PHI in query strings.
- `POST /api/patients/search`: tenant-scoped search using a protected POST body so patient names/MRNs are not placed in browser history or proxy URL logs.
- `POST /api/patients`: create a ward patient with server-generated patient code.
- `GET /api/patients/:patientId`: view patient details, recent observations and audit history.
- `PATCH /api/patients/:patientId`: hospital administrator/doctor can update an allowlist of demographics and ward fields; status/tenant fields are not accepted.
- `POST /api/patients/:patientId/observations`: add manual observations for ward and ICU-waiting patients after validation.
- `GET /api/icu/beds`, `POST /api/icu/beds`, `PATCH /api/icu/beds/:bedId`: tenant-scoped ICU bed inventory and operational status updates.
- `GET /api/icu/queue`: list active entries ordered by entry time, with latest-observation timestamp.
- `POST /api/icu/queue`: move a tenant-owned ward patient into the provisional waiting list with a staff-entered reason.
- `POST /api/icu/queue/:queueEntryId/withdraw`: withdraw an active queue entry with a required reason.
- `POST /api/contact`: rate-limited public inquiry with server-side Turnstile verification required in production.
- `GET /api/platform/contact-messages`: platform-admin inbox for public inquiries.

## Current ICU workflow boundary

ICU bed inventory and a provisional waiting list are implemented. The queue is displayed in first-in/first-out order only and is explicitly not a clinical priority ranking. Queue entry is a staff-entered request for ICU assessment, not an autonomous eligibility determination or admission. Bed status updates do not allocate a patient. Clinically reviewed eligibility and priority rules, allocation with concurrency protection, AI report extraction, ML inference and scheduled reminders remain deferred. The app must use synthetic data during development and demonstration.

## ML development pipeline (local, not deployed)

```text
Original PhysioNet raw patient PSV files
          |
          v
Python preparation script
  - future-source-label target
  - six-hour complete-horizon rule
  - patient-level 70/15/15 split
          |
          v
Local CSV splits + schema.json
          |
          v
Median imputation + missing indicators + scaling + logistic-regression baseline
          |
          v
Validation/test metrics + local model artifact
```

The ML workspace is separate from the Express API. No trained model is bundled, no inference API is deployed in this phase, and the application does not consume ML scores. Generated datasets and model artifacts are excluded from Git. The agreed label forecasts a future appearance of the PhysioNet source `SepsisLabel`, which is itself shifted up to six hours ahead of onset in the challenge data. This target is not ICU admission probability or a direct prediction of clinical deterioration. Model use in clinical workflow remains blocked pending target review, independent validation and clinical governance.
