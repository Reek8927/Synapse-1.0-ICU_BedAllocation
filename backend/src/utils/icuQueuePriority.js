/**
 * Operational queue ordering only. Priority labels are assigned by authorized
 * hospital staff; they are not calculated from vital signs or ML predictions.
 */
export const QUEUE_REVIEW_PRIORITIES = Object.freeze([
  'immediate_review',
  'urgent_review',
  'routine_review'
]);

export const QUEUE_REVIEW_PRIORITY_LABELS = Object.freeze({
  immediate_review: 'Immediate review',
  urgent_review: 'Urgent review',
  routine_review: 'Routine review'
});

const PRIORITY_ORDER = new Map(QUEUE_REVIEW_PRIORITIES.map((value, index) => [value, index]));

function timestamp(value) {
  const result = value ? new Date(value).getTime() : 0;
  return Number.isFinite(result) ? result : 0;
}

function stableId(entry) {
  return String(entry.id ?? entry._id ?? '');
}

export function compareICUQueueEntries(a, b) {
  // Legacy entries without a review flag are considered to need review.
  const aNeedsReview = a.priorityReviewRequired !== false;
  const bNeedsReview = b.priorityReviewRequired !== false;
  if (aNeedsReview !== bNeedsReview) return aNeedsReview ? -1 : 1;

  // Entries needing review are displayed FIFO within that work list.
  // Reviewed entries are ordered by explicitly staff-assigned tier.
  if (!aNeedsReview) {
    const aRank = PRIORITY_ORDER.get(a.reviewPriority) ?? Number.MAX_SAFE_INTEGER;
    const bRank = PRIORITY_ORDER.get(b.reviewPriority) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
  }

  const enteredDifference = timestamp(a.enteredAt) - timestamp(b.enteredAt);
  if (enteredDifference !== 0) return enteredDifference;
  return stableId(a).localeCompare(stableId(b));
}

export function sortICUQueueEntries(entries) {
  return [...entries].sort(compareICUQueueEntries);
}
