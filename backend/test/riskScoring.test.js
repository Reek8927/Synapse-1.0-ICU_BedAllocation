import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelFeatures, classifyRisk, computeNews2, computePriorityScore, getRiskConfig, rankByPriority } from '../src/services/riskScoring.js';

const cfg = getRiskConfig({});

test('NEWS2 is low for normal vitals and high for deteriorating vitals', () => {
  const normal = computeNews2({ respiratoryRateBpm: 16, oxygenSaturationPercent: 98, systolicBpMmhg: 120, heartRateBpm: 78, temperatureC: 36.8, gcsTotal: 15 });
  assert.equal(normal.score, 0);
  const sick = computeNews2({ respiratoryRateBpm: 28, oxygenSaturationPercent: 89, systolicBpMmhg: 88, heartRateBpm: 128, temperatureC: 39.2, gcsTotal: 14 });
  assert.ok(sick.score >= 7);
  assert.equal(computeNews2({}).score, null);
});

test('feature builder converts units and derives MAP/Age/Gender', () => {
  const f = buildModelFeatures({
    now: new Date('2026-10-30T00:00:00Z'),
    patient: { dateOfBirth: new Date('1976-10-30T00:00:00Z'), sexAtBirth: 'male' },
    observation: { heartRateBpm: 100, systolicBpMmhg: 120, diastolicBpMmhg: 60, oxygenSaturationPercent: 95 },
    assessment: { lactate: 2, glucose: 110, creatinine: 1, wbc: 9, platelets: 200 },
  });
  assert.equal(f.MAP, 80);
  assert.equal(f.Age, 50);
  assert.equal(f.Gender, 1);
  assert.equal(f.Lactate, 18); // 2 mmol/L -> mg/dL
  assert.equal(f.HR, 100);
});

test('classification and priority ordering', () => {
  assert.equal(classifyRisk({ modelScore: 0.2, news2: 1 }, cfg).icuRecommendation, 'icu_not_indicated');
  assert.equal(classifyRisk({ modelScore: 0.6, news2: 2 }, cfg).icuRecommendation, 'icu_review');
  assert.equal(classifyRisk({ modelScore: 0.3, news2: 8 }, cfg).icuRecommendation, 'icu_recommended');
  assert.equal(classifyRisk({ modelScore: 0.85, news2: 0 }, cfg).riskLevel, 'high');
  const rows = [
    { patientId: 'a', priorityScore: computePriorityScore({ modelScore: 0.3, news2: 2 }, cfg), enteredAt: '2026-10-30T08:00:00Z' },
    { patientId: 'b', priorityScore: computePriorityScore({ modelScore: 0.84, news2: 9 }, cfg), enteredAt: '2026-10-30T09:00:00Z' },
    { patientId: 'c', priorityScore: computePriorityScore({ modelScore: 0.5, news2: 5 }, cfg), enteredAt: '2026-10-30T07:00:00Z' },
  ];
  assert.deepEqual(rankByPriority(rows).map((r) => r.patientId), ['b', 'c', 'a']);
});

test('waiting-time bonus is capped and breaks ties by longest wait', () => {
  const long = computePriorityScore({ modelScore: 0.5, news2: 5, waitedMinutes: 100000 }, cfg);
  const none = computePriorityScore({ modelScore: 0.5, news2: 5, waitedMinutes: 0 }, cfg);
  assert.ok(long - none <= cfg.agingCap + 1e-9);
  const tie = rankByPriority([
    { patientId: 'x', priorityScore: 0.5, enteredAt: '2026-10-30T10:00:00Z' },
    { patientId: 'y', priorityScore: 0.5, enteredAt: '2026-10-30T09:00:00Z' },
  ]);
  assert.equal(tie[0].patientId, 'y');
});
