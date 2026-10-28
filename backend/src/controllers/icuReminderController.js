import mongoose from 'mongoose';
import ICUObservationReminder from '../models/ICUObservationReminder.js';
import ICUQueueEntry from '../models/ICUQueueEntry.js';
import Patient from '../models/Patient.js';
import AuditEvent from '../models/AuditEvent.js';
import { tenantScopedFilter } from '../utils/tenantScope.js';

function validObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

export async function listICUObservationReminders(req, res, next) {
  try {
    const reminders = await ICUObservationReminder.find(
      tenantScopedFilter(req, { status: 'pending' })
    ).sort({ firstGeneratedAt: 1, _id: 1 }).limit(100).lean();

    if (!reminders.length) {
      res.set('Cache-Control', 'no-store');
      return res.json({ reminders: [], count: 0 });
    }

    const queueIds = [...new Set(reminders.map((item) => item.queueEntryId.toString()))];
    const queueEntries = await ICUQueueEntry.find(tenantScopedFilter(req, {
      _id: { $in: queueIds }, status: 'waiting'
    })).select('_id patientId enteredAt').lean();
    const activeQueueMap = new Map(queueEntries.map((entry) => [entry._id.toString(), entry]));
    const patientIds = [...new Set(queueEntries.map((entry) => entry.patientId.toString()))];
    const patients = patientIds.length ? await Patient.find(tenantScopedFilter(req, {
      _id: { $in: patientIds }, status: 'icu_waiting'
    })).select('_id fullName patientCode wardName bedLabel status').lean() : [];
    const patientMap = new Map(patients.map((patient) => [patient._id.toString(), patient]));

    const visible = reminders.flatMap((reminder) => {
      const queueEntry = activeQueueMap.get(reminder.queueEntryId.toString());
      const patient = patientMap.get(reminder.patientId.toString());
      if (!queueEntry || !patient || queueEntry.patientId.toString() !== patient._id.toString()) return [];
      return [{
        id: reminder._id.toString(),
        queueEntryId: queueEntry._id.toString(),
        patient: {
          id: patient._id.toString(), fullName: patient.fullName,
          patientCode: patient.patientCode, wardName: patient.wardName,
          bedLabel: patient.bedLabel || ''
        },
        reason: reminder.reason,
        latestObservationAt: reminder.latestObservationAt || null,
        firstGeneratedAt: reminder.firstGeneratedAt,
        lastRemindedAt: reminder.lastRemindedAt,
        reminderCount: reminder.reminderCount,
        status: reminder.status
      }];
    });

    res.set('Cache-Control', 'no-store');
    return res.json({ reminders: visible, count: visible.length });
  } catch (error) { return next(error); }
}

export async function acknowledgeICUObservationReminder(req, res, next) {
  if (!validObjectId(req.params.reminderId)) {
    return res.status(400).json({ error: 'Reminder identifier is invalid' });
  }

  let session;
  try {
    session = await mongoose.startSession();
    let result = null;
    await session.withTransaction(async () => {
      const reminder = await ICUObservationReminder.findOne(
        tenantScopedFilter(req, { _id: req.params.reminderId, status: 'pending' })
      ).session(session);
      if (!reminder) {
        const error = new Error('An active reminder was not found in this hospital workspace');
        error.statusCode = 404;
        throw error;
      }

      const queueEntry = await ICUQueueEntry.findOne(tenantScopedFilter(req, {
        _id: reminder.queueEntryId, patientId: reminder.patientId, status: 'waiting'
      })).session(session);
      const patient = queueEntry ? await Patient.findOne(tenantScopedFilter(req, {
        _id: reminder.patientId, status: 'icu_waiting'
      })).session(session) : null;

      const now = new Date();
      if (!queueEntry || !patient) {
        reminder.status = 'superseded';
        reminder.supersededAt = now;
        reminder.supersededReason = 'queue_no_longer_active';
        await reminder.save({ session });
        result = { stale: true };
        return;
      }

      reminder.status = 'acknowledged';
      reminder.acknowledgedAt = now;
      reminder.acknowledgedByUserId = req.user._id;
      await reminder.save({ session });

      await AuditEvent.create([{
        tenantId: req.tenantId,
        actorUserId: req.user._id,
        eventType: 'icu_observation_reminder.acknowledged',
        entityType: 'ICUQueueEntry',
        entityId: queueEntry._id,
        referenceCode: patient.patientCode,
        fieldNames: ['reminderStatus', 'acknowledgedAt', 'acknowledgedByUserId']
      }], { session });
      result = { stale: false, id: reminder._id.toString(), acknowledgedAt: now };
    });

    if (result?.stale) {
      return res.status(409).json({ error: 'This reminder is no longer active because the patient is no longer waiting for ICU.' });
    }
    return res.json({ reminder: result, message: 'Reminder acknowledged. This does not replace recording updated observations.' });
  } catch (error) { return next(error); }
  finally { await session?.endSession(); }
}
