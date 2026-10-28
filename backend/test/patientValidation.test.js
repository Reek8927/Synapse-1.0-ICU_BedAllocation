import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObservationInput, normalizePatientInput } from '../src/utils/patientValidation.js';

test('patient registration normalizes fields and defaults unknown demographic data', () => {
  const result = normalizePatientInput({ fullName: '  Priya Sen  ', wardName: ' Medical Ward ', bedLabel: ' M-12 ' });
  assert.equal(result.fullName, 'Priya Sen');
  assert.equal(result.wardName, 'Medical Ward');
  assert.equal(result.bedLabel, 'M-12');
  assert.equal(result.sexAtBirth, 'not_recorded');
  assert.equal(result.dateOfBirth, null);
});

test('patient input rejects tenant and status fields supplied by the client', () => {
  assert.throws(() => normalizePatientInput({ fullName: 'Priya Sen', wardName: 'Ward A', tenantId: 'other-hospital' }), /Unsupported patient field/);
  assert.throws(() => normalizePatientInput({ fullName: 'Priya Sen', wardName: 'Ward A', status: 'icu_admitted' }), /Unsupported patient field/);
});

test('patient input rejects an invalid or future date of birth', () => {
  assert.throws(() => normalizePatientInput({ fullName: 'Priya Sen', wardName: 'Ward A', dateOfBirth: '2025-02-31' }), /valid calendar date/);
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.throws(() => normalizePatientInput({ fullName: 'Priya Sen', wardName: 'Ward A', dateOfBirth: future }), /cannot be in the future/);
});

test('observation input accepts one valid measurement and leaves absent values empty', () => {
  const result = normalizeObservationInput({ temperatureC: '37.1', heartRateBpm: '', notes: 'Entered from bedside monitor' });
  assert.equal(result.temperatureC, 37.1);
  assert.equal(result.heartRateBpm, null);
  assert.ok(result.observedAt instanceof Date);
  assert.deepEqual(result.fieldNames, ['temperatureC', 'notes']);
});

test('observation input rejects empty measurements and out-of-range values', () => {
  assert.throws(() => normalizeObservationInput({ notes: 'No value supplied' }), /at least one valid measurement/);
  assert.throws(() => normalizeObservationInput({ oxygenSaturationPercent: '101' }), /between 0 and 100/);
  assert.throws(() => normalizeObservationInput({ gcsTotal: '2' }), /between 3 and 15/);
});

test('observation time cannot precede admission or be far in the future', () => {
  const admission = new Date('2026-10-09T10:00:00.000Z');
  assert.throws(() => normalizeObservationInput({ heartRateBpm: 80, observedAt: '2026-10-08T10:00:00.000Z' }, admission), /before this admission/);
  assert.throws(() => normalizeObservationInput({ heartRateBpm: 80, observedAt: '2099-01-01T10:00:00.000Z' }, admission), /more than five minutes in the future/);
});
