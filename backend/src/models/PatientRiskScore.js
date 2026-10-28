import mongoose from 'mongoose';

// One row per scoring run. The latest row per patient drives the ML-ranked ICU queue.
const patientRiskScoreSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  scoredAt: { type: Date, required: true, default: Date.now },
  observationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientObservation', default: null },
  observationAt: { type: Date, default: null },
  stale: { type: Boolean, default: false },
  modelStatus: { type: String, enum: ['available', 'withheld', 'unavailable'], required: true },
  modelKey: { type: String, default: '' },
  modelScore: { type: Number, min: 0, max: 1, default: null },
  featuresSupplied: { type: Number, default: 0 },
  news2: { type: Number, default: null },
  news2ParametersUsed: { type: Number, default: 0 },
  priorityScore: { type: Number, required: true },
  riskLevel: { type: String, enum: ['high', 'medium', 'low'], required: true },
  icuRecommendation: { type: String, enum: ['icu_recommended', 'icu_review', 'icu_not_indicated'], required: true },
  reasons: { type: [String], default: [] }
}, { timestamps: false, versionKey: false });

patientRiskScoreSchema.index({ tenantId: 1, patientId: 1, scoredAt: -1 }, { name: 'tenant_patient_risk_latest' });

export default mongoose.model('PatientRiskScore', patientRiskScoreSchema);
