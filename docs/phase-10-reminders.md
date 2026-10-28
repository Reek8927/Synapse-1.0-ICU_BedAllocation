# Phase 10: Eight-minute ICU observation reminders

## Scope

This phase adds a separately run Node.js worker and a hospital-scoped in-app reminder inbox for patients whose ICU queue entry is still `waiting`. It does not notify ward-only patients. The worker never invents measurements, computes clinical risk, changes queue order, or allocates beds.

## Reminder behavior

- Default reminder interval: 8 minutes.
- Worker polling default: every 15 seconds. This means a reminder becomes due at 8 minutes and is generally persisted on the next polling cycle.
- The cadence uses the latest observation's clinical `observedAt` timestamp, not just when someone typed the value into the application.
- If there are no observations, the interval starts from when the patient entered the ICU waiting list.
- Each active ICU queue entry can have at most one pending in-app reminder. While the observation remains due, the worker updates the reminder count and last-reminded time at each eight-minute interval instead of creating an unbounded list.
- A recently timestamped new observation supersedes a pending reminder. A backdated/old reading does not clear a reminder asking staff to collect fresh measurements.
- Queue withdrawal or confirmed admission supersedes pending reminders for that queue entry.
- Reminder acknowledgements are recorded with the authenticated staff member and time. Acknowledging a reminder does not replace entering observations, alter clinical risk, or remove the patient from the queue.
- Reminder data is tenant-scoped. The reminder API requires authentication and a hospital workspace.

## In-app only limitation

This is a persistent in-app reminder inbox. The browser refreshes the inbox while the dashboard is open; reminders remain stored if nobody is logged in and show when a staff member returns. This phase does not send email, SMS, mobile push, or a system-level notification. Those require a separately configured delivery provider and delivery/error monitoring.

## Apply the patch

Merge the patch files into the current `BedAllocation-Rebuild` project. Keep `backend/.env`, `frontend/.env.local`, the Python `.venv`, ML datasets and model artifacts, and MongoDB data unchanged. Do not run either administrator seed script again.

The worker reads the existing backend `MONGODB_URI` and other settings from `backend/.env`. No new secret is required. Optional settings are shown in `backend/.env.example`:

- `ICU_REMINDER_INTERVAL_MINUTES=8`
- `ICU_REMINDER_POLL_INTERVAL_MS=15000`

## Run the project locally

Use three terminals from the same project copy.

**Terminal 1: backend API**

```powershell
cd backend
npm run check
npm test
npm run dev
```

**Terminal 2: Next.js frontend**

```powershell
cd frontend
npm run dev
```

**Terminal 3: reminder worker**

```powershell
cd backend
npm run reminders:worker
```

Keep the third terminal running. The worker performs an immediate sweep and then polls at the configured interval. `Ctrl+C` stops it. `npm run reminders:once` runs a single sweep and exits, which is useful for diagnostics.

For a quick synthetic-data test, set a shorter interval only in the worker terminal before launching it:

```powershell
$env:ICU_REMINDER_INTERVAL_MINUTES = "1"
$env:ICU_REMINDER_POLL_INTERVAL_MS = "15000"
npm run reminders:worker
```

Use only a synthetic ICU-waiting patient for this test. After verifying the reminder, stop the worker with `Ctrl+C`. Remove the temporary overrides or close that terminal before running at the default eight-minute interval. Do not change the `.env` file for this short test.

## Acceptance test

1. Add a synthetic ward patient and one or more manual observations.
2. Add that patient to the ICU waiting list.
3. Start the worker in the third terminal.
4. With the default interval, wait at least 8–9 minutes; for a quicker smoke test, use the temporary one-minute worker override above.
5. Confirm an in-app reminder appears in **ICU observation reminders** after the next worker poll.
6. Acknowledge it. Confirm the message says that acknowledgement does not replace new measurements.
7. Enter a fresh, current observation for the waiting patient. The pending reminder should disappear/supersede, and the next reminder should be due only after the fresh observation becomes eight minutes old.
8. Test entering a backdated observation older than the interval; that must not clear the reminder.
9. Withdraw the waiting entry or confirm ICU allocation; its reminder must disappear from the active inbox.
10. Verify that a user from another hospital cannot view or acknowledge these reminders.
11. Keep a ward-only patient in ward status and verify that this worker never creates a reminder for that patient.

## Deployment requirements

Deploy the worker as a separate long-running process that can access the same MongoDB database. It must be monitored for crashes, database connection errors and repeated failed sweeps. MongoDB transactions and indexes are required; use the same supported deployment class as the existing staff-confirmed allocation workflow (for example, MongoDB Atlas). Avoid running multiple independent workers unnecessarily; conditional queue-entry updates and the unique pending-reminder index provide duplicate protection, but deployment still needs monitoring.

## Safety boundary

Reminder status is operational workflow data only. It is not a clinical-risk score. If no fresh observation exists, the system keeps the last stored data/time and prompts staff; it never fabricates measurements or changes a risk score because time passed. The reminder does not autonomously decide whether a patient should receive ICU admission.
