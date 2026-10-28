import ICUObservationReminder from '../models/ICUObservationReminder.js';

export async function supersedePendingQueueReminder({ session, tenantId, queueEntryId, reason, at = new Date() }) {
  if (!tenantId || !queueEntryId) return { modifiedCount: 0 };
  return ICUObservationReminder.updateMany(
    { tenantId, queueEntryId, status: 'pending' },
    { $set: { status: 'superseded', supersededAt: at, supersededReason: reason } },
    { session }
  );
}

export async function supersedePendingPatientReminders({ session, tenantId, patientId, reason, at = new Date() }) {
  if (!tenantId || !patientId) return { modifiedCount: 0 };
  return ICUObservationReminder.updateMany(
    { tenantId, patientId, status: 'pending' },
    { $set: { status: 'superseded', supersededAt: at, supersededReason: reason } },
    { session }
  );
}
