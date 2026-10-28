import crypto from 'node:crypto';
import Patient from '../models/Patient.js';
import PatientObservation from '../models/PatientObservation.js';
import ICUQueueEntry from '../models/ICUQueueEntry.js';
import { scorePatient } from '../services/riskScoring.js';

const FIELDS = {
  temperatureC: [0, 60], heartRateBpm: [0, 400], systolicBpMmhg: [0, 400], diastolicBpMmhg: [0, 300],
  respiratoryRateBpm: [0, 200], oxygenSaturationPercent: [0, 100], gcsTotal: [3, 15],
};

export function requireMonitorKey(req, res, next) {
  const expected = String(process.env.MONITOR_API_KEY || '');
  const supplied = String(req.get('X-Monitor-Key') || '');
  if (expected.length < 32) return res.status(503).json({ error: 'Monitoring ingest is not configured' });
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Invalid monitor key' });
  return next();
}

// Body: { tenantId, patientCode, observedAt?, heartRateBpm, systolicBpMmhg, ... }  (push from the bedside monitor feed, ~every 8 min)
export async function ingestVitals(req, res, next) {
  try {
    const { tenantId, patientCode, observedAt } = req.body || {};
    if (!tenantId || !patientCode) return res.status(400).json({ error: 'tenantId and patientCode are required' });
    const values = {};
    for (const [field, [min, max]] of Object.entries(FIELDS)) {
      if (req.body[field] === undefined || req.body[field] === null) continue;
      const v = req.body[field];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return res.status(422).json({ error: `${field} must be a number between ${min} and ${max}` });
      values[field] = v;
    }
    if (!Object.keys(values).length) return res.status(422).json({ error: 'At least one vital sign is required' });
    const when = observedAt ? new Date(observedAt) : new Date();
    if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 5 * 60 * 1000) return res.status(422).json({ error: 'observedAt is invalid or in the future' });

    const patient = await Patient.findOne({ tenantId, patientCode: String(patientCode).trim() }).lean();
    if (!patient) return res.status(404).json({ error: 'Patient was not found' });
    if (!['ward', 'icu_waiting', 'icu_admitted'].includes(patient.status)) return res.status(409).json({ error: 'Patient is not currently monitored' });

    const observation = await PatientObservation.create({
      ...values, tenantId, patientId: patient._id, observedAt: when, entrySource: 'monitor', recordedByUserId: null,
    });
    if (patient.status === 'icu_waiting') {
      // Fresh monitor data satisfies the 8-minute observation reminder cycle.
      await ICUQueueEntry.updateOne({ tenantId, patientId: patient._id, status: 'waiting', $or: [{ lastObservationAtForReminder: null }, { lastObservationAtForReminder: { $lt: when } }] },
        { $set: { lastObservationAtForReminder: when } });
    }
    const risk = patient.status === 'icu_admitted' ? null : await scorePatient({ tenantId: patient.tenantId, patientId: patient._id });
    return res.status(201).json({
      observationId: observation._id.toString(),
      risk: risk && { modelScore: risk.modelScore, news2: risk.news2, priorityScore: risk.priorityScore, riskLevel: risk.riskLevel, icuRecommendation: risk.icuRecommendation },
    });
  } catch (error) { return next(error); }
}
