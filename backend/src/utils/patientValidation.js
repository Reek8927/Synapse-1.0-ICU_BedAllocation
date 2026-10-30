import { SEX_AT_BIRTH_OPTIONS } from './patientConstants.js';

const patientFields = ['fullName', 'hospitalRecordNumber', 'dateOfBirth', 'sexAtBirth', 'wardName', 'bedLabel'];
const numericRules = {
  temperatureC: { min: 0, max: 60, label: 'Temperature (°C)' },
  heartRateBpm: { min: 0, max: 400, label: 'Heart rate (bpm)' },
  systolicBpMmhg: { min: 0, max: 400, label: 'Systolic blood pressure (mmHg)' },
  diastolicBpMmhg: { min: 0, max: 300, label: 'Diastolic blood pressure (mmHg)' },
  respiratoryRateBpm: { min: 0, max: 200, label: 'Respiratory rate (breaths/min)' },
  oxygenSaturationPercent: { min: 0, max: 100, label: 'Oxygen saturation (%)' },
  gcsTotal: { min: 3, max: 15, label: 'GCS total' }
};

export function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requiredTrimmed(value, label, min, max) {
  if (typeof value !== 'string') throw validationError(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw validationError(`${label} must contain ${min} to ${max} characters`);
  }
  return normalized;
}

function optionalTrimmed(value, label, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw validationError(`${label} must be text`);
  const normalized = value.trim();
  if (normalized.length > max) throw validationError(`${label} must be at most ${max} characters`);
  return normalized;
}

function parseDateOnly(value, label, { optional = false, allowFuture = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${label} must be a valid date in YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw validationError(`${label} is not a valid calendar date`);
  }
  if (!allowFuture && date.getTime() > Date.now()) throw validationError(`${label} cannot be in the future`);
  return date;
}

export function normalizePatientInput(body, { partial = false } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const allowed = new Set(patientFields);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw validationError(`Unsupported patient field: ${unknown[0]}`);

  const output = {};
  if (!partial || Object.hasOwn(input, 'fullName')) output.fullName = requiredTrimmed(input.fullName, 'Patient name', 2, 120);
  if (!partial || Object.hasOwn(input, 'wardName')) output.wardName = requiredTrimmed(input.wardName, 'Ward name', 1, 80);
  if (!partial || Object.hasOwn(input, 'hospitalRecordNumber')) output.hospitalRecordNumber = optionalTrimmed(input.hospitalRecordNumber, 'Hospital record number', 40);
  if (!partial || Object.hasOwn(input, 'bedLabel')) output.bedLabel = optionalTrimmed(input.bedLabel, 'Bed/room label', 30);

  if (!partial || Object.hasOwn(input, 'sexAtBirth')) {
    const sex = input.sexAtBirth === undefined || input.sexAtBirth === '' ? 'not_recorded' : input.sexAtBirth;
    if (typeof sex !== 'string' || !SEX_AT_BIRTH_OPTIONS.includes(sex)) {
      throw validationError('Select a valid sex-at-birth option or leave it unrecorded');
    }
    output.sexAtBirth = sex;
  }
  if (!partial || Object.hasOwn(input, 'dateOfBirth')) output.dateOfBirth = parseDateOnly(input.dateOfBirth, 'Date of birth', { optional: true });
  if (partial && Object.keys(output).length === 0) throw validationError('Provide at least one supported field to update');
  return output;
}

export function normalizeObservationInput(body, patientAdmittedAt = null) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const allowed = new Set([...Object.keys(numericRules), 'notes', 'observedAt']);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw validationError(`Unsupported observation field: ${unknown[0]}`);

  const output = {};
  const suppliedMeasurements = [];
  for (const [field, rule] of Object.entries(numericRules)) {
    const raw = input[field];
    if (raw === undefined || raw === null || raw === '') {
      output[field] = null;
      continue;
    }
    const value = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() ? Number(raw) : Number.NaN);
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
      throw validationError(`${rule.label} must be a number between ${rule.min} and ${rule.max}`);
    }
    output[field] = value;
    suppliedMeasurements.push(field);
  }

  output.notes = optionalTrimmed(input.notes, 'Observation notes', 2000);
  if (suppliedMeasurements.length === 0) throw validationError('Enter at least one valid measurement before saving an observation');

  let observedAt = new Date();
  if (input.observedAt !== undefined && input.observedAt !== '') {
    if (typeof input.observedAt !== 'string' || Number.isNaN(Date.parse(input.observedAt))) {
      throw validationError('Observation date and time is invalid');
    }
    observedAt = new Date(input.observedAt);
  }
  if (observedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw validationError('Observation time cannot be more than five minutes in the future');
  }
  if (patientAdmittedAt && observedAt.getTime() < new Date(patientAdmittedAt).getTime()) {
    throw validationError('Observation time cannot be before this admission');
  }
  output.observedAt = observedAt;
  output.fieldNames = suppliedMeasurements;
  if (output.notes) output.fieldNames.push('notes');
  return output;
}



import { EXTRA_LAB_INPUTS, ICU_UNIT_TYPES } from './modelInputs.js';

const researchAssessmentRules = {
  glucose: {
    min: 0,
    max: 2000,
    label: 'Glucose (mg/dL)'
  },
  lactate: {
    min: 0,
    max: 50,
    label: 'Lactate (mmol/L)'
  },
  creatinine: {
    min: 0,
    max: 100,
    label: 'Creatinine (mg/dL)'
  },
  wbc: {
    min: 0,
    max: 1000,
    label: 'White blood cell count (10^9/L)'
  },
  platelets: {
    min: 0,
    max: 10000,
    label: 'Platelets (10^9/L)'
  }
};

export function normalizeResearchAssessmentInput(
  body,
  patientAdmittedAt = null
) {
  const input =
    body && typeof body === 'object' && !Array.isArray(body)
      ? body
      : {};

  const allowed = new Set([
    ...Object.keys(researchAssessmentRules),
    ...EXTRA_LAB_INPUTS.map((item) => item.field),
    'icuUnitType',
    'assessedAt',
    'notes'
  ]);

  const unknown = Object.keys(input).filter(
    (key) => !allowed.has(key)
  );

  if (unknown.length) {
    throw validationError(
      `Unsupported assessment field: ${unknown[0]}`
    );
  }

  const output = {};

  for (const [field, rule] of Object.entries(researchAssessmentRules)) {
    const raw = input[field];

    if (
      raw === undefined ||
      raw === null ||
      (typeof raw === 'string' && !raw.trim())
    ) {
      throw validationError(`${rule.label} is required to complete the assessment`);
    }

    const value =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw)
          : Number.NaN;

    if (
      !Number.isFinite(value) ||
      value < rule.min ||
      value > rule.max
    ) {
      throw validationError(
        `${rule.label} must be a number between ${rule.min} and ${rule.max}`
      );
    }

    output[field] = value;
  }

  // Optional extra results: blank means "not measured".
  const suppliedExtras = [];

  for (const item of EXTRA_LAB_INPUTS) {
    const raw = input[item.field];

    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
      continue;
    }

    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;

    if (!Number.isFinite(value) || value < item.min || value > item.max) {
      throw validationError(
        `${item.label} (${item.unit || 'no unit'}) must be a number between ${item.min} and ${item.max}`
      );
    }

    output[item.field] = value;
    suppliedExtras.push(item.field);
  }

  if (input.icuUnitType !== undefined && input.icuUnitType !== null && input.icuUnitType !== '') {
    if (!ICU_UNIT_TYPES.includes(input.icuUnitType)) {
      throw validationError('ICU type must be medical or surgical');
    }

    output.icuUnitType = input.icuUnitType;
    suppliedExtras.push('icuUnitType');
  }

  output.notes = optionalTrimmed(
    input.notes,
    'Assessment notes',
    2000
  );

  let assessedAt = new Date();

  if (input.assessedAt !== undefined && input.assessedAt !== '') {
    if (
      typeof input.assessedAt !== 'string' ||
      Number.isNaN(Date.parse(input.assessedAt))
    ) {
      throw validationError('Assessment date and time is invalid');
    }

    assessedAt = new Date(input.assessedAt);
  }

  if (assessedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw validationError(
      'Assessment time cannot be more than five minutes in the future'
    );
  }

  if (
    patientAdmittedAt &&
    assessedAt.getTime() < new Date(patientAdmittedAt).getTime()
  ) {
    throw validationError(
      'Assessment time cannot be before this admission'
    );
  }

  output.assessedAt = assessedAt;
  output.fieldNames = [
    ...Object.keys(researchAssessmentRules),
    ...suppliedExtras,
    ...(output.notes ? ['notes'] : [])
  ];

  return output;
}

