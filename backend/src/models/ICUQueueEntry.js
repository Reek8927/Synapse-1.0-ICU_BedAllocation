import mongoose from 'mongoose';

const icuQueueEntrySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  status: { type: String, enum: ['waiting', 'withdrawn', 'admitted'], required: true, default: 'waiting', index: true },
  requestReason: { type: String, required: true, trim: true, minlength: 3, maxlength: 1000 },
  // Staff-assigned review tier; never derived from vital signs or ML output.
  reviewPriority: { type: String, enum: ['immediate_review', 'urgent_review', 'routine_review', null], default: null },
  priorityReason: { type: String, trim: true, maxlength: 500, default: '' },
  priorityReviewRequired: { type: Boolean, default: true, index: true },
  priorityReviewRequestedAt: { type: Date, default: Date.now },
  priorityReviewedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  priorityReviewedAt: { type: Date, default: null },
  enteredByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  enteredAt: { type: Date, required: true, default: Date.now },
  // Runtime reminder cadence is based on when staff last entered observations,
  // not merely the clinical observation timestamp which may be backdated.
  lastObservationAtForReminder: { type: Date, default: null },
  lastReminderAt: { type: Date, default: null },
  withdrawnByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  withdrawnAt: { type: Date, default: null },
  withdrawalReason: { type: String, trim: true, maxlength: 500, default: '' },
  allocatedBedId: { type: mongoose.Schema.Types.ObjectId, ref: 'ICUBed', default: null },
  confirmedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  confirmedAt: { type: Date, default: null },
  confirmationReason: { type: String, trim: true, maxlength: 500, default: '' },
  dischargedAt: { type: Date, default: null },
  dischargedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dischargeDisposition: { type: String, enum: ['ward', 'discharged', null], default: null },
  dischargeReason: { type: String, trim: true, maxlength: 500, default: '' }
}, { timestamps: true, versionKey: false });

// A patient may have only one active waiting entry within one hospital.
icuQueueEntrySchema.index(
  { tenantId: 1, patientId: 1 },
  { unique: true, partialFilterExpression: { status: 'waiting' }, name: 'tenant_patient_active_icu_queue_unique' }
);
icuQueueEntrySchema.index({ tenantId: 1, status: 1, enteredAt: 1 }, { name: 'tenant_icu_queue_order' });
icuQueueEntrySchema.index({ tenantId: 1, status: 1, priorityReviewRequired: 1, reviewPriority: 1, enteredAt: 1 }, { name: 'tenant_icu_queue_staff_priority_order' });
icuQueueEntrySchema.index({ status: 1, lastObservationAtForReminder: 1, lastReminderAt: 1, enteredAt: 1 }, { name: 'icu_queue_reminder_due' });

export default mongoose.model('ICUQueueEntry', icuQueueEntrySchema);
