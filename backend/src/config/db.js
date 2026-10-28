import mongoose from 'mongoose';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import ContactMessage from '../models/ContactMessage.js';
import Patient from '../models/Patient.js';
import PatientObservation from '../models/PatientObservation.js';
import AuditEvent from '../models/AuditEvent.js';
import ICUBed from '../models/ICUBed.js';
import ICUQueueEntry from '../models/ICUQueueEntry.js';
import ICUObservationReminder from '../models/ICUObservationReminder.js';
import PatientResearchAssessment from '../models/PatientResearchAssessment.js';
import PatientRiskScore from '../models/PatientRiskScore.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000
  });
  // Make sure unique and tenant-related indexes are in place before accepting requests.
  await Promise.all([
  User.init(),
  Tenant.init(),
  ContactMessage.init(),
  Patient.init(),
  PatientObservation.init(),
  PatientResearchAssessment.init(),
  AuditEvent.init(),
  ICUBed.init(),
  ICUQueueEntry.init(),
  ICUObservationReminder.init(),
  PatientRiskScore.init()
]);
  console.log('MongoDB connected and application indexes initialized');
}

export function getDatabaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] ?? 'unknown';
}
