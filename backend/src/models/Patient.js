import mongoose from 'mongoose';
import { PATIENT_STATUSES, SEX_AT_BIRTH_OPTIONS } from '../utils/patientConstants.js';

export { PATIENT_STATUSES, SEX_AT_BIRTH_OPTIONS };

const patientSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientCode: { type: String, required: true, trim: true, maxlength: 24 },
  hospitalRecordNumber: { type: String, trim: true, maxlength: 40, default: '' },
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  dateOfBirth: { type: Date, default: null },
  sexAtBirth: { type: String, enum: SEX_AT_BIRTH_OPTIONS, default: 'not_recorded' },
  wardName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  bedLabel: { type: String, trim: true, maxlength: 30, default: '' },
  admittedAt: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: PATIENT_STATUSES, default: 'ward', index: true },
  activeICUBedId: { type: mongoose.Schema.Types.ObjectId, ref: 'ICUBed', default: null },
  activeICUQueueEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ICUQueueEntry', default: null },
  icuAdmittedAt: { type: Date, default: null },
  lastICUDischargedAt: { type: Date, default: null },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true, versionKey: false });

patientSchema.index({ tenantId: 1, patientCode: 1 }, { unique: true, name: 'tenant_patient_code_unique' });
patientSchema.index({ tenantId: 1, createdAt: -1 }, { name: 'tenant_patient_created_desc' });
patientSchema.index({ tenantId: 1, fullName: 1 }, { name: 'tenant_patient_name' });
patientSchema.index({ tenantId: 1, status: 1, activeICUBedId: 1 }, { name: 'tenant_patient_active_icu_admission' });

export default mongoose.model('Patient', patientSchema);
