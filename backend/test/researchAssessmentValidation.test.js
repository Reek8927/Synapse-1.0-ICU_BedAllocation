
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeResearchAssessmentInput
} from '../src/utils/patientValidation.js';

const validAssessment = {
  glucose: '110',
  lactate: '1.8',
  creatinine: '0.9',
  wbc: '8.5',
  platelets: '250'
};

test('research assessment accepts and normalizes all required results', () => {
  const result = normalizeResearchAssessmentInput(validAssessment);

  assert.equal(result.glucose, 110);
  assert.equal(result.lactate, 1.8);
  assert.equal(result.creatinine, 0.9);
  assert.equal(result.wbc, 8.5);
  assert.equal(result.platelets, 250);
  assert.ok(result.assessedAt instanceof Date);

  assert.deepEqual(result.fieldNames, [
    'glucose',
    'lactate',
    'creatinine',
    'wbc',
    'platelets'
  ]);
});

test('research assessment rejects every missing required result', () => {
  for (const field of Object.keys(validAssessment)) {
    const input = { ...validAssessment };
    delete input[field];

    assert.throws(
      () => normalizeResearchAssessmentInput(input),
      /is required to complete the assessment/
    );
  }
});

test('research assessment rejects invalid and out-of-range results', () => {
  for (const [field, value] of [
    ['glucose', 'abc'],
    ['lactate', '-1'],
    ['creatinine', '101'],
    ['wbc', '1001'],
    ['platelets', '10001']
  ]) {
    assert.throws(
      () => normalizeResearchAssessmentInput({
        ...validAssessment,
        [field]: value
      }),
      /must be a number between/
    );
  }
});

test('research assessment rejects unsupported client-supplied fields', () => {
  assert.throws(
    () => normalizeResearchAssessmentInput({
      ...validAssessment,
      tenantId: 'another-hospital'
    }),
    /Unsupported assessment field/
  );
});

test('research assessment rejects an assessment dated before admission', () => {
  assert.throws(
    () => normalizeResearchAssessmentInput(
      {
        ...validAssessment,
        assessedAt: '2026-10-01T10:00:00.000Z'
      },
      new Date('2026-10-02T10:00:00.000Z')
    ),
    /before this admission/
  );
});


test('research assessment rejects invalid, non-date, and excessively future timestamps', () => {
  for (const assessedAt of [
    'not-a-date',
    '2026-13-40T25:61:00.000Z',
    new Date(Date.now() + 10 * 60 * 1000).toISOString()
  ]) {
    assert.throws(
      () => normalizeResearchAssessmentInput({
        ...validAssessment,
        assessedAt
      }),
      /invalid|future/i
    );
  }
});

test('research assessment accepts numeric lower and upper bounds', () => {
  const result = normalizeResearchAssessmentInput({
    glucose: '0',
    lactate: '50',
    creatinine: '100',
    wbc: '1000',
    platelets: '10000'
  });

  assert.equal(result.glucose, 0);
  assert.equal(result.lactate, 50);
  assert.equal(result.creatinine, 100);
  assert.equal(result.wbc, 1000);
  assert.equal(result.platelets, 10000);
});

test('research assessment rejects non-finite numeric values', () => {
  for (const glucose of ['Infinity', '-Infinity', 'NaN']) {
    assert.throws(
      () => normalizeResearchAssessmentInput({
        ...validAssessment,
        glucose
      }),
      /must be a number between/
    );
  }
});


test('research assessment accepts optional extra results and an ICU type, and rejects bad ones', async () => {
  const { normalizeResearchAssessmentInput } = await import('../src/utils/patientValidation.js');
  const base = { glucose: 100, lactate: 1.2, creatinine: 0.9, wbc: 8, platelets: 250 };
  const ok = normalizeResearchAssessmentInput({ ...base, hct: '31.5', ph: 7.4, bilirubinTotal: 0.9, icuUnitType: 'medical' });
  assert.equal(ok.hct, 31.5);
  assert.equal(ok.ph, 7.4);
  assert.equal(ok.icuUnitType, 'medical');
  assert.ok(ok.fieldNames.includes('hct') && ok.fieldNames.includes('icuUnitType'));
  const blank = normalizeResearchAssessmentInput({ ...base, hct: '', ph: null });
  assert.equal(blank.hct, undefined);
  assert.throws(() => normalizeResearchAssessmentInput({ ...base, ph: 9 }), /Blood pH/);
  assert.throws(() => normalizeResearchAssessmentInput({ ...base, icuUnitType: 'burn' }), /ICU type/);
  assert.throws(() => normalizeResearchAssessmentInput({ ...base, notAField: 1 }), /Unsupported assessment field/);
});
