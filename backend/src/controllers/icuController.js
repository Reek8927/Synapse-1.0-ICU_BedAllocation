import mongoose from 'mongoose';
import ICUBed from '../models/ICUBed.js';
import ICUQueueEntry from '../models/ICUQueueEntry.js';
import Patient from '../models/Patient.js';
import PatientObservation from '../models/PatientObservation.js';
import User from '../models/User.js';
import AuditEvent from '../models/AuditEvent.js';
import { supersedePendingQueueReminder } from '../services/icuReminderLifecycle.js';
import { tenantScopedFilter } from '../utils/tenantScope.js';
import { sortICUQueueEntries } from '../utils/icuQueuePriority.js';
import { icuValidationError, normalizeICUBedInput, normalizeQueueEntryInput, normalizeQueueReviewPriorityInput, normalizeWithdrawalReason, normalizeAllocationInput, normalizeDischargeInput } from '../utils/icuValidation.js';

function validObjectId(value, label) {
  if (typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value)) throw icuValidationError(`${label} is invalid`);
  return value;
}

function serializeBed(bed) {
  const assignedPatient = bed.assignedPatientId && typeof bed.assignedPatientId === 'object' && bed.assignedPatientId.fullName && bed.assignedPatientId._id
    ? { id: bed.assignedPatientId._id.toString(), fullName: bed.assignedPatientId.fullName, patientCode: bed.assignedPatientId.patientCode, status: bed.assignedPatientId.status }
    : null;
  return {
    id: bed._id.toString(), bedCode: bed.bedCode, unitName: bed.unitName,
    locationLabel: bed.locationLabel || '', status: bed.status, notes: bed.notes || '',
    assignedPatient, assignedPatientId: assignedPatient ? assignedPatient.id : (bed.assignedPatientId ? bed.assignedPatientId.toString() : null),
    assignedAt: bed.assignedAt || null, lastStatusChangedAt: bed.lastStatusChangedAt, updatedAt: bed.updatedAt
  };
}

async function audit({ session, req, eventType, entityType, entityId, referenceCode, fieldNames }) {
  await AuditEvent.create([{
    tenantId: req.tenantId, actorUserId: req.user._id, eventType, entityType,
    entityId, referenceCode: referenceCode || '', fieldNames: fieldNames || []
  }], { session });
}

export async function listBeds(req, res, next) {
  try {
    const beds = await ICUBed.find(tenantScopedFilter(req)).populate({ path: 'assignedPatientId', select: 'fullName patientCode status tenantId', match: { tenantId: req.tenantId } }).sort({ unitName: 1, bedCode: 1 }).lean();
    res.set('Cache-Control', 'no-store');
    const counts = { total: beds.length, ready: 0, occupied: 0, cleaning: 0, preparing: 0, reserved: 0, unavailable: 0 };
    for (const bed of beds) counts[bed.status] += 1;
    return res.json({ beds: beds.map(serializeBed), counts });
  } catch (error) { return next(error); }
}

export async function createBed(req, res, next) {
  let session;
  try {
    const input = normalizeICUBedInput(req.body);
    if (['occupied', 'reserved'].includes(input.status)) {
      const error = icuValidationError('A bed cannot be created as occupied or reserved. Use the staff-confirmed allocation workflow.');
      throw error;
    }
    session = await mongoose.startSession();
    let created;
    await session.withTransaction(async () => {
      const [bed] = await ICUBed.create([{
        ...input, tenantId: req.tenantId, createdByUserId: req.user._id,
        updatedByUserId: req.user._id, lastStatusChangedAt: new Date()
      }], { session });
      await audit({ session, req, eventType: 'icu_bed.created', entityType: 'ICUBed', entityId: bed._id, referenceCode: bed.bedCode, fieldNames: Object.keys(input) });
      created = bed;
    });
    return res.status(201).json({ bed: serializeBed(created) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'A bed with that code already exists in this hospital' });
    return next(error);
  } finally { await session?.endSession(); }
}

export async function updateBed(req, res, next) {
  let session;
  try {
    const bedId = validObjectId(req.params.bedId, 'Bed identifier');
    const input = normalizeICUBedInput(req.body, { partial: true });
    session = await mongoose.startSession();
    let updated = null;
    await session.withTransaction(async () => {
      const bed = await ICUBed.findOne(tenantScopedFilter(req, { _id: bedId })).session(session);
      if (!bed) {
        const error = new Error('Bed was not found in this hospital workspace'); error.statusCode = 404; throw error;
      }
      const statusChanged = input.status !== undefined && input.status !== bed.status;
      if (statusChanged && ['occupied', 'reserved'].includes(input.status)) {
        const conflict = new Error('Occupied status is controlled by staff-confirmed allocation. Reserved beds are not supported yet.');
        conflict.statusCode = 409;
        throw conflict;
      }
      if (statusChanged && bed.assignedPatientId) {
        const conflict = new Error('This bed has an active patient assignment. Discharge the admission before changing bed status.');
        conflict.statusCode = 409;
        throw conflict;
      }
      Object.assign(bed, input);
      bed.updatedByUserId = req.user._id;
      if (statusChanged) bed.lastStatusChangedAt = new Date();
      await bed.save({ session });
      await audit({ session, req, eventType: statusChanged ? 'icu_bed.status_changed' : 'icu_bed.updated', entityType: 'ICUBed', entityId: bed._id, referenceCode: bed.bedCode, fieldNames: Object.keys(input) });
      updated = bed;
    });
    return res.json({ bed: serializeBed(updated) });
  } catch (error) { return next(error); }
  finally { await session?.endSession(); }
}

export async function listQueue(req, res, next) {
  try {
    const entries = await ICUQueueEntry.find(tenantScopedFilter(req, { status: 'waiting' })).sort({ enteredAt: 1, _id: 1 }).lean();
    const patientIds = entries.map((entry) => entry.patientId);
    const patients = patientIds.length
      ? await Patient.find(tenantScopedFilter(req, { _id: { $in: patientIds } })).select('fullName patientCode wardName bedLabel status').lean()
      : [];
    const patientMap = new Map(patients.map((patient) => [patient._id.toString(), patient]));
    const userIds = [...new Set(entries.flatMap((entry) => [entry.enteredByUserId, entry.priorityReviewedByUserId].filter(Boolean).map((id) => id.toString())))];
    const users = userIds.length ? await User.find(tenantScopedFilter(req, { _id: { $in: userIds } })).select('name role').lean() : [];
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));
    const latestObservations = patientIds.length
      ? await PatientObservation.aggregate([
        { $match: { tenantId: req.tenantId, patientId: { $in: patientIds } } },
        { $group: { _id: '$patientId', latestObservedAt: { $max: '$observedAt' } } }
      ])
      : [];
    const observationMap = new Map(latestObservations.map((item) => [item._id.toString(), item.latestObservedAt]));

    const queueItems = entries.flatMap((entry) => {
      const patient = patientMap.get(entry.patientId.toString());
      if (!patient || patient.status !== 'icu_waiting') return [];
      const enteredById = entry.enteredByUserId.toString();
      const reviewedById = entry.priorityReviewedByUserId?.toString() || null;
      return [{
        id: entry._id.toString(),
        requestReason: entry.requestReason,
        enteredAt: entry.enteredAt,
        enteredByUserId: enteredById,
        enteredByName: userMap.get(enteredById)?.name || 'Hospital staff',
        reviewPriority: entry.reviewPriority || null,
        priorityReason: entry.priorityReason || '',
        priorityReviewRequired: entry.priorityReviewRequired !== false,
        priorityReviewRequestedAt: entry.priorityReviewRequestedAt || entry.enteredAt,
        priorityReviewedAt: entry.priorityReviewedAt || null,
        priorityReviewedByUserId: reviewedById,
        priorityReviewedByName: reviewedById ? (userMap.get(reviewedById)?.name || 'Hospital clinician') : null,
        patient: {
          id: patient._id.toString(), fullName: patient.fullName, patientCode: patient.patientCode,
          wardName: patient.wardName, bedLabel: patient.bedLabel || '', status: patient.status
        },
        lastObservationAt: observationMap.get(patient._id.toString()) || null
      }];
    });
    const queue = sortICUQueueEntries(queueItems).map((entry, index) => ({ ...entry, position: index + 1 }));
    res.set('Cache-Control', 'no-store');
    return res.json({
      queue,
      count: queue.length,
      ordering: 'needs_staff_review_first_then_staff_assigned_review_priority_then_oldest_waiting',
      orderingPolicy: 'Entries needing a staff priority review appear first, oldest first. Reviewed entries follow the explicitly staff-assigned review tier, then oldest first. This is an operational queue display policy, not an automated clinical score.'
    });
  } catch (error) { return next(error); }
}

export async function addToQueue(req, res, next) {
  let session;
  try {
    const input = normalizeQueueEntryInput(req.body);
    session = await mongoose.startSession();
    let created;
    await session.withTransaction(async () => {
      const patient = await Patient.findOne(tenantScopedFilter(req, { _id: input.patientId, status: 'ward' })).session(session);
      if (!patient) {
        const error = new Error('Patient was not found in this hospital or is not currently in ward status'); error.statusCode = 404; throw error;
      }
      const enteredAt = new Date();
      const latestObservation = await PatientObservation.findOne({ tenantId: req.tenantId, patientId: patient._id })
        .sort({ observedAt: -1, createdAt: -1, _id: -1 }).select('observedAt').session(session).lean();
      const [entry] = await ICUQueueEntry.create([{
        tenantId: req.tenantId, patientId: patient._id, requestReason: input.requestReason,
        enteredByUserId: req.user._id, enteredAt, lastObservationAtForReminder: latestObservation?.observedAt || enteredAt,
        lastReminderAt: null, status: 'waiting', reviewPriority: null, priorityReason: '',
        priorityReviewRequired: true, priorityReviewRequestedAt: enteredAt,
        priorityReviewedByUserId: null, priorityReviewedAt: null
      }], { session });
      patient.status = 'icu_waiting';
      patient.updatedByUserId = req.user._id;
      await patient.save({ session });
      await audit({ session, req, eventType: 'icu_queue.patient_added', entityType: 'ICUQueueEntry', entityId: entry._id, referenceCode: patient.patientCode, fieldNames: ['requestReason', 'status'] });
      await audit({ session, req, eventType: 'patient.status_changed_to_icu_waiting', entityType: 'Patient', entityId: patient._id, referenceCode: patient.patientCode, fieldNames: ['status'] });
      created = { id: entry._id.toString(), patientId: patient._id.toString(), patientCode: patient.patientCode, status: entry.status, enteredAt: entry.enteredAt };
    });
    return res.status(201).json({ queueEntry: created, message: 'Patient added to the ICU waiting list. This list is provisional and does not determine clinical priority or confirm admission.' });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'This patient already has an active ICU waiting-list entry' });
    return next(error);
  } finally { await session?.endSession(); }
}


export async function setQueueReviewPriority(req, res, next) {
  let session;
  try {
    const queueEntryId = validObjectId(req.params.queueEntryId, 'Queue entry identifier');
    const input = normalizeQueueReviewPriorityInput(req.body);
    session = await mongoose.startSession();
    let result = null;
    await session.withTransaction(async () => {
      const entry = await ICUQueueEntry.findOne(tenantScopedFilter(req, { _id: queueEntryId, status: 'waiting' })).session(session);
      if (!entry) {
        const error = new Error('Active waiting-list entry was not found in this hospital'); error.statusCode = 404; throw error;
      }
      const patient = await Patient.findOne(tenantScopedFilter(req, { _id: entry.patientId, status: 'icu_waiting' })).session(session);
      if (!patient) {
        const error = new Error('The linked patient is no longer waiting for ICU assessment'); error.statusCode = 409; throw error;
      }
      const now = new Date();
      entry.reviewPriority = input.reviewPriority;
      entry.priorityReason = input.reason;
      entry.priorityReviewRequired = false;
      entry.priorityReviewRequestedAt = null;
      entry.priorityReviewedByUserId = req.user._id;
      entry.priorityReviewedAt = now;
      await entry.save({ session });
      await audit({
        session, req, eventType: 'icu_queue.staff_review_priority_assigned',
        entityType: 'ICUQueueEntry', entityId: entry._id, referenceCode: patient.patientCode,
        fieldNames: ['reviewPriority', 'priorityReason', 'priorityReviewRequired', 'priorityReviewedByUserId', 'priorityReviewedAt']
      });
      result = {
        id: entry._id.toString(), reviewPriority: entry.reviewPriority, priorityReason: entry.priorityReason,
        priorityReviewRequired: entry.priorityReviewRequired, priorityReviewedAt: entry.priorityReviewedAt,
        priorityReviewedByUserId: req.user._id.toString()
      };
    });
    res.set('Cache-Control', 'no-store');
    return res.json({
      queueEntry: result,
      message: 'Staff-assigned review priority saved. The queue will reorder using the documented operational policy; this is not an automated clinical score.'
    });
  } catch (error) { return next(error); }
  finally { await session?.endSession(); }
}

export async function withdrawFromQueue(req, res, next) {
  let session;
  try {
    const queueEntryId = validObjectId(req.params.queueEntryId, 'Queue entry identifier');
    const reason = normalizeWithdrawalReason(req.body);
    session = await mongoose.startSession();
    let result = null;
    await session.withTransaction(async () => {
      const entry = await ICUQueueEntry.findOne(tenantScopedFilter(req, { _id: queueEntryId, status: 'waiting' })).session(session);
      if (!entry) {
        const error = new Error('Active waiting-list entry was not found in this hospital'); error.statusCode = 404; throw error;
      }
      const patient = await Patient.findOne(tenantScopedFilter(req, { _id: entry.patientId, status: 'icu_waiting' })).session(session);
      if (!patient) {
        const error = new Error('The linked patient is not in ICU waiting status; the queue entry was not changed'); error.statusCode = 409; throw error;
      }
      entry.status = 'withdrawn';
      entry.withdrawnByUserId = req.user._id;
      entry.withdrawnAt = new Date();
      entry.withdrawalReason = reason;
      await entry.save({ session });
      await supersedePendingQueueReminder({ session, tenantId: req.tenantId, queueEntryId: entry._id, reason: 'queue_withdrawn', at: entry.withdrawnAt });
      patient.status = 'ward';
      patient.updatedByUserId = req.user._id;
      await patient.save({ session });
      await audit({ session, req, eventType: 'icu_queue.patient_withdrawn', entityType: 'ICUQueueEntry', entityId: entry._id, referenceCode: patient.patientCode, fieldNames: ['status', 'withdrawalReason'] });
      await audit({ session, req, eventType: 'patient.status_changed_to_ward', entityType: 'Patient', entityId: patient._id, referenceCode: patient.patientCode, fieldNames: ['status'] });
      result = { id: entry._id.toString(), status: entry.status, patientCode: patient.patientCode };
    });
    return res.json({ queueEntry: result, message: 'The waiting-list entry was withdrawn. This action does not represent ICU admission or a clinical decision.' });
  } catch (error) { return next(error); }
  finally { await session?.endSession(); }
}


export async function listAdmissions(req, res, next) {
  try {
    const patients = await Patient.find(tenantScopedFilter(req, { status: 'icu_admitted' }))
      .sort({ icuAdmittedAt: -1, _id: 1 }).lean();
    const bedIds = patients.map((patient) => patient.activeICUBedId).filter(Boolean);
    const beds = bedIds.length
      ? await ICUBed.find(tenantScopedFilter(req, { _id: { $in: bedIds }, status: 'occupied' }))
        .populate({ path: 'assignedPatientId', select: 'fullName patientCode status tenantId', match: { tenantId: req.tenantId } }).lean()
      : [];
    const bedMap = new Map(beds.map((bed) => [bed._id.toString(), bed]));
    const admissions = patients.map((patient) => {
      const bed = patient.activeICUBedId ? bedMap.get(patient.activeICUBedId.toString()) : null;
      const bedMatchesPatient = Boolean(bed && bed.assignedPatientId && bed.assignedPatientId._id.toString() === patient._id.toString());
      return {
        patient: {
          id: patient._id.toString(), patientCode: patient.patientCode, fullName: patient.fullName,
          wardName: patient.wardName, bedLabel: patient.bedLabel || '', status: patient.status
        },
        bed: bedMatchesPatient ? serializeBed(bed) : null,
        admittedAt: patient.icuAdmittedAt || null,
        integrityWarning: !bedMatchesPatient
      };
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ admissions, count: admissions.length });
  } catch (error) { return next(error); }
}

export async function confirmAllocation(req, res, next) {
  let session;
  try {
    const queueEntryId = validObjectId(req.params.queueEntryId, 'Queue entry identifier');
    const input = normalizeAllocationInput(req.body);
    const bedId = validObjectId(input.bedId, 'Bed identifier');
    session = await mongoose.startSession();
    let result = null;
    await session.withTransaction(async () => {
      const entry = await ICUQueueEntry.findOne(tenantScopedFilter(req, { _id: queueEntryId, status: 'waiting' })).session(session);
      if (!entry) {
        const error = new Error('Active waiting-list entry was not found in this hospital'); error.statusCode = 404; throw error;
      }
      const patient = await Patient.findOne(tenantScopedFilter(req, { _id: entry.patientId, status: 'icu_waiting' })).session(session);
      if (!patient) {
        const error = new Error('The linked patient is not waiting for ICU admission'); error.statusCode = 409; throw error;
      }
      if (patient.activeICUBedId || patient.activeICUQueueEntryId) {
        const error = new Error('The patient already has an active ICU admission link'); error.statusCode = 409; throw error;
      }
      const candidateBed = await ICUBed.findOne(tenantScopedFilter(req, { _id: bedId, status: 'ready', assignedPatientId: null })).session(session);
      if (!candidateBed) {
        const error = new Error('Selected bed is not available and ready in this hospital'); error.statusCode = 409; throw error;
      }

      const now = new Date();
      const updatedBed = await ICUBed.findOneAndUpdate(
        tenantScopedFilter(req, { _id: bedId, status: 'ready', assignedPatientId: null }),
        { $set: { status: 'occupied', assignedPatientId: patient._id, assignedQueueEntryId: entry._id, assignedAt: now, assignedByUserId: req.user._id, updatedByUserId: req.user._id, lastStatusChangedAt: now } },
        { new: true, session, runValidators: true }
      );
      if (!updatedBed) {
        const error = new Error('The bed was just assigned or changed by another user. Refresh and choose another ready bed.'); error.statusCode = 409; throw error;
      }

      const updatedEntry = await ICUQueueEntry.findOneAndUpdate(
        tenantScopedFilter(req, { _id: entry._id, status: 'waiting' }),
        { $set: { status: 'admitted', allocatedBedId: updatedBed._id, confirmedByUserId: req.user._id, confirmedAt: now, confirmationReason: input.confirmationReason } },
        { new: true, session, runValidators: true }
      );
      if (!updatedEntry) {
        const error = new Error('The waiting-list entry has already changed. Refresh before retrying.'); error.statusCode = 409; throw error;
      }
      await supersedePendingQueueReminder({ session, tenantId: req.tenantId, queueEntryId: updatedEntry._id, reason: 'patient_admitted', at: now });

      const updatedPatient = await Patient.findOneAndUpdate(
        tenantScopedFilter(req, { _id: patient._id, status: 'icu_waiting', activeICUBedId: null, activeICUQueueEntryId: null }),
        { $set: { status: 'icu_admitted', activeICUBedId: updatedBed._id, activeICUQueueEntryId: updatedEntry._id, icuAdmittedAt: now, updatedByUserId: req.user._id } },
        { new: true, session, runValidators: true }
      );
      if (!updatedPatient) {
        const error = new Error('Patient status changed concurrently. No allocation was committed; refresh and review.'); error.statusCode = 409; throw error;
      }

      await audit({ session, req, eventType: 'icu_allocation.confirmed_by_staff', entityType: 'ICUQueueEntry', entityId: updatedEntry._id, referenceCode: patient.patientCode, fieldNames: ['status', 'allocatedBedId', 'confirmedAt', 'confirmationReason'] });
      await audit({ session, req, eventType: 'icu_bed.assigned_to_patient', entityType: 'ICUBed', entityId: updatedBed._id, referenceCode: updatedBed.bedCode, fieldNames: ['status', 'assignedPatientId', 'assignedAt'] });
      await audit({ session, req, eventType: 'patient.status_changed_to_icu_admitted', entityType: 'Patient', entityId: updatedPatient._id, referenceCode: patient.patientCode, fieldNames: ['status', 'activeICUBedId', 'icuAdmittedAt'] });

      result = {
        patient: { id: updatedPatient._id.toString(), patientCode: updatedPatient.patientCode, fullName: updatedPatient.fullName, status: updatedPatient.status },
        bed: { id: updatedBed._id.toString(), bedCode: updatedBed.bedCode, unitName: updatedBed.unitName, status: updatedBed.status },
        confirmedAt: now, confirmedByUserId: req.user._id.toString(), confirmationReason: input.confirmationReason
      };
    });
    return res.json({ allocation: result, message: req.mlRanked ? 'Staff-confirmed ICU placement recorded for the highest-ranked waiting patient (ML + early-warning priority).' : 'Staff-confirmed ICU placement recorded. This action used the selected bed and patient; no ML score or automatic clinical ranking was used.' });
  } catch (error) { return next(error); }
  finally { await session?.endSession(); }
}

export async function dischargeAdmission(req, res, next) {
  let session;
  try {
    const patientId = validObjectId(req.params.patientId, 'Patient identifier');
    const input = normalizeDischargeInput(req.body);
    session = await mongoose.startSession();
    let result = null;
    await session.withTransaction(async () => {
      const patient = await Patient.findOne(tenantScopedFilter(req, { _id: patientId, status: 'icu_admitted' })).session(session);
      if (!patient || !patient.activeICUBedId || !patient.activeICUQueueEntryId) {
        const error = new Error('Active ICU admission was not found for this patient in this hospital'); error.statusCode = 404; throw error;
      }

      const bed = await ICUBed.findOne(tenantScopedFilter(req, {
        _id: patient.activeICUBedId, status: 'occupied', assignedPatientId: patient._id,
        assignedQueueEntryId: patient.activeICUQueueEntryId
      })).session(session);
      const entry = await ICUQueueEntry.findOne(tenantScopedFilter(req, {
        _id: patient.activeICUQueueEntryId, patientId: patient._id, status: 'admitted', allocatedBedId: patient.activeICUBedId
      })).session(session);
      if (!bed || !entry) {
        const error = new Error('Admission records are inconsistent. Do not force-release the bed; review the audit history.'); error.statusCode = 409; throw error;
      }

      const now = new Date();
      const updatedBed = await ICUBed.findOneAndUpdate(
        tenantScopedFilter(req, { _id: bed._id, status: 'occupied', assignedPatientId: patient._id, assignedQueueEntryId: entry._id }),
        { $set: { status: 'cleaning', assignedPatientId: null, assignedQueueEntryId: null, assignedAt: null, assignedByUserId: null, updatedByUserId: req.user._id, lastStatusChangedAt: now } },
        { new: true, session, runValidators: true }
      );
      if (!updatedBed) {
        const error = new Error('The bed assignment changed concurrently. Refresh and review the current admission.'); error.statusCode = 409; throw error;
      }

      const updatedEntry = await ICUQueueEntry.findOneAndUpdate(
        tenantScopedFilter(req, { _id: entry._id, status: 'admitted', dischargedAt: null }),
        { $set: { dischargedAt: now, dischargedByUserId: req.user._id, dischargeDisposition: input.disposition, dischargeReason: input.reason } },
        { new: true, session, runValidators: true }
      );
      if (!updatedEntry) {
        const error = new Error('The admission record has already been closed. Refresh and review.'); error.statusCode = 409; throw error;
      }

      const updatedPatient = await Patient.findOneAndUpdate(
        tenantScopedFilter(req, { _id: patient._id, status: 'icu_admitted', activeICUBedId: bed._id, activeICUQueueEntryId: entry._id }),
        { $set: { status: input.disposition, activeICUBedId: null, activeICUQueueEntryId: null, lastICUDischargedAt: now, updatedByUserId: req.user._id } },
        { new: true, session, runValidators: true }
      );
      if (!updatedPatient) {
        const error = new Error('Patient admission status changed concurrently. No discharge was committed; refresh and review.'); error.statusCode = 409; throw error;
      }

      await audit({ session, req, eventType: 'icu_admission.closed_by_staff', entityType: 'ICUQueueEntry', entityId: updatedEntry._id, referenceCode: patient.patientCode, fieldNames: ['dischargedAt', 'dischargeDisposition', 'dischargeReason'] });
      await audit({ session, req, eventType: 'icu_bed.released_to_cleaning', entityType: 'ICUBed', entityId: updatedBed._id, referenceCode: updatedBed.bedCode, fieldNames: ['status', 'assignedPatientId'] });
      await audit({ session, req, eventType: input.disposition === 'ward' ? 'patient.returned_to_ward_from_icu' : 'patient.discharged_from_icu', entityType: 'Patient', entityId: updatedPatient._id, referenceCode: patient.patientCode, fieldNames: ['status', 'lastICUDischargedAt'] });

      result = {
        patient: { id: updatedPatient._id.toString(), patientCode: updatedPatient.patientCode, fullName: updatedPatient.fullName, status: updatedPatient.status },
        bed: { id: updatedBed._id.toString(), bedCode: updatedBed.bedCode, status: updatedBed.status },
        dischargedAt: now, disposition: input.disposition, reason: input.reason
      };
    });
    return res.json({ discharge: result, message: `ICU admission closed. The bed is now marked for cleaning and must be confirmed ready before another allocation.` });
  } catch (error) { return next(error); }
  finally { await session?.endSession(); }
}
