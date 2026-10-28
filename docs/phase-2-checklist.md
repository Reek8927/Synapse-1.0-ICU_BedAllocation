# Phase 2 verification checklist: ward patients and observations

## Automated checks

- [x] Backend JavaScript syntax checks include patient controllers, models, validation and routes.
- [x] Validation tests cover patient fields, disallowed tenant/status fields, date validation, observation value bounds and observation timestamps.
- [x] Tenant filter unit tests confirm the authenticated tenant cannot be overridden by request filters.
- [ ] Run `npm install`, `npm run check` and `npm test` in the backend on the target machine.
- [ ] Build the Next.js frontend after dependency installation.

## Manual integration checks against MongoDB Atlas / replica set

- [ ] A hospital administrator, doctor, nurse and staff user can see only their own hospital's patient records.
- [ ] A platform administrator cannot access patient endpoints as a hospital user.
- [ ] Patient registration generates a server-side patient code and starts with `ward` status.
- [ ] Client attempts to set `tenantId`, `patientCode`, or `status` during registration/update are rejected.
- [ ] Searching by patient name, code and hospital record number works without regex injection. Search terms are sent in a POST body rather than a URL.
- [ ] Patient IDs from another tenant return no patient record and cannot be updated or receive observations.
- [ ] A manual observation requires at least one valid measurement and rejects out-of-range or malformed values.
- [ ] Observation time cannot be in the future beyond the allowed five-minute tolerance or before admission.
- [ ] The patient detail screen displays the latest observations and missing measurements explicitly.
- [ ] Patient registration, updates and observation writes create audit events within the same database transaction.
- [ ] Patient API responses use `Cache-Control: no-store`.
- [ ] The system does not produce clinical risk scores, ICU queue changes or allocation actions in this phase.

## Operational caution

The transaction implementation requires MongoDB Atlas or a MongoDB replica set. Do not use real patient data during development or the hackathon demonstration. This phase does not provide validated clinical alerts or ICU recommendations.
