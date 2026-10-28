import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchSyntheticResearchPrediction,
  getSyntheticResearchProfile,
  isXGBoostResearchServiceConfigured,
  runSyntheticResearchDemo,
} from '../src/services/researchModelPrediction.js';
import { postSyntheticResearchPrediction } from '../src/controllers/researchModelController.js';

const featureNames = [
  'HR', 'O2Sat', 'Temp', 'SBP', 'MAP', 'DBP', 'Resp', 'EtCO2', 'BaseExcess', 'HCO3',
  'FiO2', 'pH', 'PaCO2', 'SaO2', 'AST', 'BUN', 'Alkalinephos', 'Calcium', 'Chloride',
  'Creatinine', 'Bilirubin_direct', 'Glucose', 'Lactate', 'Magnesium', 'Phosphate',
  'Potassium', 'Bilirubin_total', 'TroponinI', 'Hct', 'Hgb', 'PTT', 'WBC', 'Fibrinogen',
  'Platelets', 'Age', 'Gender', 'Unit1', 'Unit2', 'HospAdmTime', 'ICULOS',
];
const key = 'k'.repeat(48);
const env = {
  NODE_ENV: 'development',
  BEDALLOCATION_ML_SERVICE_URL: 'http://127.0.0.1:8001',
  BEDALLOCATION_ML_API_KEY: key,
  BEDALLOCATION_XGBOOST_SERVICE_URL: 'http://127.0.0.1:8002',
  BEDALLOCATION_XGBOOST_API_KEY: key,
};

function fakeFetchFactory() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    const isXgboost = parsed.port === '8002';
    const modelKey = isXgboost ? 'xgboost_hist_weighted' : 'hist_gradient_boosting';
    if (parsed.pathname === '/v1/model-info') {
      return {
        ok: true,
        json: async () => ({
          model_key: modelKey,
          model_version: isXgboost ? 'xgb-test' : 'hgb-test',
          target_column: 'target_sepsis_onset_next_6h',
          target_definition: 'Inferred annotated sepsis onset occurs in the next 1..6 hourly rows.',
          feature_count: 40,
          feature_names: featureNames,
          score_type: 'uncalibrated_model_score',
          clinical_status: 'research-only; not clinically validated; not an ICU-admission model',
          test_results_are_provisional: true,
        }),
      };
    }
    assert.equal(parsed.pathname, '/v1/predict');
    const body = JSON.parse(options.body);
    const supplied = Object.values(body.features).filter((value) => value !== null).length;
    const available = supplied >= 20;
    return {
      ok: true,
      json: async () => ({
        model_key: modelKey,
        model_version: isXgboost ? 'xgb-test' : 'hgb-test',
        target_column: 'target_sepsis_onset_next_6h',
        target_definition: 'Inferred annotated sepsis onset occurs in the next 1..6 hourly rows.',
        score: available ? (isXgboost ? 0.37 : 0.42) : null,
        score_status: available ? 'available' : 'withheld',
        withheld_reason: available ? null : 'Score withheld because too few non-missing model features were supplied.',
        feature_completeness_fraction: supplied / 40,
        score_type: 'uncalibrated_model_score',
        expected_feature_count: 40,
        supplied_non_missing_feature_count: supplied,
        missing_feature_count: 40 - supplied,
        missing_features: featureNames.filter((name) => !(name in body.features)),
        low_feature_completeness: !available,
        persisted: false,
        changes_patient_record: false,
        changes_queue_or_bed_status: false,
        clinical_limitations: ['Research only.'],
      }),
    };
  };
  return { fetchImpl, calls };
}

test('complete synthetic profile contains exactly the expected 40 numeric features', () => {
  const profile = getSyntheticResearchProfile('complete_synthetic');
  assert.equal(Object.keys(profile.features).length, 40);
  assert.deepEqual(Object.keys(profile.features).sort(), [...featureNames].sort());
  assert.ok(Object.values(profile.features).every((value) => Number.isFinite(value)));
});

test('incomplete profile contains only seven server-defined values for withholding demonstration', () => {
  const profile = getSyntheticResearchProfile('incomplete_synthetic');
  assert.equal(Object.keys(profile.features).length, 7);
  assert.equal(profile.features.HR, 90);
});

test('unknown synthetic profile is rejected', () => {
  assert.throws(() => getSyntheticResearchProfile('patient-123'), /approved synthetic demo profiles/);
});

test('XGBoost service is optional and requires configured URL and a long key', () => {
  assert.equal(isXGBoostResearchServiceConfigured({ ...env, BEDALLOCATION_XGBOOST_SERVICE_URL: '' }), false);
  assert.equal(isXGBoostResearchServiceConfigured({ ...env, BEDALLOCATION_XGBOOST_API_KEY: 'short' }), false);
  assert.equal(isXGBoostResearchServiceConfigured(env), true);
});

test('synthetic prediction calls metadata and predict only for the requested model, using a server-generated feature map', async () => {
  const { fetchImpl, calls } = fakeFetchFactory();
  const result = await fetchSyntheticResearchPrediction({
    modelKey: 'hist_gradient_boosting',
    profileId: 'complete_synthetic',
    env,
    fetchImpl,
  });
  assert.equal(result.scoreStatus, 'available');
  assert.equal(result.suppliedNonMissingFeatureCount, 40);
  assert.equal(result.syntheticInput, true);
  assert.equal(result.persisted, false);
  assert.equal(result.changesPatientRecord, false);
  assert.equal(result.changesQueueOrBedStatus, false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.options.headers['X-API-Key'] === key));
  const predictCall = calls.find((call) => call.url.endsWith('/v1/predict'));
  assert.equal(Object.keys(JSON.parse(predictCall.options.body).features).length, 40);
});

test('incomplete synthetic profile passes through so inference can withhold its score', async () => {
  const { fetchImpl } = fakeFetchFactory();
  const result = await fetchSyntheticResearchPrediction({
    modelKey: 'hist_gradient_boosting',
    profileId: 'incomplete_synthetic',
    env,
    fetchImpl,
  });
  assert.equal(result.scoreStatus, 'withheld');
  assert.equal(result.score, null);
  assert.equal(result.suppliedNonMissingFeatureCount, 7);
  assert.equal(result.expectedFeatureCount, 40);
});

test('side-by-side demo returns results for both configured research models and marks synthetic-only output', async () => {
  const { fetchImpl } = fakeFetchFactory();
  const result = await runSyntheticResearchDemo({
    profileId: 'complete_synthetic',
    compareModels: true,
    env,
    fetchImpl,
  });
  assert.equal(result.syntheticOnly, true);
  assert.equal(result.persisted, false);
  assert.equal(result.changesPatientRecord, false);
  assert.equal(result.changesQueueOrBedStatus, false);
  assert.deepEqual(result.results.map((item) => item.modelKey), [
    'hist_gradient_boosting', 'xgboost_hist_weighted',
  ]);
  assert.ok(result.results.every((item) => item.status === 'available'));
});

test('XGBoost comparison may be unavailable without preventing primary model response', async () => {
  const incompleteEnv = { ...env, BEDALLOCATION_XGBOOST_SERVICE_URL: '' };
  const { fetchImpl } = fakeFetchFactory();
  const result = await runSyntheticResearchDemo({
    profileId: 'complete_synthetic',
    compareModels: true,
    env: incompleteEnv,
    fetchImpl,
  });
  assert.equal(result.results[0].status, 'available');
  assert.equal(result.results[1].status, 'unavailable');
  assert.equal(result.results[1].persisted, false);
});

test('invalid model target is rejected before synthetic prediction', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({
    model_key: 'hist_gradient_boosting',
    model_version: 'bad',
    target_column: 'target_icu_admission',
    target_definition: 'wrong target',
    feature_count: 40,
    feature_names: featureNames,
    score_type: 'uncalibrated_model_score',
    clinical_status: 'research-only; not clinically validated; not an ICU-admission model',
    test_results_are_provisional: true,
  }) });
  await assert.rejects(
    () => fetchSyntheticResearchPrediction({
      modelKey: 'hist_gradient_boosting', profileId: 'complete_synthetic', env, fetchImpl,
    }),
    /target did not match/,
  );
});


function makeResponseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    set() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test('demo controller rejects arbitrary feature maps so client cannot submit patient values', async () => {
  const req = { body: { profileId: 'complete_synthetic', features: { HR: 90 } } };
  const res = makeResponseRecorder();
  await postSyntheticResearchPrediction(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /predefined synthetic profile/);
});

test('demo controller rejects unsupported profile values and invalid compare option', async () => {
  const profileResponse = makeResponseRecorder();
  await postSyntheticResearchPrediction({ body: { profileId: 'patient-id-123' } }, profileResponse);
  assert.equal(profileResponse.statusCode, 400);

  const comparisonResponse = makeResponseRecorder();
  await postSyntheticResearchPrediction({ body: { profileId: 'complete_synthetic', compareModels: 'true' } }, comparisonResponse);
  assert.equal(comparisonResponse.statusCode, 400);
});
