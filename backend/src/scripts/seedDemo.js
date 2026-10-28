// Creates a ready-to-demo hospital: 1 doctor, 4 occupied ICU beds, 3 waiting patients with vitals + labs.
//   node src/scripts/seedDemo.js            (create)
//   node src/scripts/seedDemo.js --reset    (delete the demo hospital and recreate it)
import '../config/env.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import PatientObservation from '../models/PatientObservation.js';
import PatientResearchAssessment from '../models/PatientResearchAssessment.js';
import ICUBed from '../models/ICUBed.js';
import ICUQueueEntry from '../models/ICUQueueEntry.js';
import PatientRiskScore from '../models/PatientRiskScore.js';
import ICUObservationReminder from '../models/ICUObservationReminder.js';
import AuditEvent from '../models/AuditEvent.js';

const SLUG = 'demo-hospital';
const EMAIL = 'doctor@demo.hospital';
const PASSWORD = process.env.DEMO_PASSWORD || 'DemoHospital#2026!';
const reset = process.argv.includes('--reset');
const yearsAgo = (y) => new Date(Date.now() - y * 365.25 * 864e5);
const minsAgo = (m) => new Date(Date.now() - m * 60000);

// Admitted patients occupy the 4 beds. Waiting patients are what the model ranks.
const ADMITTED = [
  { code: 'A-001', name: 'Ramesh Ghosh', age: 61, sex: 'male' },
  { code: 'A-002', name: 'Sunita Das', age: 54, sex: 'female' },
  { code: 'A-003', name: 'Abdul Karim', age: 70, sex: 'male' },
  { code: 'A-004', name: 'Meera Sen', age: 47, sex: 'female' },
];
const WAITING = [
  { code: 'W-001', name: 'Anil Mondal', age: 50, sex: 'male', reason: 'Stable on ward, routine ICU review requested',
    vitals: { heartRateBpm: 78, oxygenSaturationPercent: 98, temperatureC: 36.8, systolicBpMmhg: 122, diastolicBpMmhg: 72, respiratoryRateBpm: 16, gcsTotal: 15 },
    labs: { glucose: 100, lactate: 1.0, creatinine: 0.9, wbc: 8, platelets: 250 } },
  { code: 'W-002', name: 'Rina Paul', age: 65, sex: 'female', reason: 'Fever, rising heart rate, possible infection',
    vitals: { heartRateBpm: 102, oxygenSaturationPercent: 94, temperatureC: 38.2, systolicBpMmhg: 104, diastolicBpMmhg: 60, respiratoryRateBpm: 22, gcsTotal: 15 },
    labs: { glucose: 140, lactate: 2.2, creatinine: 1.3, wbc: 13, platelets: 170 } },
  { code: 'W-003', name: 'Subir Bose', age: 72, sex: 'male', reason: 'Low blood pressure and low oxygen, suspected sepsis',
    vitals: { heartRateBpm: 128, oxygenSaturationPercent: 89, temperatureC: 39.2, systolicBpMmhg: 88, diastolicBpMmhg: 50, respiratoryRateBpm: 28, gcsTotal: 14 },
    labs: { glucose: 180, lactate: 4.4, creatinine: 2.4, wbc: 19, platelets: 90 } },
];

async function wipe(tenantId) {
  const filter = { tenantId };
  await Promise.all([User, Patient, PatientObservation, PatientResearchAssessment, ICUBed, ICUQueueEntry, PatientRiskScore, ICUObservationReminder, AuditEvent]
    .map((M) => M.deleteMany(filter)));
  await Tenant.deleteOne({ _id: tenantId });
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const existing = await Tenant.findOne({ slug: SLUG });
  if (existing && !reset) throw new Error(`Demo hospital already exists (tenantId ${existing._id}). Run with --reset to recreate it.`);
  if (existing) await wipe(existing._id);

  const tenant = await Tenant.create({ name: 'Demo Hospital', slug: SLUG });
  const tenantId = tenant._id;
  const doctor = await User.create({ tenantId, name: 'Dr. Demo', email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 10), role: 'doctor' });
  const base = { tenantId, createdByUserId: doctor._id, updatedByUserId: doctor._id, wardName: 'General Ward' };

  // 4 occupied beds
  for (let i = 0; i < ADMITTED.length; i += 1) {
    const a = ADMITTED[i];
    const bed = await ICUBed.create({ tenantId, bedCode: `ICU-${i + 1}`, unitName: 'ICU', createdByUserId: doctor._id, updatedByUserId: doctor._id });
    const patient = await Patient.create({ ...base, patientCode: a.code, fullName: a.name, dateOfBirth: yearsAgo(a.age), sexAtBirth: a.sex, status: 'ward', admittedAt: minsAgo(3000) });
    const entry = await ICUQueueEntry.create({
      tenantId, patientId: patient._id, status: 'admitted', requestReason: 'Admitted to ICU (seed data)', enteredByUserId: doctor._id,
      enteredAt: minsAgo(2000), allocatedBedId: bed._id, confirmedByUserId: doctor._id, confirmedAt: minsAgo(1900),
      confirmationReason: 'Seed data', priorityReviewRequired: false, reviewPriority: 'routine_review',
    });
    const now = new Date();
    await ICUBed.updateOne({ _id: bed._id }, { $set: { status: 'occupied', assignedPatientId: patient._id, assignedQueueEntryId: entry._id, assignedAt: now, assignedByUserId: doctor._id } });
    await Patient.updateOne({ _id: patient._id }, { $set: { status: 'icu_admitted', activeICUBedId: bed._id, activeICUQueueEntryId: entry._id, icuAdmittedAt: now } });
  }

  // 3 waiting patients with vitals + labs
  for (let i = 0; i < WAITING.length; i += 1) {
    const w = WAITING[i];
    const patient = await Patient.create({ ...base, patientCode: w.code, fullName: w.name, dateOfBirth: yearsAgo(w.age), sexAtBirth: w.sex, status: 'icu_waiting', admittedAt: minsAgo(1500) });
    const enteredAt = minsAgo(60 - i * 15);
    await ICUQueueEntry.create({
      tenantId, patientId: patient._id, status: 'waiting', requestReason: w.reason, enteredByUserId: doctor._id, enteredAt,
      lastObservationAtForReminder: new Date(), priorityReviewRequired: true,
    });
    await PatientObservation.create({ ...w.vitals, tenantId, patientId: patient._id, recordedByUserId: doctor._id, entrySource: 'manual', observedAt: minsAgo(2) });
    await PatientResearchAssessment.create({ ...w.labs, tenantId, patientId: patient._id, recordedByUserId: doctor._id, assessedAt: minsAgo(30) });
  }

  console.log('\nDemo hospital created.\n');
  console.log(`tenantId : ${tenantId}`);
  console.log(`login    : POST /api/auth/login  { "email": "${EMAIL}", "password": "${PASSWORD}", "tenantSlug": "${SLUG}" }`);
  console.log('beds     : ICU-1..ICU-4 (all occupied by A-001..A-004)');
  console.log('waiting  : W-001 (stable), W-002 (borderline), W-003 (critical)');
  console.log(`\nSimulate the 8-minute monitor feed (10 s on stage):\n  npm run simulate:vitals -- --tenant ${tenantId} --patients W-001,W-002,W-003 --interval 10 --worsen W-001\n`);
}

main().catch((e) => { console.error(`Seed failed: ${e.message}`); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); });
