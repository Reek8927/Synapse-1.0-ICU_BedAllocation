# Phase 9: Staff-confirmed ICU allocation

## Scope

This phase adds an operational allocation lifecycle to the existing hospital-scoped bed inventory and ICU waiting list. It intentionally does **not** use ML scores or the chronological queue order as clinical priority. A doctor or hospital administrator selects a patient and a ready bed after following the hospital's clinical procedure, records a confirmation reason, and explicitly confirms placement.

## New endpoints

All endpoints require an authenticated hospital workspace. Mutating endpoints also require the application's CSRF token.

- `GET /api/icu/admissions` — list active admissions and their linked beds.
- `POST /api/icu/queue/:queueEntryId/confirm-allocation` — hospital administrator or doctor only; JSON body: `{ "bedId": "<ObjectId>", "confirmationReason": "..." }`.
- `POST /api/icu/admissions/:patientId/discharge` — hospital administrator or doctor only; JSON body: `{ "disposition": "ward" | "discharged", "reason": "..." }`.

## Allocation invariants

1. The queue entry must still be `waiting`, and the patient must still be `icu_waiting` in the authenticated tenant.
2. The selected bed must belong to the same tenant, be `ready`, and have no assigned patient.
3. The transaction marks the bed occupied and links it to the patient and queue entry, changes the queue entry to `admitted`, changes the patient to `icu_admitted`, records the confirmation user/time/reason, and writes audit events.
4. If any conditional update fails, the transaction is aborted. A retry must reload current bed and queue data.
5. The allocation workflow does not infer eligibility or calculate priority. The active queue display remains first-in, first-out for operational visibility only.
6. Manual bed edits cannot create occupied/reserved states, nor change the status of a bed with an active assignment.

## Discharge/transfer invariants

1. Only an active `icu_admitted` patient with consistent bed and queue links can be closed through this workflow.
2. The staff member must specify `ward` or `discharged` disposition and a reason.
3. The bed assignment is cleared and the bed moves to `cleaning`, not `ready`.
4. The patient is moved to `ward` or `discharged`, active admission links are cleared, historical queue/allocation fields remain, and audit events are recorded in the same transaction.
5. Staff must explicitly change a cleaned bed to `ready` after the hospital's readiness check.

## Database requirement

Allocation and discharge use MongoDB transactions. The configured MongoDB deployment must support transactions (for example, MongoDB Atlas or a replica set). A standalone local `mongod` does not support multi-document transactions. Do not disable transactions to work around that requirement.

Mongoose declares a partial unique index to prevent one patient from being linked to multiple active beds. For production deployment, verify that indexes have been built successfully. Back up the database before deploying schema changes.

## Roles

- Hospital admin / doctor: confirm allocation and close an active ICU admission.
- Hospital admin: create beds.
- Hospital admin / nurse / staff: maintain operational bed readiness, except they cannot manually set occupied/reserved or alter the status of a bed with an active assignment.
- Hospital admin / doctor / nurse: add and withdraw waiting-list entries.

Actual role policy must be reviewed by each hospital before any real-world use.

## Local acceptance test using synthetic records

1. Log in to a hospital workspace as a hospital administrator or doctor.
2. Register a synthetic patient and add the patient to the ICU waiting list with a reason.
3. Ensure the hospital has at least one bed in `ready` status.
4. On the queue entry, select a ready bed, enter a confirmation reason, and use **Review and confirm placement**. Confirm the browser prompt.
5. Verify the patient moves to `icu_admitted`, disappears from the waiting list, appears in Active ICU admissions, and the bed becomes `occupied` with the patient code displayed.
6. Attempt another allocation to the same bed; it must fail with a conflict and must not alter either patient.
7. Close the active admission with a reason and choose Return to ward (for test coverage, repeat with another synthetic admission choosing Discharged from hospital).
8. Verify the patient status is updated, the bed becomes `cleaning`, the assignment is cleared, and the audit history contains the confirmation and discharge events.
9. Change that bed from `cleaning` to `ready` only after explicitly verifying its state.
10. Verify a user from a different tenant cannot access the patient, queue entry, or bed.

## Not included

- No automatic clinical priority ranking.
- No recommendation derived from either research ML model.
- No automated admission or bed placement.
- No eight-minute reminder worker in this phase.
- No active ICU vital-sign observation screen in this phase.

This is prototype workflow software and is not clinically validated. Use synthetic data for development and demonstrations.
