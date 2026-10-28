import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchResearchModelStatus,
  getResearchModelServiceConfig,
  validateResearchModelInfo,
} from '../src/services/researchModelStatus.js';

const validEnv = {
  NODE_ENV: 'development',
  BEDALLOCATION_ML_SERVICE_URL: 'http://127.0.0.1:8001',
  BEDALLOCATION_ML_API_KEY: 'k'.repeat(48),
};

const validInfo = {
  model_key: 'hist_gradient_boosting',
  model_version: 'research-candidate-v1',
  target_column: 'target_sepsis_onset_next_6h',
  target_definition: '1 if inferred annotated sepsis onset occurs in the next 1..6 hourly rows.',
  feature_count: 40,
  feature_names: Array.from({ length: 40 }, (_, index) => `feature_${index + 1}`),
  score_type: 'uncalibrated_model_score',
  clinical_status: 'research-only; not clinically validated; not an ICU-admission model',
  test_results_are_provisional: true,
};

test('research model service requires a sufficiently long private API key', () => {
  assert.throws(
    () => getResearchModelServiceConfig({ ...validEnv, BEDALLOCATION_ML_API_KEY: 'short' }),
    /API key is not configured/,
  );
});

test('research model service rejects invalid URLs and URL-embedded credentials', () => {
  assert.throws(
    () => getResearchModelServiceConfig({ ...validEnv, BEDALLOCATION_ML_SERVICE_URL: 'file:///etc/passwd' }),
    /URL is invalid/,
  );
  assert.throws(
    () => getResearchModelServiceConfig({ ...validEnv, BEDALLOCATION_ML_SERVICE_URL: 'http://user:pass@127.0.0.1:8001' }),
    /URL is invalid/,
  );
});

test('production rejects non-loopback plain HTTP research-service URLs', () => {
  assert.throws(
    () => getResearchModelServiceConfig({
      ...validEnv,
      NODE_ENV: 'production',
      BEDALLOCATION_ML_SERVICE_URL: 'http://10.2.3.4:8001',
    }),
    /must use HTTPS/,
  );
  assert.doesNotThrow(() => getResearchModelServiceConfig({
    ...validEnv,
    NODE_ENV: 'production',
    BEDALLOCATION_ML_SERVICE_URL: 'https://ml.internal.example',
  }));
});

test('model metadata validation accepts only the expected research target and schema', () => {
  const normalized = validateResearchModelInfo(validInfo);
  assert.equal(normalized.modelKey, 'hist_gradient_boosting');
  assert.equal(normalized.featureCount, 40);
  assert.equal(normalized.testResultsProvisional, true);
  assert.throws(() => validateResearchModelInfo({ ...validInfo, target_column: 'target_icu_admission' }), /target did not match/);
  assert.throws(() => validateResearchModelInfo({ ...validInfo, feature_count: 39 }), /feature schema/);
  assert.throws(() => validateResearchModelInfo({ ...validInfo, test_results_are_provisional: false }), /incomplete or unexpected/);
});

test('status fetch sends its API key server-side and refuses redirects', async () => {
  let capturedUrl;
  let capturedOptions;
  const result = await fetchResearchModelStatus({
    env: validEnv,
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return { ok: true, status: 200, json: async () => validInfo };
    },
  });
  assert.equal(capturedUrl, 'http://127.0.0.1:8001/v1/model-info');
  assert.equal(capturedOptions.headers['X-API-Key'], validEnv.BEDALLOCATION_ML_API_KEY);
  assert.equal(capturedOptions.redirect, 'error');
  assert.equal(capturedOptions.cache, 'no-store');
  assert.equal(result.targetColumn, 'target_sepsis_onset_next_6h');
});

test('status fetch never forwards invalid or unavailable service payloads', async () => {
  await assert.rejects(
    () => fetchResearchModelStatus({
      env: validEnv,
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ detail: 'secret response' }) }),
    }),
    /did not return available metadata/,
  );
  await assert.rejects(
    () => fetchResearchModelStatus({
      env: validEnv,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...validInfo, target_column: 'target_icu_admission' }) }),
    }),
    /target did not match/,
  );
});
