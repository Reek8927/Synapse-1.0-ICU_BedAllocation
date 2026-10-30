import Patient from '../models/Patient.js';
import PatientObservation from '../models/PatientObservation.js';
import PatientResearchAssessment from '../models/PatientResearchAssessment.js';
import PatientRiskScore from '../models/PatientRiskScore.js';
import ICUQueueEntry from '../models/ICUQueueEntry.js';
import { getResearchModelServiceConfig } from './researchModelStatus.js';
import { CORE_LAB_INPUTS, EXTRA_LAB_INPUTS } from '../utils/modelInputs.js';

const MODEL_TIMEOUT_MS = 5000;
const RECENT_ASSESSMENTS = 10; // lab results are sporadic, so the latest value of each lab is used

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* ---------- Early-warning score (NEWS2-style, scale 1) ---------- */
function band(value, rules) {
  for (const [test, points] of rules) if (test(value)) return points;
  return 0;
}

export function computeNews2(obs = {}) {
  const parts = {};
  const rr = num(obs.respiratoryRateBpm);
  const spo2 = num(obs.oxygenSaturationPercent);
  const sbp = num(obs.systolicBpMmhg);
  const hr = num(obs.heartRateBpm);
  const temp = num(obs.temperatureC);
  const gcs = num(obs.gcsTotal);
  if (rr !== null) parts.respiratoryRate = band(rr, [[(v) => v <= 8, 3], [(v) => v <= 11, 1], [(v) => v <= 20, 0], [(v) => v <= 24, 2], [() => true, 3]]);
  if (spo2 !== null) parts.oxygenSaturation = band(spo2, [[(v) => v <= 91, 3], [(v) => v <= 93, 2], [(v) => v <= 95, 1], [() => true, 0]]);
  if (sbp !== null) parts.systolicBp = band(sbp, [[(v) => v <= 90, 3], [(v) => v <= 100, 2], [(v) => v <= 110, 1], [(v) => v <= 219, 0], [() => true, 3]]);
  if (hr !== null) parts.heartRate = band(hr, [[(v) => v <= 40, 3], [(v) => v <= 50, 1], [(v) => v <= 90, 0], [(v) => v <= 110, 1], [(v) => v <= 130, 2], [() => true, 3]]);
  if (temp !== null) parts.temperature = band(temp, [[(v) => v <= 35.0, 3], [(v) => v <= 36.0, 1], [(v) => v <= 38.0, 0], [(v) => v <= 39.0, 1], [() => true, 2]]);
  if (gcs !== null) parts.consciousness = gcs < 15 ? 3 : 0;
  const used = Object.keys(parts).length;
  return { score: used ? Object.values(parts).reduce((a, b) => a + b, 0) : null, parametersUsed: used, parts };
}

/* ---------- Model feature vector (PhysioNet names/units, checked against the trained model) ---------- */
export function buildModelFeatures({ patient, observation, assessment, assessments, now = new Date() }) {
  const f = {};
  const put = (k, v) => { const n = num(v); if (n !== null) f[k] = n; };
  if (observation) {
    put('HR', observation.heartRateBpm);
    put('O2Sat', observation.oxygenSaturationPercent);
    put('Temp', observation.temperatureC);
    put('SBP', observation.systolicBpMmhg);
    put('DBP', observation.diastolicBpMmhg);
    put('Resp', observation.respiratoryRateBpm);
    if (num(observation.systolicBpMmhg) !== null && num(observation.diastolicBpMmhg) !== null) {
      f.MAP = Math.round(((observation.systolicBpMmhg + 2 * observation.diastolicBpMmhg) / 3) * 10) / 10;
    }
  }
  // Newest first. Each lab takes its most recent recorded value.
  const labSources = (assessments && assessments.length ? assessments : assessment ? [assessment] : []);
  for (const item of [...CORE_LAB_INPUTS, ...EXTRA_LAB_INPUTS]) {
    for (const source of labSources) {
      if (num(source[item.field]) !== null) { f[item.key] = source[item.field]; break; }
    }
  }
  const unit = labSources.map((source) => source.icuUnitType).find(Boolean);
  if (unit === 'medical') { f.Unit1 = 1; f.Unit2 = 0; }
  if (unit === 'surgical') { f.Unit1 = 0; f.Unit2 = 1; }

  if (patient?.dateOfBirth) {
    const dob = new Date(patient.dateOfBirth);
    let years = now.getUTCFullYear() - dob.getUTCFullYear();
    const hadBirthday = now.getUTCMonth() > dob.getUTCMonth()
      || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
    if (!hadBirthday) years -= 1;
    if (years >= 0 && years < 130) f.Age = years;
  }
  if (patient?.sexAtBirth === 'male') f.Gender = 1;
  else if (patient?.sexAtBirth === 'female') f.Gender = 0;
  // The model's HospAdmTime is hours from hospital admission to ICU admission (negative). While waiting, "now" stands in for ICU admission.
  if (patient?.admittedAt && patient.status !== 'icu_admitted') {
    const hours = (now.getTime() - new Date(patient.admittedAt).getTime()) / 3600000;
    if (hours >= 0) f.HospAdmTime = -Math.round(hours * 10) / 10;
  }
  return f;
}

/* ---------- Decision support rules ---------- */
export function getRiskConfig(env = process.env) {
  const n = (k, d) => { const v = Number(env[k]); return Number.isFinite(v) ? v : d; };
  return {
    modelHigh: n('RISK_MODEL_HIGH', 0.8),
    modelMedium: n('RISK_MODEL_MEDIUM', 0.5),
    weightModel: n('RISK_WEIGHT_MODEL', 0.5),
    weightNews2: n('RISK_WEIGHT_NEWS2', 0.5),
    agingPerHour: n('RISK_AGING_PER_HOUR', 0.005),
    agingCap: n('RISK_AGING_CAP', 0.05),
    staleMinutes: n('RISK_STALE_MINUTES', 16),
  };
}

export function classifyRisk({ modelScore, news2 }, cfg = getRiskConfig()) {
  const m = num(modelScore);
  const e = num(news2);
  const reasons = [];
  let rec = 'icu_not_indicated';
  if ((e !== null && e >= 7) || (m !== null && m >= cfg.modelHigh) || (m !== null && m >= cfg.modelMedium && e !== null && e >= 5)) {
    rec = 'icu_recommended';
  } else if ((e !== null && e >= 5) || (m !== null && m >= cfg.modelMedium)) {
    rec = 'icu_review';
  }
  if (e !== null && e >= 7) reasons.push(`Early-warning score ${e} (emergency range, 7+)`);
  else if (e !== null && e >= 5) reasons.push(`Early-warning score ${e} (urgent range, 5-6)`);
  if (m !== null && m >= cfg.modelHigh) reasons.push(`ML deterioration score ${m.toFixed(2)} is high`);
  else if (m !== null && m >= cfg.modelMedium) reasons.push(`ML deterioration score ${m.toFixed(2)} is elevated`);
  if (!reasons.length) reasons.push('Vitals and ML score are within the lower-risk range');
  const riskLevel = rec === 'icu_recommended' ? 'high' : rec === 'icu_review' ? 'medium' : 'low';
  return { icuRecommendation: rec, riskLevel, reasons };
}

export function computePriorityScore({ modelScore, news2, waitedMinutes = 0 }, cfg = getRiskConfig()) {
  const m = num(modelScore);
  const e = num(news2);
  const eNorm = e === null ? null : Math.min(e / 10, 1);
  let base;
  if (m !== null && eNorm !== null) base = (cfg.weightModel * m + cfg.weightNews2 * eNorm) / (cfg.weightModel + cfg.weightNews2);
  else base = m ?? eNorm ?? 0;
  // Small waiting-time bonus so a moderate-risk patient is not starved forever.
  const aging = Math.min((Math.max(waitedMinutes, 0) / 60) * cfg.agingPerHour, cfg.agingCap);
  return Math.round((base + aging) * 10000) / 10000;
}

export function rankByPriority(items) {
  return [...items].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    const at = new Date(a.enteredAt || 0).getTime();
    const bt = new Date(b.enteredAt || 0).getTime();
    if (at !== bt) return at - bt; // longer wait first on ties
    return String(a.patientId).localeCompare(String(b.patientId));
  });
}

/* ---------- ML service call ---------- */
export async function callModel(features, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = getResearchModelServiceConfig(env);
  const response = await fetchImpl(`${config.baseUrl}/v1/predict`, {
    method: 'POST',
    headers: { 'X-API-Key': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ features }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ml_http_${response.status}`);
  const payload = await response.json();
  return {
    status: payload.score_status === 'available' ? 'available' : 'withheld',
    score: typeof payload.score === 'number' ? payload.score : null,
    modelKey: String(payload.model_key || ''),
    featuresSupplied: Number(payload.supplied_non_missing_feature_count) || 0,
  };
}

/* ---------- Scoring a real patient ---------- */
export async function scorePatient({ tenantId, patientId, now = new Date(), env = process.env, fetchImpl, enteredAt = null }) {
  const patient = await Patient.findOne({ _id: patientId, tenantId }).lean();
  if (!patient) return null;
  const [observation, assessments] = await Promise.all([
    PatientObservation.findOne({ tenantId, patientId }).sort({ observedAt: -1 }).lean(),
    PatientResearchAssessment.find({ tenantId, patientId }).sort({ assessedAt: -1 }).limit(RECENT_ASSESSMENTS).lean(),
  ]);
  const cfg = getRiskConfig(env);
  const features = buildModelFeatures({ patient, observation, assessments, now });
  const news2 = computeNews2(observation || {});

  let model = { status: 'unavailable', score: null, modelKey: '', featuresSupplied: Object.keys(features).length };
  if (Object.keys(features).length) {
    try { model = await callModel(features, { env, fetchImpl }); } catch { /* fall back to early-warning score only */ }
  }

  const entry = enteredAt ? { enteredAt } : await ICUQueueEntry.findOne({ tenantId, patientId, status: 'waiting' }).select('enteredAt').lean();
  const waitedMinutes = entry?.enteredAt ? (now.getTime() - new Date(entry.enteredAt).getTime()) / 60000 : 0;
  const { icuRecommendation, riskLevel, reasons } = classifyRisk({ modelScore: model.score, news2: news2.score }, cfg);
  const stale = !observation || (now.getTime() - new Date(observation.observedAt).getTime()) / 60000 > cfg.staleMinutes;
  if (stale) reasons.push('Latest vitals are older than the expected 8-minute monitoring cycle');
  if (model.status !== 'available') reasons.push('ML score unavailable; ranked using the early-warning score only');

  const saved = await PatientRiskScore.create({
    tenantId, patientId, scoredAt: now,
    observationId: observation?._id ?? null, observationAt: observation?.observedAt ?? null, stale,
    modelStatus: model.status, modelKey: model.modelKey, modelScore: model.score, featuresSupplied: model.featuresSupplied,
    suppliedFeatures: Object.keys(features),
    news2: news2.score, news2ParametersUsed: news2.parametersUsed,
    priorityScore: computePriorityScore({ modelScore: model.score, news2: news2.score, waitedMinutes }, cfg),
    riskLevel, icuRecommendation, reasons,
  });
  return saved.toObject();
}

// Used after manual entries: never lets a scoring problem break the clinical record write.
export async function scorePatientSafe({ tenantId, patientId }) {
  try {
    const s = await scorePatient({ tenantId, patientId });
    if (!s) return null;
    return {
      riskLevel: s.riskLevel, icuRecommendation: s.icuRecommendation, priorityScore: s.priorityScore,
      modelScore: s.modelScore, modelStatus: s.modelStatus, news2: s.news2, reasons: s.reasons, scoredAt: s.scoredAt,
      suppliedFeatures: s.suppliedFeatures || [],
    };
  } catch { return null; }
}

export async function getLatestScore({ tenantId, patientId }) {
  return PatientRiskScore.findOne({ tenantId, patientId }).sort({ scoredAt: -1 }).lean();
}

/* ---------- ML-ranked waiting queue ---------- */
export async function rankWaitingQueue({ tenantId, rescore = false, now = new Date(), env = process.env, fetchImpl }) {
  const entries = await ICUQueueEntry.find({ tenantId, status: 'waiting' }).lean();
  const patients = await Patient.find({ tenantId, _id: { $in: entries.map((e) => e.patientId) }, status: 'icu_waiting' })
    .select('fullName patientCode wardName status').lean();
  const patientMap = new Map(patients.map((p) => [p._id.toString(), p]));
  const rows = [];
  for (const entry of entries) {
    const patient = patientMap.get(entry.patientId.toString());
    if (!patient) continue;
    let score = rescore ? null : await getLatestScore({ tenantId, patientId: entry.patientId });
    if (!score) score = await scorePatient({ tenantId, patientId: entry.patientId, now, env, fetchImpl, enteredAt: entry.enteredAt });
    const intervalMin = Number(env.ICU_REMINDER_INTERVAL_MINUTES) || 8;
    const minutesSinceObservation = score.observationAt ? Math.floor((now.getTime() - new Date(score.observationAt).getTime()) / 60000) : null;
    rows.push({
      observationDue: minutesSinceObservation === null || minutesSinceObservation >= intervalMin,
      minutesSinceObservation,
      queueEntryId: entry._id.toString(), patientId: entry.patientId.toString(), enteredAt: entry.enteredAt,
      patient: { id: patient._id.toString(), fullName: patient.fullName, patientCode: patient.patientCode, wardName: patient.wardName },
      priorityScore: score.priorityScore, riskLevel: score.riskLevel, icuRecommendation: score.icuRecommendation,
      modelScore: score.modelScore, modelStatus: score.modelStatus, news2: score.news2,
      stale: score.stale, reasons: score.reasons, scoredAt: score.scoredAt, observationAt: score.observationAt,
    });
  }
  return rankByPriority(rows).map((row, index) => ({ ...row, position: index + 1 }));
}
