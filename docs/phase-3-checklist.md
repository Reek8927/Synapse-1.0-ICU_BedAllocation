# Phase 3 Checklist — ICU Bed Inventory and Provisional Waiting List

## Implemented in the codebase
- [x] Tenant-scoped ICU bed model with unique bed code per hospital.
- [x] Bed states: ready, occupied, cleaning, preparing, unavailable.
- [x] Hospital-admin-only bed creation.
- [x] Hospital-admin/nurse/staff bed status updates.
- [x] Tenant-scoped active ICU waiting list.
- [x] Queue request requires a hospital-owned ward patient and a staff-entered reason.
- [x] Duplicate active waiting entries are blocked by a compound partial unique index.
- [x] Queue withdrawal requires a reason and returns the patient to ward status.
- [x] ICU-waiting patients can receive additional manual observations.
- [x] Latest observation timestamp is shown in the queue.
- [x] Bed and queue actions produce audit events.
- [x] Validation, tenant scoping, role permissions and CSRF checks applied to mutating routes.
- [x] Provisional queue ordering is explicit and non-clinical.

## Verify locally before continuing
- [ ] Run `npm run check` in `backend`.
- [ ] Run `npm test` in `backend`.
- [ ] Sign in as a hospital administrator and add two synthetic ICU beds.
- [ ] Change a bed to cleaning/preparing and check the summary counts.
- [ ] Add a synthetic ward patient to the ICU waiting list with a reason.
- [ ] Confirm the patient status changes to `icu_waiting`.
- [ ] Open the patient record again and add a new observation while waiting.
- [ ] Confirm the queue shows the latest observation timestamp.
- [ ] Withdraw the queue entry with a reason and confirm the patient returns to ward status.
- [ ] Test that a user in a second hospital cannot list, update or withdraw records belonging to the first hospital.

## Explicitly not implemented in Phase 3
- Clinical prioritization or automatic risk scoring.
- Staff-confirmed bed allocation or transfer to ICU-admitted status.
- Eight-minute reminder scheduler.
- Automated clinical reassessment or admission recommendations.

Use synthetic records only. The queue ordering is for workflow demonstration and must not be used for real patient triage.
