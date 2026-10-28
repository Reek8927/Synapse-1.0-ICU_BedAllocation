'use client';

import { useCallback, useEffect, useState } from 'react';

function displayModelName(value) {
  if (value === 'hist_gradient_boosting') return 'Histogram Gradient Boosting';
  if (value === 'xgboost_hist_weighted') return 'XGBoost (weighted)';
  return value || 'Not reported';
}

function formatScore(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : 'Not available';
}

export default function ResearchModelPanel({ csrfToken }) {
  const [status, setStatus] = useState('loading');
  const [model, setModel] = useState(null);
  const [error, setError] = useState('');
  const [profileId, setProfileId] = useState('complete_synthetic');
  const [compareModels, setCompareModels] = useState(false);
  const [demoStatus, setDemoStatus] = useState('idle');
  const [demo, setDemo] = useState(null);
  const [demoError, setDemoError] = useState('');

  const loadStatus = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const response = await fetch('/api/research-model/status', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.serviceStatus !== 'available') {
        throw new Error(payload.error || 'Research model service is unavailable.');
      }
      setModel(payload);
      setStatus('available');
    } catch (requestError) {
      setModel(null);
      setError(requestError?.message || 'Research model status could not be loaded.');
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function runSyntheticDemo(event) {
    event.preventDefault();
    setDemoStatus('loading');
    setDemoError('');
    setDemo(null);
    try {
      const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      const response = await fetch('/api/research-model/demo-predict', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        body: JSON.stringify({ profileId, compareModels }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Synthetic demonstration could not run.');
      setDemo(payload);
      setDemoStatus('complete');
    } catch (requestError) {
      setDemoError(requestError?.message || 'Synthetic demonstration could not run.');
      setDemoStatus('error');
    }
  }

  return (
    <section className="research-model-panel" aria-labelledby="research-model-heading">
      <div className="research-model-heading-row">
        <div>
          <p className="eyebrow">RESEARCH COMPONENT</p>
          <h3 id="research-model-heading">ML model status</h3>
          <p>Read-only information for the experimental six-hour inferred sepsis-onset model.</p>
        </div>
        <button className="button button-outline button-small" type="button" onClick={loadStatus} disabled={status === 'loading'}>
          {status === 'loading' ? 'Checking…' : 'Refresh status'}
        </button>
      </div>

      {status === 'loading' && <p className="research-model-state" role="status">Checking the private Python research service…</p>}
      {status === 'unavailable' && <div className="research-model-state research-model-state-warning" role="status">
        <strong>Service unavailable</strong>
        <p>{error}</p>
        <p>Check that the local Python service is running and that the backend has its private API key configured.</p>
      </div>}
      {status === 'available' && model && <>
        <div className="research-model-metadata">
          <div><span>Connection</span><strong>Available</strong></div>
          <div><span>Primary model</span><strong>{displayModelName(model.modelKey)}</strong></div>
          <div><span>Version</span><strong>{model.modelVersion}</strong></div>
          <div><span>Expected features</span><strong>{model.featureCount}</strong></div>
        </div>
        <p className="research-model-target"><strong>Prediction target:</strong> {model.targetDefinition}</p>
        <div className="research-model-state research-model-state-warning">
          <strong>Research-only boundary</strong>
          <p>{model.patientScoringMessage}</p>
          <p>The playground below uses only fixed synthetic examples created by the backend. It never reads or submits a patient record.</p>
          <p>Outputs do not change patient records, queue order, review tier, bed status, reminders or allocation.</p>
        </div>

        <section className="research-playground" aria-labelledby="research-playground-heading">
          <div className="research-playground-heading">
            <p className="eyebrow">SYNTHETIC DEMONSTRATION</p>
            <h4 id="research-playground-heading">Research Prediction Playground</h4>
            <p>Explore the model service with a predefined fictional feature profile. This demonstrates software behavior only, not a real clinical prediction.</p>
          </div>
          <form className="research-playground-form" onSubmit={runSyntheticDemo}>
            <div className="field-group">
              <label htmlFor="research-demo-profile">Synthetic input profile</label>
              <select id="research-demo-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={demoStatus === 'loading'}>
                <option value="complete_synthetic">Complete example · 40 of 40 features</option>
                <option value="incomplete_synthetic">Incomplete example · 7 of 40 features</option>
              </select>
              <p className="field-help">The server generates all example values. No patient name, ID, observation or report is accepted by this endpoint.</p>
            </div>
            <label className={`research-compare-option${!model.xgboostComparisonConfigured ? ' research-compare-option-disabled' : ''}`} htmlFor="research-compare-models">
              <input
                id="research-compare-models"
                type="checkbox"
                checked={compareModels}
                onChange={(event) => setCompareModels(event.target.checked)}
                disabled={!model.xgboostComparisonConfigured || demoStatus === 'loading'}
              />
              <span>
                <strong>Compare with XGBoost</strong>
                <small>{model.xgboostComparisonConfigured
                  ? 'Runs the same synthetic profile against both research services.'
                  : 'Optional XGBoost service is not configured; primary model only.'}</small>
              </span>
            </label>
            <div className="research-playground-actions">
              <button className="button button-dark" type="submit" disabled={demoStatus === 'loading' || !csrfToken || status !== 'available'}>
                {demoStatus === 'loading' ? 'Running synthetic demo…' : 'Run synthetic demo'}
              </button>
              <span>Read-only · not saved · no clinical decisions</span>
            </div>
          </form>

          {demoStatus === 'error' && <div className="research-model-state research-model-state-warning" role="alert">
            <strong>Demo unavailable</strong><p>{demoError}</p>
          </div>}
          {demoStatus === 'complete' && demo && <div className="research-demo-results" aria-live="polite">
            <div className="research-demo-result-heading">
              <h5>Demo output</h5>
              <p>{demo.profileLabel}</p>
            </div>
            <div className="research-demo-result-grid">
              {(demo.results || []).map((result) => <article className="research-demo-result" key={result.modelKey}>
                <div className="research-demo-result-title">
                  <h6>{displayModelName(result.modelKey)}</h6>
                  <span className={result.status === 'available' ? 'research-result-status' : 'research-result-status research-result-status-muted'}>
                    {result.status === 'available' ? (result.scoreStatus === 'withheld' ? 'Score withheld' : 'Completed') : 'Unavailable'}
                  </span>
                </div>
                {result.status === 'available' ? <>
                  <div className="research-demo-score-row">
                    <span>Uncalibrated model score</span>
                    <strong>{result.scoreStatus === 'available' ? formatScore(result.score) : 'Withheld'}</strong>
                  </div>
                  <p className="research-demo-completeness">Features supplied: {result.suppliedNonMissingFeatureCount} / {result.expectedFeatureCount} · Completeness: {(result.featureCompletenessFraction * 100).toFixed(1)}%</p>
                  {result.withheldReason && <p className="research-demo-withheld">{result.withheldReason}</p>}
                  {result.missingFeatureCount > 0 && <details>
                    <summary>Missing features ({result.missingFeatureCount})</summary>
                    <p>{result.missingFeatures.join(', ')}</p>
                  </details>}
                </> : <p className="research-demo-withheld">{result.error}</p>}
              </article>)}
            </div>
            <div className="research-model-state research-model-state-warning">
              <strong>How to interpret this output</strong>
              <p>{demo.comparisonNote}</p>
              <p>No result is a clinical probability, sepsis diagnosis, ICU-need prediction or priority recommendation. Scores from different models are not guaranteed to be directly comparable.</p>
            </div>
            <p className="research-model-disclaimer">Synthetic-only run · Persisted: no · Patient record changed: no · Queue or bed status changed: no.</p>
          </div>}
        </section>
        <p className="research-model-disclaimer">Research only · Uncalibrated model score · Not clinically validated · Test results are provisional.</p>
      </>}
    </section>
  );
}
