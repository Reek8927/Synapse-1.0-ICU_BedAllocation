import mongoose from 'mongoose';
import { ICU_BED_STATUSES } from '../utils/icuConstants.js';

export { ICU_BED_STATUSES };

const icuBedSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  bedCode: { type: String, required: true, trim: true, uppercase: true, minlength: 1, maxlength: 24 },
  unitName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80, default: 'ICU' },
  locationLabel: { type: String, trim: true, maxlength: 80, default: '' },
  status: { type: String, enum: ICU_BED_STATUSES, required: true, default: 'ready', index: true },
  assignedPatientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
  assignedQueueEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ICUQueueEntry', default: null },
  assignedAt: { type: Date, default: null },
  assignedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastStatusChangedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true, versionKey: false });

icuBedSchema.index({ tenantId: 1, bedCode: 1 }, { unique: true, name: 'tenant_icu_bed_code_unique' });
icuBedSchema.index({ tenantId: 1, status: 1, unitName: 1 }, { name: 'tenant_icu_bed_status' });
icuBedSchema.index(
  { tenantId: 1, assignedPatientId: 1 },
  { unique: true, partialFilterExpression: { assignedPatientId: { $type: 'objectId' } }, name: 'tenant_one_active_bed_per_patient' }
);

export default mongoose.model('ICUBed', icuBedSchema);
