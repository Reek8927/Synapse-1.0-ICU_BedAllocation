import mongoose from 'mongoose';

const patientObservationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  recordedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required() { return this.entrySource === 'manual'; }, default: null },
  entrySource: { type: String, enum: ['manual', 'monitor'], default: 'manual', immutable: true },
  observedAt: { type: Date, required: true, default: Date.now },
  temperatureC: { type: Number, min: 0, max: 60, default: null },
  heartRateBpm: { type: Number, min: 0, max: 400, default: null },
  systolicBpMmhg: { type: Number, min: 0, max: 400, default: null },
  diastolicBpMmhg: { type: Number, min: 0, max: 300, default: null },
  respiratoryRateBpm: { type: Number, min: 0, max: 200, default: null },
  oxygenSaturationPercent: { type: Number, min: 0, max: 100, default: null },
  gcsTotal: { type: Number, min: 3, max: 15, default: null },
  notes: { type: String, trim: true, maxlength: 2000, default: '' }
}, { timestamps: true, versionKey: false });

patientObservationSchema.index({ tenantId: 1, patientId: 1, observedAt: -1 }, { name: 'tenant_patient_observation_time' });

export default mongoose.model('PatientObservation', patientObservationSchema);
