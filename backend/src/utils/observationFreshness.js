/**
 * Decide whether an observation is recent enough to supersede an ICU waiting
 * reminder. Future-dated observations (even those within the API's tolerated
 * clock-skew window) must not clear a reminder, because they do not prove that
 * a measurement has already been taken.
 */
export function isObservationFreshForReminder(observedAt, recordedAt, intervalMs) {
  const observedMs = observedAt instanceof Date ? observedAt.getTime() : new Date(observedAt).getTime();
  const recordedMs = recordedAt instanceof Date ? recordedAt.getTime() : new Date(recordedAt).getTime();

  if (!Number.isFinite(observedMs) || !Number.isFinite(recordedMs)) return false;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return false;

  const ageMs = recordedMs - observedMs;
  return ageMs >= 0 && ageMs < intervalMs;
}
