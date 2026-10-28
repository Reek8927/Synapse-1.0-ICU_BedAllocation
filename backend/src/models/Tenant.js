import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
  slug: { type: String, required: true, trim: true, lowercase: true, minlength: 3, maxlength: 60, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
  timezone: { type: String, default: 'Asia/Kolkata', maxlength: 80 }
}, { timestamps: true, versionKey: false });

tenantSchema.index({ slug: 1 }, { unique: true });
export default mongoose.model('Tenant', tenantSchema);
