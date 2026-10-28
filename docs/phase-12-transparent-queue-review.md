# Phase 12 — Transparent ICU Queue Review

## Purpose

This phase adds a transparent, auditable *staff-assigned review tier* to the ICU waiting list. It is an operational workflow improvement, not an automated clinical triage score. It does not use vital signs, the research ML model, or report extraction to assign tiers.

## What changes

- Every new waiting-list entry starts with **Staff review required** and no assigned tier.
- Only a hospital administrator or doctor can assign or change a review tier through the server API.
- Three staff-entered tiers are supported: **Immediate review**, **Urgent review**, and **Routine review**.
- A meaningful reason is required. The API records the reviewing user and timestamp, and writes an audit event.
- The queue is ordered transparently:
  1. Entries that need staff review appear first, oldest request first.
  2. Reviewed entries are ordered by the staff-assigned tier (Immediate, Urgent, Routine), then oldest request first.
- When staff records a new observation for a patient who is waiting for ICU, the queue entry is marked **review required** again. The prior tier and reason remain visible as history/context until a doctor or hospital administrator reviews and updates it.
- The API remains tenant-scoped. Client requests cannot provide their own tenant, review user, timestamp, or audit fields.

## What this does not do

- It does not calculate clinical urgency from measurements.
- It does not use the ML score.
- It does not diagnose, determine ICU eligibility, assign a bed, or confirm ICU admission.
- It does not replace a hospital's approved triage policy or clinical judgment.
- Queue position is an operational display order, not a recommendation that one patient medically needs ICU more than another.

An authorized doctor or hospital administrator must assign review tiers under the hospital's own approved procedure. Staff must continue to apply their institutional process for urgent deterioration.

## API

`PATCH /api/icu/queue/:queueEntryId/priority`

Hospital roles: `hospital_admin` and `doctor` only. The request requires CSRF protection and a JSON body containing exactly:

```json
{
  "reviewPriority": "urgent_review",
  "reason": "Reviewed by the responsible clinician under hospital policy"
}
```

Allowed `reviewPriority` values: `immediate_review`, `urgent_review`, `routine_review`.

The backend confirms that the queue entry is active and belongs to the authenticated hospital, validates the linked patient's waiting status, then records priority and audit metadata in a transaction.

## Files changed

- `backend/src/models/ICUQueueEntry.js`
- `backend/src/utils/icuValidation.js`
- `backend/src/utils/icuQueuePriority.js`
- `backend/src/controllers/icuController.js`
- `backend/src/controllers/patientController.js`
- `backend/src/routes/icuRoutes.js`
- `backend/test/icuValidation.test.js`
- `backend/test/icuQueuePriority.test.js`
- `backend/package.json` (syntax check includes new utility)
- `frontend/app/components/ICUWorkspace.jsx`
- `frontend/app/globals.css`

## Test checklist

1. Add a synthetic ward patient to the ICU waiting list. It should show **Review required** and **Not assigned yet**.
2. Sign in as a doctor or hospital administrator and assign a tier with a reason.
3. Confirm the queue changes to reviewed and the actor, timestamp, and reason are shown.
4. Assign different tiers to synthetic waiting patients and confirm the queue order follows the documented policy.
5. Add a new observation to a waiting patient. The queue entry should return to **Review required** and move to the pending-review group.
6. Confirm nurses and operations staff cannot call the priority-setting endpoint successfully.
7. Confirm users from another hospital cannot view or change the record.
8. Test staff-confirmed allocation remains separate and still works.

## Prototype status

This feature is intended for a synthetic-data hackathon prototype. It has unit-test coverage for ordering and input validation. The full workflow must be verified in the local application. Before any real-world deployment, the review tiers and workflow require hospital governance, clinical review, security assessment, and validation against local policies.
