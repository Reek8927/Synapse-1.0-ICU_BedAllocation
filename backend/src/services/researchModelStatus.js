const EXPECTED_TARGET = 'target_sepsis_onset_next_6h';

export class ResearchModelServiceError extends Error {
  constructor(message, code = 'research_model_unavailable') {
    super(message);
    this.name = 'ResearchModelServiceError';
    this.code = code;
  }
}

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function getResearchModelServiceConfig(env = process.env) {
  const apiKey = String(env.BEDALLOCATION_ML_API_KEY || '').trim();
  if (apiKey.length < 32) {
    throw new ResearchModelServiceError(
      'Research model API key is not configured.',
      'research_model_not_configured',
    );
  }

  let parsed;
  try {
    parsed = new URL(env.BEDALLOCATION_ML_SERVICE_URL || 'http://127.0.0.1:8001');
  } catch {
    throw new ResearchModelServiceError('Research model service URL is invalid.', 'research_model_invalid_config');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username || parsed.password || parsed.search || parsed.hash
      || (parsed.pathname && parsed.pathname !== '/')) {
    throw new ResearchModelServiceError('Research model service URL is invalid.', 'research_model_invalid_config');
  }

  const isProduction = ['production', 'prod'].includes(String(env.NODE_ENV || '').toLowerCase());
  if (isProduction && parsed.protocol !== 'https:' && !isLoopbackHost(parsed.hostname)) {
    throw new ResearchModelServiceError(
      'Production research model connections must use HTTPS unless the service is local loopback.',
      'research_model_insecure_transport',
    );
  }

  return {
    baseUrl: `${parsed.protocol}//${parsed.host}`,
    apiKey,
  };
}

export function validateResearchModelInfo(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    throw new ResearchModelServiceError('Research model returned invalid metadata.');
  }
  if (info.target_column !== EXPECTED_TARGET) {
    throw new ResearchModelServiceError('Research model target did not match the approved research target.');
  }
  if (!Number.isInteger(info.feature_count) || info.feature_count !== 40) {
    throw new ResearchModelServiceError('Research model feature schema did not match the expected version.');
  }
  if (!Array.isArray(info.feature_names) || info.feature_names.length !== info.feature_count
      || !info.feature_names.every((name) => typeof name === 'string' && name.length > 0)) {
    throw new ResearchModelServiceError('Research model feature names are invalid.');
  }
  if (typeof info.model_key !== 'string' || !info.model_key.trim()
      || typeof info.model_version !== 'string' || !info.model_version.trim()
      || typeof info.target_definition !== 'string'
      || !info.target_definition.toLowerCase().includes('inferred annotated sepsis onset')
      || info.score_type !== 'uncalibrated_model_score'
      || typeof info.clinical_status !== 'string'
      || !info.clinical_status.toLowerCase().includes('research-only')
      || info.test_results_are_provisional !== true) {
    throw new ResearchModelServiceError('Research model metadata is incomplete or unexpected.');
  }
  return {
    modelKey: info.model_key,
    modelVersion: info.model_version,
    targetColumn: info.target_column,
    targetDefinition: info.target_definition,
    featureCount: info.feature_count,
    scoreType: info.score_type,
    clinicalStatus: info.clinical_status,
    testResultsProvisional: true,
  };
}

export async function fetchResearchModelStatus({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 3000,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new ResearchModelServiceError('Server fetch API is unavailable.');
  }
  const config = getResearchModelServiceConfig(env);
  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}/v1/model-info`, {
      method: 'GET',
      headers: { 'X-API-Key': config.apiKey, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ResearchModelServiceError('Research model service could not be reached.');
  }
  if (!response.ok) {
    throw new ResearchModelServiceError('Research model service did not return available metadata.');
  }
  let info;
  try {
    info = await response.json();
  } catch {
    throw new ResearchModelServiceError('Research model service returned invalid metadata.');
  }
  return validateResearchModelInfo(info);
}
