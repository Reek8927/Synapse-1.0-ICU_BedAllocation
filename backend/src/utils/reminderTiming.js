export function isObservationReminderDue(entry, now = new Date(), intervalMs = 8 * 60 * 1000) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const lastObservationAt = entry?.lastObservationAtForReminder
    ? new Date(entry.lastObservationAtForReminder).getTime()
    : entry?.enteredAt
      ? new Date(entry.enteredAt).getTime()
      : entry?.createdAt
        ? new Date(entry.createdAt).getTime()
        : Number.NaN;
  const lastReminderAt = entry?.lastReminderAt == null
    ? null
    : new Date(entry.lastReminderAt).getTime();

  if (!Number.isFinite(nowMs) || !Number.isFinite(lastObservationAt)) return false;
  if (!Number.isFinite(intervalMs) || intervalMs < 1) return false;
  if (nowMs - lastObservationAt < intervalMs) return false;
  if (lastReminderAt !== null && (!Number.isFinite(lastReminderAt) || nowMs - lastReminderAt < intervalMs)) return false;
  return true;
}

export function normalizeReminderIntervalMinutes(value, fallback = 8) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1440) return fallback;
  return parsed;
}

export function normalizeReminderPollMs(value, fallback = 15_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 15_000 || parsed > 3_600_000) return fallback;
  return Math.floor(parsed);
}
