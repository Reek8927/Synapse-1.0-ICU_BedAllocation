import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeICUBedInput, normalizeQueueEntryInput, normalizeQueueReviewPriorityInput, normalizeWithdrawalReason, normalizeAllocationInput, normalizeDischargeInput } from '../src/utils/icuValidation.js';

test('ICU bed input normalizes identifiers and applies safe defaults', () => {
  const result = normalizeICUBedInput({ bedCode: ' icu-01 ', unitName: 'Adult ICU' });
  assert.equal(result.bedCode, 'ICU-01');
  assert.equal(result.unitName, 'Adult ICU');
  assert.equal(result.status, 'ready');
  assert.equal(result.locationLabel, '');
});

test('ICU bed input rejects client-supplied tenant or audit fields', () => {
  assert.throws(() => normalizeICUBedInput({ bedCode: 'ICU-01', tenantId: 'another-hospital' }), /Unsupported bed field/);
  assert.throws(() => normalizeICUBedInput({ bedCode: 'ICU-01', createdByUserId: 'user-id' }), /Unsupported bed field/);
});

test('ICU bed input only accepts the defined operational statuses', () => {
  assert.throws(() => normalizeICUBedInput({ bedCode: 'ICU-01', status: 'free' }), /Bed status is invalid/);
  assert.equal(normalizeICUBedInput({ bedCode: 'ICU-02', status: 'cleaning' }).status, 'cleaning');
});

test('partial bed updates require at least one allowed field', () => {
  assert.throws(() => normalizeICUBedInput({}, { partial: true }), /At least one supported bed field/);
  assert.deepEqual(normalizeICUBedInput({ status: 'unavailable' }, { partial: true }), { status: 'unavailable' });
});

test('queue requests validate patient identifier and a recorded reason', () => {
  assert.throws(() => normalizeQueueEntryInput({ patientId: 'not-an-id', requestReason: 'Needs assessment' }), /Patient identifier is invalid/);
  assert.throws(() => normalizeQueueEntryInput({ patientId: '507f1f77bcf86cd799439011', requestReason: 'x' }), /at least 3 characters/);
  const result = normalizeQueueEntryInput({ patientId: '507f1f77bcf86cd799439011', requestReason: '  Staff requested ICU assessment  ' });
  assert.equal(result.requestReason, 'Staff requested ICU assessment');
});

test('queue request rejects unsupported fields including tenant identity', () => {
  assert.throws(() => normalizeQueueEntryInput({ patientId: '507f1f77bcf86cd799439011', requestReason: 'Clinical request', tenantId: 'hospital-b' }), /Unsupported queue field/);
});

test('withdrawal requires a meaningful reason and accepts no unrelated fields', () => {
  assert.throws(() => normalizeWithdrawalReason({ reason: 'x' }), /at least 3 characters/);
  assert.throws(() => normalizeWithdrawalReason({ reason: 'Reason recorded', status: 'admitted' }), /Unsupported queue field/);
  assert.equal(normalizeWithdrawalReason({ reason: 'No longer awaiting ICU review' }), 'No longer awaiting ICU review');
});


test('new beds cannot be created as occupied or reserved', () => {
  assert.throws(() => normalizeICUBedInput({ bedCode: 'ICU-03', status: 'occupied' }), /cannot be created as occupied or reserved/);
  assert.throws(() => normalizeICUBedInput({ bedCode: 'ICU-04', status: 'reserved' }), /cannot be created as occupied or reserved/);
});

test('staff-confirmed allocation requires a valid bed and a reason, rejecting caller-controlled fields', () => {
  assert.throws(() => normalizeAllocationInput({ bedId: 'bad', confirmationReason: 'Reviewed' }), /Bed identifier is invalid/);
  assert.throws(() => normalizeAllocationInput({ bedId: '507f1f77bcf86cd799439011', confirmationReason: 'x' }), /at least 3 characters/);
  assert.throws(() => normalizeAllocationInput({ bedId: '507f1f77bcf86cd799439011', confirmationReason: 'Reviewed', tenantId: 'hospital-b' }), /Unsupported allocation field/);
  assert.deepEqual(normalizeAllocationInput({ bedId: '507f1f77bcf86cd799439011', confirmationReason: 'Consultant confirmed placement' }), { bedId: '507f1f77bcf86cd799439011', confirmationReason: 'Consultant confirmed placement' });
});

test('ICU discharge accepts only ward or discharged disposition with a meaningful reason', () => {
  assert.throws(() => normalizeDischargeInput({ disposition: 'home', reason: 'Transfer' }), /Disposition must be ward or discharged/);
  assert.throws(() => normalizeDischargeInput({ disposition: 'ward', reason: 'x' }), /at least 3 characters/);
  assert.throws(() => normalizeDischargeInput({ disposition: 'ward', reason: 'Clinical transfer', status: 'ready' }), /Unsupported discharge field/);
  assert.deepEqual(normalizeDischargeInput({ disposition: 'discharged', reason: 'Hospital discharge confirmed' }), { disposition: 'discharged', reason: 'Hospital discharge confirmed' });
});


test('queue review priority requires an allowed staff-assigned tier and reason', () => {
  assert.throws(() => normalizeQueueReviewPriorityInput({ reviewPriority: 'critical', reason: 'Clinician review' }), /Choose Immediate review/);
  assert.throws(() => normalizeQueueReviewPriorityInput({ reviewPriority: 'urgent_review', reason: 'x' }), /at least 3 characters/);
  assert.throws(() => normalizeQueueReviewPriorityInput({ reviewPriority: 'routine_review', reason: 'Policy-based review', tenantId: 'other-hospital' }), /Unsupported queue review priority field/);
  assert.deepEqual(normalizeQueueReviewPriorityInput({ reviewPriority: 'urgent_review', reason: 'Reviewed by clinician' }), { reviewPriority: 'urgent_review', reason: 'Reviewed by clinician' });
});
