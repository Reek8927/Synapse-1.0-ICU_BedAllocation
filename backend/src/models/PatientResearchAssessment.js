
import mongoose from 'mongoose';

const patientResearchAssessmentSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
    immutable: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true,
    immutable: true
  },
  recordedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  },
  assessmentType: {
    type: String,
    enum: ['sepsis_research_data'],
    required: true,
    default: 'sepsis_research_data',
    immutable: true
  },
  assessedAt: {
    type: Date,
    required: true
  },
  glucose: {
    type: Number,
    required: true,
    min: 0,
    max: 2000
  },
  glucoseUnit: {
    type: String,
    enum: ['mg/dL'],
    default: 'mg/dL',
    required: true,
    immutable: true
  },
  lactate: {
    type: Number,
    required: true,
    min: 0,
    max: 50
  },
  lactateUnit: {
    type: String,
    enum: ['mmol/L'],
    default: 'mmol/L',
    required: true,
    immutable: true
  },
  creatinine: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  creatinineUnit: {
    type: String,
    enum: ['mg/dL'],
    default: 'mg/dL',
    required: true,
    immutable: true
  },
  wbc: {
    type: Number,
    required: true,
    min: 0,
    max: 1000
  },
  wbcUnit: {
    type: String,
    enum: ['10^9/L'],
    default: '10^9/L',
    required: true,
    immutable: true
  },
  platelets: {
    type: Number,
    required: true,
    min: 0,
    max: 10000
  },
  plateletsUnit: {
    type: String,
    enum: ['10^9/L'],
    default: '10^9/L',
    required: true,
    immutable: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  }
}, {
  timestamps: true,
  versionKey: false
});

patientResearchAssessmentSchema.index(
  { tenantId: 1, patientId: 1, assessedAt: -1 },
  { name: 'tenant_patient_research_assessment_time' }
);

export default mongoose.model(
  'PatientResearchAssessment',
  patientResearchAssessmentSchema
);
