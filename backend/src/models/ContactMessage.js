import mongoose from 'mongoose';

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  organization: { type: String, trim: true, maxlength: 150, default: '' },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, minlength: 10, maxlength: 3000 },
  status: { type: String, enum: ['new', 'reviewed', 'closed'], default: 'new', index: true },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

contactMessageSchema.index({ createdAt: -1 });
export default mongoose.model('ContactMessage', contactMessageSchema);
