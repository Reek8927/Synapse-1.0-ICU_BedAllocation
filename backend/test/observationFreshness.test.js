import test from 'node:test';
import assert from 'node:assert/strict';
import { isObservationFreshForReminder } from '../src/utils/observationFreshness.js';

const minute = 60_000;
const recordedAt = new Date('2026-10-12T03:00:00.000Z');

test('a measurement recorded now can supersede a pending reminder', () => {
  assert.equal(isObservationFreshForReminder(recordedAt, recordedAt, 8 * minute), true);
});

test('a measurement younger than the interval is fresh', () => {
  assert.equal(isObservationFreshForReminder(new Date(recordedAt.getTime() - 7 * minute), recordedAt, 8 * minute), true);
});

test('an observation at the interval boundary is not fresh', () => {
  assert.equal(isObservationFreshForReminder(new Date(recordedAt.getTime() - 8 * minute), recordedAt, 8 * minute), false);
});

test('a future-dated measurement cannot clear an active reminder', () => {
  assert.equal(isObservationFreshForReminder(new Date(recordedAt.getTime() + 4 * minute), recordedAt, 8 * minute), false);
});

test('invalid timestamps do not clear a reminder', () => {
  assert.equal(isObservationFreshForReminder('not-a-date', recordedAt, 8 * minute), false);
  assert.equal(isObservationFreshForReminder(recordedAt, 'not-a-date', 8 * minute), false);
});

test('an invalid interval does not clear a reminder', () => {
  assert.equal(isObservationFreshForReminder(recordedAt, recordedAt, 0), false);
  assert.equal(isObservationFreshForReminder(recordedAt, recordedAt, Number.NaN), false);
});
