import mongoose from 'mongoose';

const auditEventSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventType: { type: String, required: true, maxlength: 80 },
  entityType: { type: String, required: true, enum: ['Patient', 'PatientObservation', 'PatientResearchAssessment', 'ICUBed', 'ICUQueueEntry'], maxlength: 40 },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  referenceCode: { type: String, trim: true, maxlength: 40, default: '' },
  fieldNames: { type: [String], default: [] }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

auditEventSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 }, { name: 'tenant_entity_audit_time' });

export default mongoose.model('AuditEvent', auditEventSchema);
