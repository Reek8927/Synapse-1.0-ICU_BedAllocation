import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const USER_ROLES = ['platform_admin', 'hospital_admin', 'doctor', 'nurse', 'staff'];
export const HOSPITAL_ROLES = ['hospital_admin', 'doctor', 'nurse', 'staff'];

const userSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: USER_ROLES, required: true },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

// Hospital accounts may use the same email in separate hospital workspaces.
userSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { tenantId: { $type: 'objectId' } }, name: 'tenant_email_unique' }
);
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { role: 'platform_admin' }, name: 'platform_admin_email_unique' }
);
userSchema.pre('validate', function validateTenantScope(next) {
  if (this.role === 'platform_admin' && this.tenantId != null) {
    this.invalidate('tenantId', 'Platform administrators must not belong to a hospital tenant');
  }
  if (this.role !== 'platform_admin' && !this.tenantId) {
    this.invalidate('tenantId', 'Hospital users must belong to a tenant');
  }
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    tenantId: this.tenantId ? this.tenantId.toString() : null,
    name: this.name,
    email: this.email,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt
  };
};

export default mongoose.model('User', userSchema);
