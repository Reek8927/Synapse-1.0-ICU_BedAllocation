import mongoose from 'mongoose';
import ICUBed from '../models/ICUBed.js';
import Patient from '../models/Patient.js';
import { tenantScopedFilter } from '../utils/tenantScope.js';
import { getLatestScore, rankWaitingQueue, scorePatient } from '../services/riskScoring.js';
import { confirmAllocation } from './icuController.js';
import { describeModelInputs } from '../utils/modelInputs.js';

const DISCLAIMER = 'Decision support only. A clinician must confirm every ICU admission and bed allocation.';

function serializeScore(score) {
  if (!score) return null;
  return {
    scoredAt: score.scoredAt, observationAt: score.observationAt, stale: score.stale,
    modelStatus: score.modelStatus, modelScore: score.modelScore, featuresSupplied: score.featuresSupplied,
    suppliedFeatures: score.suppliedFeatures || [],
    news2: score.news2, priorityScore: score.priorityScore, riskLevel: score.riskLevel,
    icuRecommendation: score.icuRecommendation, reasons: score.reasons,
  };
}

async function loadPatientOr404(req, res) {
  const id = req.params.patientId;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Patient identifier is invalid' }); return null; }
  const patient = await Patient.findOne(tenantScopedFilter(req, { _id: id })).select('_id').lean();
  if (!patient) { res.status(404).json({ error: 'Patient was not found in this hospital workspace' }); return null; }
  return patient;
}

export async function getPatientRisk(req, res, next) {
  try {
    const patient = await loadPatientOr404(req, res); if (!patient) return;
    const score = req.query.refresh === 'true'
      ? await scorePatient({ tenantId: req.tenantId, patientId: patient._id })
      : (await getLatestScore({ tenantId: req.tenantId, patientId: patient._id })) || await scorePatient({ tenantId: req.tenantId, patientId: patient._id });
    return res.json({ risk: serializeScore(score), disclaimer: DISCLAIMER });
  } catch (error) { return next(error); }
}

export async function scorePatientNow(req, res, next) {
  try {
    const patient = await loadPatientOr404(req, res); if (!patient) return;
    const score = await scorePatient({ tenantId: req.tenantId, patientId: patient._id });
    return res.json({ risk: serializeScore(score), disclaimer: DISCLAIMER });
  } catch (error) { return next(error); }
}

export async function getRankedQueue(req, res, next) {
  try {
    const queue = await rankWaitingQueue({ tenantId: req.tenantId, rescore: req.query.rescore === 'true' });
    const readyBeds = await ICUBed.countDocuments(tenantScopedFilter(req, { status: 'ready', assignedPatientId: null }));
    return res.json({
      queue, count: queue.length, readyBeds,
      nextForBed: readyBeds > 0 && queue.length ? queue[0] : null,
      ordering: 'highest_priority_score_first_then_longest_waiting',
      disclaimer: DISCLAIMER,
    });
  } catch (error) { return next(error); }
}

export async function rescoreQueue(req, res, next) {
  try {
    const queue = await rankWaitingQueue({ tenantId: req.tenantId, rescore: true });
    return res.json({ queue, count: queue.length, rescoredAt: new Date(), disclaimer: DISCLAIMER });
  } catch (error) { return next(error); }
}

// One-click "bed is free -> highest-risk waiting patient gets it". Still a staff action
// (doctor/admin) that reuses the existing transactional confirmAllocation logic and audit trail.
export async function allocateNext(req, res, next) {
  try {
    const queue = await rankWaitingQueue({ tenantId: req.tenantId, rescore: true });
    if (!queue.length) return res.status(409).json({ error: 'No patients are waiting for an ICU bed' });
    let bedId = req.body?.bedId;
    if (!bedId) {
      const bed = await ICUBed.findOne(tenantScopedFilter(req, { status: 'ready', assignedPatientId: null })).sort({ bedCode: 1 }).lean();
      if (!bed) return res.status(409).json({ error: 'No ready ICU bed is available' });
      bedId = bed._id.toString();
    }
    const top = queue[0];
    req.params = { ...req.params, queueEntryId: top.queueEntryId };
    req.body = {
      bedId,
      confirmationReason: String(req.body?.confirmationReason || `Highest ranked risk in queue (priority ${top.priorityScore}); confirmed by clinician`).slice(0, 500),
    };
    req.mlRanked = true;
    return confirmAllocation(req, res, next);
  } catch (error) { return next(error); }
}

export function getModelInputs(req, res) {
  res.set('Cache-Control', 'no-store');
  return res.json({ inputs: describeModelInputs(), total: 40 });
}
