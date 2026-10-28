import test from 'node:test';
import assert from 'node:assert/strict';
import { isObservationReminderDue, normalizeReminderIntervalMinutes, normalizeReminderPollMs } from '../src/utils/reminderTiming.js';

const MINUTE = 60 * 1000;
const now = new Date('2026-10-11T12:00:00.000Z');

test('does not remind before the eight-minute observation interval', () => {
  assert.equal(isObservationReminderDue({ lastObservationAtForReminder: new Date(now - 7 * MINUTE) }, now, 8 * MINUTE), false);
});

test('reminds at the interval if no newer observation was entered', () => {
  assert.equal(isObservationReminderDue({ lastObservationAtForReminder: new Date(now - 8 * MINUTE) }, now, 8 * MINUTE), true);
});

test('waits eight minutes after the previous reminder too', () => {
  assert.equal(isObservationReminderDue({
    lastObservationAtForReminder: new Date(now - 40 * MINUTE),
    lastReminderAt: new Date(now - 7 * MINUTE)
  }, now, 8 * MINUTE), false);
  assert.equal(isObservationReminderDue({
    lastObservationAtForReminder: new Date(now - 40 * MINUTE),
    lastReminderAt: new Date(now - 8 * MINUTE)
  }, now, 8 * MINUTE), true);
});

test('a newer observation entry postpones the reminder interval', () => {
  assert.equal(isObservationReminderDue({
    lastObservationAtForReminder: new Date(now - 2 * MINUTE),
    lastReminderAt: new Date(now - 20 * MINUTE)
  }, now, 8 * MINUTE), false);
});

test('legacy queue entries fall back to enteredAt', () => {
  assert.equal(isObservationReminderDue({ enteredAt: new Date(now - 8 * MINUTE) }, now, 8 * MINUTE), true);
});

test('invalid timestamps and intervals fail closed', () => {
  assert.equal(isObservationReminderDue({}, now, 8 * MINUTE), false);
  assert.equal(isObservationReminderDue({ enteredAt: now }, now, 0), false);
});

test('worker interval settings enforce safe bounds', () => {
  assert.equal(normalizeReminderIntervalMinutes('8'), 8);
  assert.equal(normalizeReminderIntervalMinutes('0'), 8);
  assert.equal(normalizeReminderPollMs('1000'), 15000);
  assert.equal(normalizeReminderPollMs('30000'), 30000);
});
