import mongoose from 'mongoose';

const icuObservationReminderSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  queueEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ICUQueueEntry', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  reason: { type: String, enum: ['no_observations_recorded', 'observation_update_due'], required: true },
  latestObservationAt: { type: Date, default: null },
  firstGeneratedAt: { type: Date, required: true, default: Date.now },
  lastRemindedAt: { type: Date, required: true, default: Date.now },
  reminderCount: { type: Number, min: 1, default: 1 },
  status: { type: String, enum: ['pending', 'acknowledged', 'superseded'], required: true, default: 'pending', index: true },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  supersededAt: { type: Date, default: null },
  supersededReason: { type: String, enum: ['observation_recorded', 'queue_withdrawn', 'patient_admitted', 'queue_no_longer_active', null], default: null }
}, { timestamps: true, versionKey: false });

// At most one open in-app reminder per queue entry. The worker updates this
// reminder every interval rather than creating an unbounded stack of alerts.
icuObservationReminderSchema.index(
  { tenantId: 1, queueEntryId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'tenant_queue_one_pending_reminder' }
);
icuObservationReminderSchema.index(
  { tenantId: 1, status: 1, lastRemindedAt: -1 },
  { name: 'tenant_reminder_inbox' }
);

export default mongoose.model('ICUObservationReminder', icuObservationReminderSchema);
