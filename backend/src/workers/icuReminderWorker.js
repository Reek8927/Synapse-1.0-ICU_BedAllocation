import '../config/env.js';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { validateRuntimeEnv } from '../config/env.js';
import { processDueICUObservationReminders } from '../services/icuReminderService.js';
import { normalizeReminderPollMs } from '../utils/reminderTiming.js';

const pollMs = normalizeReminderPollMs(process.env.ICU_REMINDER_POLL_INTERVAL_MS, 15_000);
const once = process.argv.includes('--once');
let running = false;
let stopping = false;
let timer = null;

async function runSweep() {
  if (running || stopping) return;
  running = true;
  try {
    const result = await processDueICUObservationReminders();
    console.log(`[icu-reminder-worker] sweep completed: scanned=${result.scanned}, created=${result.created}, repeated=${result.repeated}, skipped=${result.skipped}, errors=${result.errors}`);
  } catch (error) {
    console.error(`[icu-reminder-worker] sweep failed (${error?.name || 'Error'}).`);
  } finally {
    running = false;
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  console.log(`[icu-reminder-worker] ${signal}; shutting down.`);
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

try {
  validateRuntimeEnv();
  await connectDatabase();
  await runSweep();
  if (once) {
    await mongoose.disconnect();
  } else {
    timer = setInterval(runSweep, pollMs);
    console.log(`[icu-reminder-worker] running; poll=${pollMs}ms, reminder interval=${process.env.ICU_REMINDER_INTERVAL_MINUTES || 8} minutes.`);
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
} catch (error) {
  console.error(`[icu-reminder-worker] startup failed (${error?.name || 'Error'}): ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}
