import {
  fetchResearchModelStatus,
  ResearchModelServiceError,
} from '../services/researchModelStatus.js';
import {
  isXGBoostResearchServiceConfigured,
  runSyntheticResearchDemo,
} from '../services/researchModelPrediction.js';

export async function getResearchModelStatus(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const model = await fetchResearchModelStatus();
    return res.json({
      serviceStatus: 'available',
      ...model,
      patientScoringEnabled: false,
      xgboostComparisonConfigured: isXGBoostResearchServiceConfigured(),
      patientScoringMessage: (
        'Patient-level scoring is disabled. This playground uses only server-defined synthetic examples; ' +
        'the live hospital application does not map a validated, time-aligned set of all 40 model features, ' +
        'and this ICU-derived research target is not an ICU-admission prediction.'
      ),
      allowedUse: 'Synthetic research demonstration only; not for diagnosis, triage, queue ordering or allocation.',
    });
  } catch (error) {
    const code = error instanceof ResearchModelServiceError ? error.code : 'research_model_unavailable';
    return res.status(503).json({
      serviceStatus: 'unavailable',
      code,
      error: 'Research model status is unavailable. Check the private Python service and backend configuration.',
      patientScoringEnabled: false,
      xgboostComparisonConfigured: isXGBoostResearchServiceConfigured(),
    });
  }
}

export async function postSyntheticResearchPrediction(req, res) {
  res.set('Cache-Control', 'no-store');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Invalid synthetic demo request.' });
  }
  const allowedKeys = new Set(['profileId', 'compareModels']);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return res.status(400).json({ error: 'Only the predefined synthetic profile and comparison option are accepted.' });
  }
  if (!['complete_synthetic', 'incomplete_synthetic'].includes(body.profileId)) {
    return res.status(400).json({ error: 'Choose a predefined synthetic demo profile.' });
  }
  if (body.compareModels !== undefined && typeof body.compareModels !== 'boolean') {
    return res.status(400).json({ error: 'compareModels must be true or false.' });
  }

  try {
    const result = await runSyntheticResearchDemo({
      profileId: body.profileId,
      compareModels: body.compareModels === true,
    });
    return res.json(result);
  } catch (error) {
    const code = error instanceof ResearchModelServiceError ? error.code : 'research_model_unavailable';
    return res.status(503).json({
      error: 'The synthetic research demonstration is currently unavailable.',
      code,
      syntheticOnly: true,
      persisted: false,
      changesPatientRecord: false,
      changesQueueOrBedStatus: false,
    });
  }
}
