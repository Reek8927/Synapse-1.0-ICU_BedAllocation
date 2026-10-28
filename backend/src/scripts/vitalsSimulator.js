// Fake bedside-monitor feed for demos. Usage:
//   node src/scripts/vitalsSimulator.js --tenant <tenantId> --patients P-001,P-002,P-003 --interval 480
//   (use --interval 10 to compress the 8-minute cycle to 10 seconds on stage; --worsen P-002 makes that patient deteriorate)
import '../config/env.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : fallback; };
const api = arg('api', `http://localhost:${process.env.PORT || 5000}`);
const tenantId = arg('tenant');
const patients = String(arg('patients', '')).split(',').map((s) => s.trim()).filter(Boolean);
const worsen = new Set(String(arg('worsen', '')).split(',').map((s) => s.trim()).filter(Boolean));
const intervalSec = Number(arg('interval', 480));
const key = process.env.MONITOR_API_KEY;
if (!tenantId || !patients.length || !key) { console.error('Need --tenant, --patients and MONITOR_API_KEY in .env'); process.exit(1); }

const state = new Map(patients.map((code) => [code, { hr: 80 + Math.random() * 10, sbp: 120, dbp: 75, rr: 16, spo2: 97, temp: 36.8, gcs: 15, tick: 0 }]));
const jitter = (v, s) => v + (Math.random() - 0.5) * s;

async function tick() {
  for (const code of patients) {
    const s = state.get(code); s.tick += 1;
    if (worsen.has(code)) { s.hr += 4; s.sbp -= 4; s.dbp -= 2; s.rr += 1; s.spo2 -= 0.8; s.temp += 0.15; if (s.tick > 4) s.gcs = 14; }
    const body = {
      tenantId, patientCode: code, observedAt: new Date().toISOString(),
      heartRateBpm: Math.round(jitter(s.hr, 4)), systolicBpMmhg: Math.round(jitter(s.sbp, 4)), diastolicBpMmhg: Math.round(jitter(s.dbp, 3)),
      respiratoryRateBpm: Math.round(jitter(s.rr, 2)), oxygenSaturationPercent: Math.min(100, Math.round(jitter(s.spo2, 1))),
      temperatureC: Math.round(jitter(s.temp, 0.2) * 10) / 10, gcsTotal: s.gcs,
    };
    try {
      const res = await fetch(`${api}/api/monitoring/vitals`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Monitor-Key': key }, body: JSON.stringify(body) });
      const json = await res.json();
      console.log(`${code} -> ${res.status}`, json.risk ? `${json.risk.riskLevel} priority=${json.risk.priorityScore} ews=${json.risk.news2} ml=${json.risk.modelScore?.toFixed?.(2) ?? 'n/a'}` : json.error || '');
    } catch (e) { console.error(`${code} failed: ${e.message}`); }
  }
}
console.log(`Simulating ${patients.length} monitor(s) every ${intervalSec}s`);
await tick();
setInterval(tick, intervalSec * 1000);
