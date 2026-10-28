import test from 'node:test';
import assert from 'node:assert/strict';
import { compareICUQueueEntries, sortICUQueueEntries } from '../src/utils/icuQueuePriority.js';

function item(id, { priorityReviewRequired = false, reviewPriority = null, enteredAt } = {}) {
  return { id, priorityReviewRequired, reviewPriority, enteredAt: new Date(enteredAt) };
}

test('entries needing staff review appear before reviewed entries', () => {
  const items = [
    item('reviewed-immediate', { reviewPriority: 'immediate_review', enteredAt: '2026-01-01T00:00:00Z' }),
    item('needs-review', { priorityReviewRequired: true, reviewPriority: 'routine_review', enteredAt: '2026-01-02T00:00:00Z' })
  ];
  assert.deepEqual(sortICUQueueEntries(items).map((entry) => entry.id), ['needs-review', 'reviewed-immediate']);
});

test('reviewed entries are sorted by staff-assigned review tier', () => {
  const items = [
    item('routine', { reviewPriority: 'routine_review', enteredAt: '2026-01-01T00:00:00Z' }),
    item('urgent', { reviewPriority: 'urgent_review', enteredAt: '2026-01-03T00:00:00Z' }),
    item('immediate', { reviewPriority: 'immediate_review', enteredAt: '2026-01-04T00:00:00Z' })
  ];
  assert.deepEqual(sortICUQueueEntries(items).map((entry) => entry.id), ['immediate', 'urgent', 'routine']);
});

test('entries with the same review tier are FIFO by enteredAt', () => {
  const items = [
    item('later', { reviewPriority: 'urgent_review', enteredAt: '2026-01-02T00:00:00Z' }),
    item('earlier', { reviewPriority: 'urgent_review', enteredAt: '2026-01-01T00:00:00Z' })
  ];
  assert.deepEqual(sortICUQueueEntries(items).map((entry) => entry.id), ['earlier', 'later']);
});

test('legacy records without a review flag are conservatively treated as needing review', () => {
  const legacy = { id: 'legacy', enteredAt: new Date('2026-01-01T00:00:00Z') };
  const reviewed = item('reviewed', { reviewPriority: 'immediate_review', enteredAt: '2026-01-01T00:00:00Z' });
  assert.ok(compareICUQueueEntries(legacy, reviewed) < 0);
});

test('sorting never mutates the original queue array', () => {
  const source = [item('b', { reviewPriority: 'routine_review', enteredAt: '2026-01-01T00:00:00Z' }), item('a', { reviewPriority: 'immediate_review', enteredAt: '2026-01-02T00:00:00Z' })];
  const originalIds = source.map((entry) => entry.id);
  const sorted = sortICUQueueEntries(source);
  assert.deepEqual(source.map((entry) => entry.id), originalIds);
  assert.deepEqual(sorted.map((entry) => entry.id), ['a', 'b']);
});
