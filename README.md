# Byte Brains — BedAllocation

Fresh implementation for the SYN26-CS06 healthcare operations project. This repository uses a separate `bedallocation_rebuild` database by default and is separate from the previous implementation. Do not copy old code, processed feature data, trained models, or the old database into this rebuild.

> **Safety notice:** BedAllocation is a hackathon decision-support prototype, not a clinically validated system. Use synthetic data for development and demonstrations. It must not independently diagnose patients or authorize ICU placement.

## Current build phase: private read-only research inference API (Phase 8)

Implemented in this phase:
- Next.js App Router frontend using React, for server-rendered public pages and page-specific SEO metadata.
- Public landing page, features, hospitals, FAQ, contact, privacy and terms pages.
- Custom 404, social-sharing metadata, Open Graph preview asset, XML sitemap and `robots.txt`.
- Express API and MongoDB connection.
- Password-hashed accounts, secure HttpOnly session cookie, signed double-submit CSRF protection and rate-limited login/contact endpoints.
- Separate `platform_admin`, `hospital_admin`, `doctor`, `nurse`, and `staff` roles.
- Platform administrator can create a hospital tenant and its first hospital administrator.
- Hospital administrator can create only doctor, nurse and staff accounts inside their own tenant.
- Public contact submissions are stored in MongoDB and viewable by platform administrators.
- Protected application/dashboard metadata is marked `noindex`.
- Hospital-scoped patient registration, patient search and manual ward observations with audit history.
- Hospital-scoped ICU bed inventory with states for ready, occupied, cleaning, preparing, reserved and unavailable.
- Hospital-scoped provisional ICU waiting list, including a required staff-entered reason, entry time, author name and auditable withdrawal.
- ICU-waiting patients can receive new manual observations; the queue displays the latest recorded observation timestamp and an age indicator.
- Tenant-scoped bed and queue APIs enforce role permissions, validation, CSRF checks and audit events.
- User-tested basic flows: ward registration, manual observation history, bed-status changes and waiting-list withdrawal. This confirms those local workflows only, not a full production/security audit.
- Corrected six-hour inferred-onset research target and patient-level train/validation/test splits are produced from original raw PhysioNet files into `ml-service/data/processed_onset/`.
- Histogram Gradient Boosting is the default **research reference**; weighted XGBoost is retained as a challenger. Existing validation reports and local artifacts are not overwritten by the inference service.
- Private FastAPI inference service in `ml-service/src/bedallocation_ml/inference_api.py`: server API-key protection, feature allowlist/type checks, model/schema/metadata consistency checks, feature-completeness indicators, no input persistence, and no clinical or operational side effects.
- Model card and demo readiness roadmap are documented in `docs/model-card-research-candidate-v1.md` and `docs/prototype-readiness-roadmap.md`.

Still not implemented: the inference service is **not yet connected to the Express API or dashboard**; clinically reviewed eligibility and priority policy; staff-confirmed allocation with concurrency protections; the eight-minute reminder worker; secure medical-report OCR/AI extraction; analytics, what-if simulation, MFA and full end-to-end security testing. The waiting list currently displays in chronological order only. It is not a clinical priority score and does not determine ICU admission.
## Requirements

- Node.js 22 LTS recommended (Next.js requires a supported modern Node version).
- npm.
- MongoDB Atlas (recommended) or a MongoDB replica set. Patient registration and audit writes use MongoDB transactions, which require replica-set/Atlas support.

## 1. Backend setup

Open a terminal in the project directory:

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env`. Set at least:
- `MONGODB_URI` to your MongoDB connection string.
- `JWT_SECRET` to a unique random secret at least 32 characters long, not the placeholder.
- `PLATFORM_ADMIN_NAME`, `PLATFORM_ADMIN_EMAIL`, and `PLATFORM_ADMIN_PASSWORD`.
- `CORS_ORIGIN=http://localhost:3000` for local development.

For example, generate a random secret in PowerShell with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Put that value in `JWT_SECRET`. Never commit `.env` or real patient data.

Install dependencies and check backend syntax:

```powershell
npm install
npm run check
```

Create the first platform administrator (only on an empty users collection):

```powershell
npm run seed:platform-admin
```

Start the API:

```powershell
npm run dev
```

The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health`.

## 2. Frontend setup

Open a second terminal:

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

The Next.js rewrites proxy `/api/*` requests to the Express API at `http://localhost:5000`. Change `API_PROXY_TARGET` in `frontend/.env.local` when needed. Set `NEXT_PUBLIC_SITE_URL` to the canonical origin before deployment so canonical URLs, sitemap and robots references are correct.

## 3. First-time onboarding

1. Open `/login`.
2. Sign in as the seeded platform admin with the workspace slug left blank.
3. In the private dashboard, create a hospital workspace with a unique slug and its first hospital administrator.
4. Give the hospital admin the workspace slug and initial password using an approved secure channel.
5. The hospital administrator signs in using the hospital slug and can create doctor, nurse and staff accounts for that hospital.

Public registration is deliberately disabled. Hospital slug and authenticated membership are used for tenant-scoped login. The backend derives the tenant from the authenticated user; it never accepts a client-provided tenant ID as an authorization decision.

## 4. Public contact form

Contact messages are stored in MongoDB and available to authenticated platform administrators at the platform API. In local development the anti-spam verification can be omitted for testing. **Production contact submission is disabled unless Cloudflare Turnstile is configured on both sides.** Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the frontend and `TURNSTILE_SECRET_KEY` in the backend. Configure the allowed domain in Cloudflare. Use the platform dashboard/API to review stored contact messages; do not treat this as a clinical support channel.

## API endpoints in this phase

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | API and database readiness |
| GET | `/api/auth/csrf` | Public | Initialize CSRF cookie and token |
| POST | `/api/auth/login` | Public, rate limited + CSRF | Authenticate and set HttpOnly session cookie |
| POST | `/api/auth/logout` | Authenticated + CSRF | Clear session cookie |
| GET | `/api/auth/me` | Authenticated | Current user and tenant context |
| POST | `/api/auth/users` | Hospital admin + CSRF | Create doctor, nurse or staff in own tenant |
| GET | `/api/platform/tenants` | Platform admin | List hospital workspace metadata |
| POST | `/api/platform/tenants` | Platform admin + CSRF | Create hospital and initial hospital admin |
| GET | `/api/patients` | Hospital user + tenant | Paginate patients in the current hospital (no search terms in URL) |
| POST | `/api/patients/search` | Hospital user + CSRF + tenant | Search by name, patient code or hospital record number using a request body, not a URL |
| POST | `/api/patients` | Hospital user + CSRF + tenant | Register a ward patient and audit the action |
| GET | `/api/patients/:patientId` | Hospital user + tenant | Read a patient, recent observations and audit history |
| PATCH | `/api/patients/:patientId` | Hospital admin/doctor + CSRF + tenant | Update approved demographic/ward fields |
| POST | `/api/patients/:patientId/observations` | Hospital user + CSRF + tenant | Add manually entered observations for ward or ICU-waiting patients and audit the action |
| GET | `/api/icu/beds` | Hospital user + tenant | List ICU beds and tenant-scoped status counts |
| POST | `/api/icu/beds` | Hospital admin + CSRF + tenant | Add a uniquely coded ICU bed |
| PATCH | `/api/icu/beds/:bedId` | Hospital admin/nurse/staff + CSRF + tenant | Update approved operational bed fields/status; does not allocate a patient |
| GET | `/api/icu/queue` | Hospital user + tenant | List active ICU waiting entries with observation freshness data |
| POST | `/api/icu/queue` | Hospital admin/doctor/nurse + CSRF + tenant | Add a ward patient to the provisional ICU waiting list with a staff-entered reason |
| POST | `/api/icu/queue/:queueEntryId/withdraw` | Hospital admin/doctor/nurse + CSRF + tenant | Withdraw a waiting entry with a required reason |
| POST | `/api/contact` | Public, rate limited + CSRF + production Turnstile | Save a public business inquiry |
| GET | `/api/platform/contact-messages` | Platform admin | List public contact messages |

## ML research pipeline and inference API (Phase 8)

The ML code is developed from scratch and does not reuse the previous project's processed features, models, or database. The corrected target is `target_sepsis_onset_next_6h`: inferred annotated sepsis onset within the next six hourly rows, inferred from the documented source-label shift. It is not an ICU-admission prediction or a clinical priority score.

- Target semantics and rebuild guide: `docs/phase-6-corrected-target.md`.
- Model card, known limitations and permitted use: `docs/model-card-research-candidate-v1.md`.
- Local inference API setup: `docs/phase-8-inference-api.md`.
- Prototype completion plan: `docs/prototype-readiness-roadmap.md`.

The default research reference is Histogram Gradient Boosting; weighted XGBoost is a challenger. The API requires a server-to-server key, verifies that the corrected schema/target and model metadata match, validates the numeric feature payload and returns an uncalibrated score with feature-completeness metadata. It does not store inputs or change patient records, queues, beds or allocation state. The API is **not yet connected to Express or the frontend**. Do not expose its key to browser JavaScript or expose port 8001 publicly.

The trained artifacts and raw/processed data are local and are not included in this source patch. Check `ml-service/README.md` for the exact commands to run the service with your already-generated `data/processed_onset/` and `artifacts_onset/` outputs. The existing corrected-target test report is provisional, not an independent clinical validation. Keep both models away from ICU ranking and allocation decisions.

## Tenant and role model

- `platform_admin`: manages tenant onboarding and platform-level public inquiries; not assigned to a hospital.
- `hospital_admin`: manages permitted accounts within one hospital.
- `doctor`, `nurse`, `staff`: tenant-associated roles for later clinical and operational workflows.

Tenant-aware data models and route handlers must scope reads and writes by the tenant attached to the authenticated user. New patient, document, bed and allocation endpoints must include explicit object-level authorization tests before being considered complete.

## SEO foundations

- Each public route has its own page title, description and canonical path.
- Open Graph and Twitter sharing metadata use a 1200 × 630 product preview image.
- XML sitemap includes public routes only.
- `robots.txt` disallows `/dashboard`, `/api/`, `/login` and `/thank-you`.
- Private routes must remain protected by backend authorization; `robots.txt` is not a security control.
- Set `NEXT_PUBLIC_SITE_URL` to the final canonical HTTPS URL before deployment.
- Add Google Analytics only after the production privacy configuration is reviewed. Do not send patient identifiers, report content or clinical data to analytics.
- Real testimonials are intentionally omitted until genuine feedback is available and approved for publication.

## Security notes

- Session JWT is stored in an HttpOnly cookie, not local/session storage.
- Mutating endpoints use a signed double-submit CSRF token and origin allowlist validation.
- Cookies are secure in production; configure `COOKIE_SAME_SITE` appropriately for your routing and custom-domain arrangement.
- Do not expose secrets through `NEXT_PUBLIC_*` variables except public site configuration and the public Turnstile site key.
- Set exact production `CORS_ORIGIN` values and correct `TRUST_PROXY_HOPS` for the backend host.
- Uploaded patient reports will require file-size/content validation, private storage and staff verification before extracted values are accepted.
- MFA is not implemented in this phase; add it before production use of privileged accounts.
- Run `npm audit` in both frontend and backend and update to patched releases before deployment.
- Privacy policy and terms are development drafts and require review by the operating organization before public/commercial use.

## Build roadmap

1. Public SaaS shell, secure authentication and tenant onboarding (foundation created; deployment checks still pending).
2. Patients and manually entered observations, with tenant-scoped APIs (user-tested basic workflow).
3. ICU bed readiness and provisional waiting-list management (user-tested basic workflow).
4. Corrected-target data pipeline, patient-level splits, HGB reference and XGBoost challenger (runs locally; data/model files stay local).
5. (Current) Private read-only research inference API with API-key protection, metadata/schema validation, feature completeness and automated service tests.
6. Staff-confirmed allocation lifecycle with patient/bed linkage, tenant checks, concurrency protection and audit history. This is the next operational milestone.
7. Eight-minute ICU-waiting reminder worker; ward patients are excluded and reminders never fabricate measurements.
8. Secure medical-report upload/OCR/extraction with preview, source references and staff verification before saving observations.
9. Verify the inference API against the actual local HGB artifact, then add an authenticated Express-to-Python proxy and research-only display; never feed a score into operations.
10. Transparent, clinically reviewed priority-policy prototype separate from ML; no autonomous placement.
11. What-if simulation, operational analytics, MFA, end-to-end/security testing, clean setup test and deployment hardening.
