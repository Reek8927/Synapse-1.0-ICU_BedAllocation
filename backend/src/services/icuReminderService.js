import mongoose from 'mongoose';
import ICUQueueEntry from '../models/ICUQueueEntry.js';
import ICUObservationReminder from '../models/ICUObservationReminder.js';
import Patient from '../models/Patient.js';
import PatientObservation from '../models/PatientObservation.js';
import { isObservationReminderDue, normalizeReminderIntervalMinutes } from '../utils/reminderTiming.js';

const NO_ACTIVE_PATIENT = 'REMINDER_SKIP_NO_ACTIVE_PATIENT';

export async function processDueICUObservationReminders({ now = new Date(), intervalMinutes = process.env.ICU_REMINDER_INTERVAL_MINUTES, batchSize = 1000 } = {}) {
  const normalizedMinutes = normalizeReminderIntervalMinutes(intervalMinutes, 8);
  const intervalMs = normalizedMinutes * 60 * 1000;
  const cutoff = new Date(now.getTime() - intervalMs);
  const stats = { scanned: 0, created: 0, repeated: 0, skipped: 0, errors: 0, intervalMinutes: normalizedMinutes };

  // This worker intentionally scans only active ICU-waiting queue entries.
  // Ward patients never receive recurring reminders.
  const candidates = await ICUQueueEntry.find({
    status: 'waiting',
    $and: [
      { $or: [
        { lastObservationAtForReminder: { $lte: cutoff } },
        { lastObservationAtForReminder: { $exists: false } },
        { lastObservationAtForReminder: null }
      ] },
      { $or: [
        { lastReminderAt: null },
        { lastReminderAt: { $exists: false } },
        { lastReminderAt: { $lte: cutoff } }
      ] }
    ]
  })
    .select('_id tenantId patientId enteredAt lastObservationAtForReminder lastReminderAt')
    .sort({ enteredAt: 1, _id: 1 })
    .limit(Math.max(1, Math.min(5000, Number.parseInt(String(batchSize), 10) || 1000)))
    .lean();
  stats.scanned = candidates.length;

  for (const candidate of candidates) {
    if (!isObservationReminderDue(candidate, now, intervalMs)) {
      stats.skipped += 1;
      continue;
    }

    const session = await mongoose.startSession();
    let outcome = 'skipped';
    try {
      await session.withTransaction(async () => {
        outcome = 'skipped';
        const patient = await Patient.findOne({
          _id: candidate.patientId,
          tenantId: candidate.tenantId,
          status: 'icu_waiting'
        }).select('_id patientCode status').session(session).lean();
        if (!patient) throw new Error(NO_ACTIVE_PATIENT);

        // Claim the interval in the same transaction as the reminder write.
        // Concurrent workers must not generate two reminders for the same interval.
        const claimed = await ICUQueueEntry.findOneAndUpdate({
          _id: candidate._id,
          tenantId: candidate.tenantId,
          status: 'waiting',
          $and: [
            { $or: [
              { lastObservationAtForReminder: { $lte: cutoff } },
              { lastObservationAtForReminder: { $exists: false } },
              { lastObservationAtForReminder: null }
            ] },
            { $or: [
              { lastReminderAt: null },
              { lastReminderAt: { $exists: false } },
              { lastReminderAt: { $lte: cutoff } }
            ] }
          ]
        }, { $set: { lastReminderAt: now } }, { new: true, session });
        if (!claimed) {
          outcome = 'skipped';
          return;
        }

        const latestObservation = await PatientObservation.findOne({
          tenantId: candidate.tenantId,
          patientId: candidate.patientId
        }).sort({ observedAt: -1, createdAt: -1, _id: -1 }).select('observedAt createdAt').session(session).lean();

        const reason = latestObservation ? 'observation_update_due' : 'no_observations_recorded';
        const existing = await ICUObservationReminder.findOne({
          tenantId: candidate.tenantId,
          queueEntryId: candidate._id,
          status: 'pending'
        }).session(session);

        if (existing) {
          existing.latestObservationAt = latestObservation?.observedAt ?? null;
          existing.lastRemindedAt = now;
          existing.reminderCount = Math.max(1, existing.reminderCount || 1) + 1;
          existing.reason = reason;
          await existing.save({ session });
          outcome = 'repeated';
        } else {
          await ICUObservationReminder.create([{
            tenantId: candidate.tenantId,
            queueEntryId: candidate._id,
            patientId: candidate.patientId,
            reason,
            latestObservationAt: latestObservation?.observedAt ?? null,
            firstGeneratedAt: now,
            lastRemindedAt: now,
            reminderCount: 1,
            status: 'pending'
          }], { session });
          outcome = 'created';
        }
      });
    } catch (error) {
      if (error.message === NO_ACTIVE_PATIENT) {
        stats.skipped += 1;
        outcome = 'counted_skip';
      } else if (error?.code === 11000 || error?.hasErrorLabel?.('TransientTransactionError')) {
        // A simultaneous worker or transaction retry may have won the claim.
        stats.skipped += 1;
        outcome = 'counted_skip';
      } else {
        stats.errors += 1;
        outcome = 'counted_error';
        // Do not log patient names, observations, or other health information.
        console.error(`ICU reminder processing error (${error?.name || 'Error'}).`);
      }
    } finally {
      await session.endSession();
    }

    if (outcome === 'created') stats.created += 1;
    else if (outcome === 'repeated') stats.repeated += 1;
    else if (outcome === 'skipped') stats.skipped += 1;
  }

  return stats;
}
