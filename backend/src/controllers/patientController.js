import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Patient from '../models/Patient.js';
import { PATIENT_STATUSES } from '../utils/patientConstants.js';
import PatientObservation from '../models/PatientObservation.js';
import AuditEvent from '../models/AuditEvent.js';
import PatientResearchAssessment from '../models/PatientResearchAssessment.js';
import ICUQueueEntry from '../models/ICUQueueEntry.js';
import ICUObservationReminder from '../models/ICUObservationReminder.js';
import { supersedePendingPatientReminders } from '../services/icuReminderLifecycle.js';
import { normalizeReminderIntervalMinutes } from '../utils/reminderTiming.js';
import { isObservationFreshForReminder } from '../utils/observationFreshness.js';
import { tenantScopedFilter } from '../utils/tenantScope.js';
import { scorePatientSafe } from '../services/riskScoring.js';
import { EXTRA_LAB_INPUTS } from '../utils/modelInputs.js';
import { normalizeObservationInput, normalizePatientInput, normalizeResearchAssessmentInput, validationError } from '../utils/patientValidation.js';

function serializePatient(patient) {
  return {
    id: patient._id.toString(),
    patientCode: patient.patientCode,
    hospitalRecordNumber: patient.hospitalRecordNumber || '',
    fullName: patient.fullName,
    dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : null,
    sexAtBirth: patient.sexAtBirth,
    wardName: patient.wardName,
    bedLabel: patient.bedLabel || '',
    admittedAt: patient.admittedAt,
    status: patient.status,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt
  };
}

function serializeObservation(observation) {
  return {
    id: observation._id.toString(),
    patientId: observation.patientId.toString(),
    entrySource: observation.entrySource,
    observedAt: observation.observedAt,
    recordedByUserId: observation.recordedByUserId?._id ? observation.recordedByUserId._id.toString() : observation.recordedByUserId.toString(),
    recordedByName: observation.recordedByUserId?.name || null,
    temperatureC: observation.temperatureC,
    heartRateBpm: observation.heartRateBpm,
    systolicBpMmhg: observation.systolicBpMmhg,
    diastolicBpMmhg: observation.diastolicBpMmhg,
    respiratoryRateBpm: observation.respiratoryRateBpm,
    oxygenSaturationPercent: observation.oxygenSaturationPercent,
    gcsTotal: observation.gcsTotal,
    notes: observation.notes || '',
    createdAt: observation.createdAt
  };
}


function serializeResearchAssessment(assessment) {
  return {
    id: assessment._id.toString(),
    patientId: assessment.patientId.toString(),
    assessmentType: assessment.assessmentType,
    assessedAt: assessment.assessedAt,
    recordedByUserId: assessment.recordedByUserId?._id
      ? assessment.recordedByUserId._id.toString()
      : String(assessment.recordedByUserId),
    recordedByName: assessment.recordedByUserId?.name || 'Account',
    recordedByRole: assessment.recordedByUserId?.role || null,
    glucose: assessment.glucose,
    glucoseUnit: assessment.glucoseUnit,
    lactate: assessment.lactate,
    lactateUnit: assessment.lactateUnit,
    creatinine: assessment.creatinine,
    creatinineUnit: assessment.creatinineUnit,
    wbc: assessment.wbc,
    wbcUnit: assessment.wbcUnit,
    platelets: assessment.platelets,
    plateletsUnit: assessment.plateletsUnit,
    ...Object.fromEntries(
      EXTRA_LAB_INPUTS.filter((item) => assessment[item.field] !== undefined && assessment[item.field] !== null)
        .map((item) => [item.field, assessment[item.field]])
    ),
    icuUnitType: assessment.icuUnitType || null,
    notes: assessment.notes || '',
    createdAt: assessment.createdAt
  };
}


function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patientIdOrBadRequest(value) {
  if (typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value)) {
    throw validationError('Patient identifier is invalid');
  }
  return value;
}

async function recordAudit({ session, tenantId, actorUserId, eventType, entityType, entityId, referenceCode, fieldNames = [] }) {
  await AuditEvent.create([{
    tenantId,
    actorUserId,
    eventType,
    entityType,
    entityId,
    referenceCode,
    fieldNames
  }], { session });
}

export async function listPatients(req, res, next) {
  try {
    // Patient names / hospital record numbers should not be sent in URLs, browser history or proxy access logs.
    if (req.method !== 'POST' && req.query.search !== undefined) {
      throw validationError('Use POST /api/patients/search to search patient records without putting search terms in the URL');
    }
    const search = String(req.method === 'POST' ? (req.body?.search ?? '') : '').trim();
    if (search.length > 100) throw validationError('Search must be 100 characters or fewer');
    const rawStatus = req.method === 'POST' ? req.body?.status : req.query.status;
    const status = rawStatus ? String(rawStatus) : '';
    if (status && !PATIENT_STATUSES.includes(status)) throw validationError('Patient status filter is invalid');
    const rawPage = req.method === 'POST' ? req.body?.page : req.query.page;
    const rawLimit = req.method === 'POST' ? req.body?.limit : req.query.limit;
    const page = Math.max(1, Math.min(100000, Number.parseInt(String(rawPage || '1'), 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(rawLimit || '25'), 10) || 25));
    const additional = {};
    if (status) additional.status = status;
    if (search) {
      const escaped = escapeRegex(search);
      additional.$or = [
        { fullName: { $regex: escaped, $options: 'i' } },
        { patientCode: { $regex: escaped, $options: 'i' } },
        { hospitalRecordNumber: { $regex: escaped, $options: 'i' } }
      ];
    }
    const filter = tenantScopedFilter(req, additional);
    const [patients, total] = await Promise.all([
      Patient.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Patient.countDocuments(filter)
    ]);
    res.set('Cache-Control', 'no-store');
    return res.json({
      patients: patients.map((patient) => serializePatient(patient)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) { return next(error); }
}

export async function createPatient(req, res, next) {
  let session;
  try {
    const input = normalizePatientInput(req.body);
    session = await mongoose.startSession();
    let created;
    await session.withTransaction(async () => {
      const patientCode = `BA-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const [patient] = await Patient.create([{
        ...input,
        tenantId: req.tenantId,
        patientCode,
        status: 'ward',
        admittedAt: new Date(),
        createdByUserId: req.user._id,
        updatedByUserId: req.user._id
      }], { session });
      await recordAudit({
        session,
        tenantId: req.tenantId,
        actorUserId: req.user._id,
        eventType: 'patient.registered',
        entityType: 'Patient',
        entityId: patient._id,
        referenceCode: patient.patientCode,
        fieldNames: Object.keys(input)
      });
      created = patient;
    });
    return res.status(201).json({ patient: serializePatient(created) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'Could not assign a unique patient code. Please retry.' });
    return next(error);
  } finally { await session?.endSession(); }
}

export async function getPatient(req, res, next) {
  try {
    const patientId = patientIdOrBadRequest(req.params.patientId);
    const filter = tenantScopedFilter(req, { _id: patientId });
    const patient = await Patient.findOne(filter).lean();
    if (!patient) return res.status(404).json({ error: 'Patient was not found in this hospital workspace' });

    const scoped = tenantScopedFilter(req, { patientId: patient._id });
    const auditFilter = tenantScopedFilter(req, { referenceCode: patient.patientCode });
    
const [observations, researchAssessments, auditEvents] = await Promise.all([
  PatientObservation.find(scoped)
    .populate('recordedByUserId', 'name role')
    .sort({ observedAt: -1, _id: -1 })
    .limit(30)
    .lean(),
  PatientResearchAssessment.find(scoped)
    .populate('recordedByUserId', 'name role')
    .sort({ assessedAt: -1, _id: -1 })
    .limit(30)
    .lean(),
  AuditEvent.find(auditFilter)
    .populate('actorUserId', 'name role')
    .sort({ createdAt: -1 })
    .limit(30)
    .lean()
]);

    res.set('Cache-Control', 'no-store');
    return res.json({
      patient: serializePatient(patient),
      observations: observations.map(serializeObservation),
      researchAssessments: researchAssessments.map(serializeResearchAssessment),
      auditEvents: auditEvents.map((event) => ({
        id: event._id.toString(), eventType: event.eventType, entityType: event.entityType,
        actorUserId: event.actorUserId?._id ? event.actorUserId._id.toString() : String(event.actorUserId),
        actorName: event.actorUserId?.name || 'Account', actorRole: event.actorUserId?.role || null,
        referenceCode: event.referenceCode, fieldNames: event.fieldNames, createdAt: event.createdAt
      }))
    });
  } catch (error) { return next(error); }
}

export async function updatePatient(req, res, next) {
  let session;
  try {
    const patientId = patientIdOrBadRequest(req.params.patientId);
    const input = normalizePatientInput(req.body, { partial: true });
    session = await mongoose.startSession();
    let updated = null;
    await session.withTransaction(async () => {
      const patient = await Patient.findOne(tenantScopedFilter(req, { _id: patientId })).session(session);
      if (!patient) {
        const notFound = new Error('Patient was not found in this hospital workspace');
        notFound.statusCode = 404;
        throw notFound;
      }
      for (const [key, value] of Object.entries(input)) patient[key] = value;
      patient.updatedByUserId = req.user._id;
      await patient.save({ session });
      await recordAudit({
        session, tenantId: req.tenantId, actorUserId: req.user._id,
        eventType: 'patient.updated', entityType: 'Patient', entityId: patient._id,
        referenceCode: patient.patientCode, fieldNames: Object.keys(input)
      });
      updated = patient;
    });
    return res.json({ patient: serializePatient(updated) });
  } catch (error) { return next(error); }
  finally { await session?.endSession(); }
}

export async function createObservation(req, res, next) {
  let session;
  try {
    const patientId = patientIdOrBadRequest(req.params.patientId);
    const patient = await Patient.findOne(tenantScopedFilter(req, { _id: patientId })).lean();
    if (!patient) return res.status(404).json({ error: 'Patient was not found in this hospital workspace' });
    if (!['ward', 'icu_waiting'].includes(patient.status)) return res.status(409).json({ error: 'Manual observations can only be added while the patient is in ward or ICU waiting status' });
    const input = normalizeObservationInput(req.body, patient.admittedAt);
    const { fieldNames, ...observationInput } = input;

    session = await mongoose.startSession();
    let created;
    await session.withTransaction(async () => {
      // Re-check the patient within the write transaction so status/tenant changes cannot race this write.
      const currentPatient = await Patient.findOne(tenantScopedFilter(req, { _id: patientId, status: { $in: ['ward', 'icu_waiting'] } })).session(session);
      if (!currentPatient) {
        const conflict = new Error('Patient is no longer available for ward observations');
        conflict.statusCode = 409;
        throw conflict;
      }
      const enteredAt = new Date();
      const [observation] = await PatientObservation.create([{
        ...observationInput,
        tenantId: req.tenantId,
        patientId: currentPatient._id,
        recordedByUserId: req.user._id,
        entrySource: 'manual',
        createdAt: enteredAt,
        updatedAt: enteredAt
      }], { session });
      if (currentPatient.status === 'icu_waiting') {
        const waitingQueueEntry = await ICUQueueEntry.findOne(
          tenantScopedFilter(req, { patientId: currentPatient._id, status: 'waiting' })
        ).session(session);
        if (waitingQueueEntry) {
          const previousObservationAt = waitingQueueEntry.lastObservationAtForReminder
            ? new Date(waitingQueueEntry.lastObservationAtForReminder).getTime() : 0;
          const enteredObservationAt = new Date(observation.observedAt).getTime();
          if (!previousObservationAt || enteredObservationAt > previousObservationAt) {
            waitingQueueEntry.lastObservationAtForReminder = observation.observedAt;
          }
          // A new entry must trigger an authorized human reassessment. This is
          // an operational flag, not an automatic clinical risk calculation.
          waitingQueueEntry.priorityReviewRequired = true;
          waitingQueueEntry.priorityReviewRequestedAt = enteredAt;
          await waitingQueueEntry.save({ session });
          await recordAudit({
            session, tenantId: req.tenantId, actorUserId: req.user._id,
            eventType: 'icu_queue.priority_review_required_after_observation',
            entityType: 'ICUQueueEntry', entityId: waitingQueueEntry._id,
            referenceCode: currentPatient.patientCode,
            fieldNames: ['priorityReviewRequired', 'priorityReviewRequestedAt']
          });
        }
        // A backdated/old measurement must not clear a reminder that is asking
        // staff to obtain fresh observations. Only a recently observed reading
        // resolves the active in-app reminder.
        const freshnessWindowMs = normalizeReminderIntervalMinutes(process.env.ICU_REMINDER_INTERVAL_MINUTES, 8) * 60 * 1000;
        if (isObservationFreshForReminder(observation.observedAt, enteredAt, freshnessWindowMs)) {
          await supersedePendingPatientReminders({
            session, tenantId: req.tenantId, patientId: currentPatient._id,
            reason: 'observation_recorded', at: enteredAt
          });
        } else {
          // Keep the pending reminder active for stale/backdated data, but make
          // its timestamp reflect the most recently entered measurement.
          await ICUObservationReminder.updateMany(
            { tenantId: req.tenantId, patientId: currentPatient._id, status: 'pending' },
            { $set: { latestObservationAt: observation.observedAt, reason: 'observation_update_due' } },
            { session }
          );
        }
      }
      await recordAudit({
        session, tenantId: req.tenantId, actorUserId: req.user._id,
        eventType: currentPatient.status === 'icu_waiting' ? 'observation.manual_recorded_icu_waiting' : 'observation.manual_recorded', entityType: 'PatientObservation',
        entityId: observation._id, referenceCode: currentPatient.patientCode, fieldNames
      });
      created = observation;
    });
    // Fresh manual vitals -> re-score immediately so the ICU queue ranking updates.
    const risk = await scorePatientSafe({ tenantId: req.tenantId, patientId });
    return res.status(201).json({ observation: serializeObservation(created), risk });
  } catch (error) { return next(error); }
  finally { await session?.endSession(); }
}


export async function createResearchAssessment(req, res, next) {
  let session;

  try {
    const patientId = patientIdOrBadRequest(req.params.patientId);
    const initialFilter = tenantScopedFilter(req, { _id: patientId });
    const initialPatient = await Patient.findOne(initialFilter).lean();

    if (!initialPatient) {
      return res.status(404).json({
        error: 'Patient was not found in this hospital workspace'
      });
    }

    if (!['ward', 'icu_waiting'].includes(initialPatient.status)) {
      return res.status(409).json({
        error: 'Research assessments can only be recorded for ward or ICU-waiting patients'
      });
    }

    const normalized = normalizeResearchAssessmentInput(
      req.body,
      initialPatient.admittedAt
    );

    const { fieldNames, ...values } = normalized;

    session = await mongoose.startSession();
    let created;

    await session.withTransaction(async () => {
      const patient = await Patient.findOne(
        tenantScopedFilter(req, {
          _id: patientId,
          status: { $in: ['ward', 'icu_waiting'] }
        })
      ).session(session).lean();

      if (!patient) {
        const error = new Error(
          'Patient was not found or is no longer eligible for assessment'
        );
        error.statusCode = 409;
        throw error;
      }

      const [assessment] = await PatientResearchAssessment.create(
        [{
          tenantId: req.tenantId,
          patientId: patient._id,
          recordedByUserId: req.user._id,
          assessmentType: 'sepsis_research_data',
          ...values
        }],
        { session }
      );

      await recordAudit({
        session,
        tenantId: req.tenantId,
        actorUserId: req.user._id,
        eventType: 'research_assessment.completed',
        entityType: 'PatientResearchAssessment',
        entityId: assessment._id,
        referenceCode: patient.patientCode,
        fieldNames
      });

      created = assessment.toObject();
    });

    const risk = await scorePatientSafe({ tenantId: req.tenantId, patientId });
    return res.status(201).json({
      researchAssessment: serializeResearchAssessment(created),
      risk
    });
  } catch (error) {
    return next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

