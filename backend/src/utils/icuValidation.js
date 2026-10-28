import { ICU_BED_STATUSES } from './icuConstants.js';

export function icuValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function text(value, label, { min = 0, max, required = false, defaultValue = '' } = {}) {
  if (value === undefined || value === null) {
    if (required) throw icuValidationError(`${label} is required`);
    return defaultValue;
  }
  if (typeof value !== 'string') throw icuValidationError(`${label} must be text`);
  const normalized = value.trim();
  if (required && normalized.length < min) throw icuValidationError(`${label} must contain at least ${min} characters`);
  if (!required && normalized.length > 0 && normalized.length < min) throw icuValidationError(`${label} must contain at least ${min} characters`);
  if (normalized.length > max) throw icuValidationError(`${label} must be ${max} characters or fewer`);
  return normalized;
}

export function normalizeICUBedInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw icuValidationError('Bed details are required');
  const allowed = new Set(['bedCode', 'unitName', 'locationLabel', 'status', 'notes']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw icuValidationError(`Unsupported bed field: ${key}`);
  const input = {};
  if (!partial || body.bedCode !== undefined) input.bedCode = text(body.bedCode, 'Bed code', { min: 1, max: 24, required: !partial }).toUpperCase();
  if (!partial || body.unitName !== undefined) input.unitName = text(body.unitName, 'Unit name', { min: 1, max: 80, required: !partial && body.unitName !== undefined, defaultValue: 'ICU' });
  if (!partial || body.locationLabel !== undefined) input.locationLabel = text(body.locationLabel, 'Location label', { max: 80 });
  if (!partial || body.notes !== undefined) input.notes = text(body.notes, 'Notes', { max: 500 });
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !ICU_BED_STATUSES.includes(body.status)) throw icuValidationError('Bed status is invalid');
    input.status = body.status;
  } else if (!partial) input.status = 'ready';
  if (!partial && ['occupied', 'reserved'].includes(input.status)) {
    throw icuValidationError('New beds cannot be created as occupied or reserved. Use the staff-confirmed allocation workflow for occupancy.');
  }
  if (partial && Object.keys(input).length === 0) throw icuValidationError('At least one supported bed field must be supplied');
  return input;
}

export function normalizeQueueEntryInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw icuValidationError('Queue entry details are required');
  const allowed = new Set(['patientId', 'requestReason']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw icuValidationError(`Unsupported queue field: ${key}`);
  if (typeof body.patientId !== 'string' || !/^[a-f\d]{24}$/i.test(body.patientId)) throw icuValidationError('Patient identifier is invalid');
  return {
    patientId: body.patientId,
    requestReason: text(body.requestReason, 'Reason for ICU assessment', { min: 3, max: 1000, required: true })
  };
}


export function normalizeQueueReviewPriorityInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw icuValidationError('Queue review priority details are required');
  const allowed = new Set(['reviewPriority', 'reason']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw icuValidationError(`Unsupported queue review priority field: ${key}`);
  if (!['immediate_review', 'urgent_review', 'routine_review'].includes(body.reviewPriority)) {
    throw icuValidationError('Choose Immediate review, Urgent review, or Routine review');
  }
  return {
    reviewPriority: body.reviewPriority,
    reason: text(body.reason, 'Reason for assigned review priority', { min: 3, max: 500, required: true })
  };
}

export function normalizeWithdrawalReason(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw icuValidationError('Withdrawal reason is required');
  for (const key of Object.keys(body)) if (key !== 'reason') throw icuValidationError(`Unsupported queue field: ${key}`);
  return text(body.reason, 'Withdrawal reason', { min: 3, max: 500, required: true });
}


export function normalizeAllocationInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw icuValidationError('Allocation confirmation details are required');
  const allowed = new Set(['bedId', 'confirmationReason']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw icuValidationError(`Unsupported allocation field: ${key}`);
  if (typeof body.bedId !== 'string' || !/^[a-f\d]{24}$/i.test(body.bedId)) throw icuValidationError('Bed identifier is invalid');
  return {
    bedId: body.bedId,
    confirmationReason: text(body.confirmationReason, 'Allocation confirmation reason', { min: 3, max: 500, required: true })
  };
}

export function normalizeDischargeInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw icuValidationError('ICU discharge details are required');
  const allowed = new Set(['disposition', 'reason']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw icuValidationError(`Unsupported discharge field: ${key}`);
  if (!['ward', 'discharged'].includes(body.disposition)) throw icuValidationError('Disposition must be ward or discharged');
  return {
    disposition: body.disposition,
    reason: text(body.reason, 'Discharge reason', { min: 3, max: 500, required: true })
  };
}
