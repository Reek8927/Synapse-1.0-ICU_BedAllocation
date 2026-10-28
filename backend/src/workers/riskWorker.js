import '../config/env.js';
import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import { connectDatabase } from '../config/db.js';
import { validateRuntimeEnv } from '../config/env.js';
import { rankWaitingQueue } from '../services/riskScoring.js';

// Re-scores every waiting patient on the 8-minute monitoring cycle (override with RISK_RESCORE_INTERVAL_MINUTES).
const minutes = Number(process.env.RISK_RESCORE_INTERVAL_MINUTES) || 8;
const once = process.argv.includes('--once');
let running = false;

async function sweep() {
  if (running) return;
  running = true;
  try {
    const tenants = await Tenant.find({ status: 'active' }).select('_id').lean();
    for (const tenant of tenants) {
      const queue = await rankWaitingQueue({ tenantId: tenant._id, rescore: true });
      console.log(`[risk-worker] tenant=${tenant._id} queue=${queue.length} top=${queue[0]?.patient?.patientCode ?? '-'} (${queue[0]?.priorityScore ?? '-'})`);
    }
  } catch (error) { console.error(`[risk-worker] sweep failed (${error?.name || 'Error'}): ${error.message}`); }
  finally { running = false; }
}

validateRuntimeEnv();
await connectDatabase();
await sweep();
if (once) { await mongoose.disconnect(); }
else {
  setInterval(sweep, minutes * 60 * 1000);
  console.log(`[risk-worker] running every ${minutes} minute(s)`);
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { await mongoose.disconnect().catch(() => {}); process.exit(0); });
}
