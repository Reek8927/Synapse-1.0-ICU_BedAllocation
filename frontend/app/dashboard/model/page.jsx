'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../_lib/workspace';
import { Loading, PageHeader, PrototypeNote, RoleGate } from '../_components/ui';

const MODEL_NAMES = { hist_gradient_boosting: 'Histogram gradient boosting', xgboost_hist_weighted: 'XGBoost (weighted)' };

export default function ModelPage() {
  const { api, can } = useWorkspace();
  const [state, setState] = useState({ status: 'loading', model: null, error: '' });

  const check = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      const model = await api('/api/research-model/status');
      if (model.serviceStatus !== 'available') throw new Error(model.error || 'The risk model service is not available.');
      setState({ status: 'available', model, error: '' });
    } catch (reason) {
      setState({ status: 'unavailable', model: null, error: reason.message });
    }
  }, [api]);

  useEffect(() => { if (can.viewModel) check(); }, [can.viewModel, check]);

  const { status, model, error } = state;

  return (
    <RoleGate allowed={can.viewModel}>
      <PageHeader title="Risk model" description="How the queue priority is calculated, and the state of the model service behind it.">
        <button className="cq-btn cq-btn--ghost" type="button" onClick={check} disabled={status === 'loading'}>Check again</button>
      </PageHeader>

      <section className="cq-panel" aria-labelledby="service-heading">
        <h2 id="service-heading">Model service</h2>
        {status === 'loading' ? <Loading>Checking the model service…</Loading> : null}
        {status === 'unavailable' ? (
          <p className="cq-notice cq-notice--error" role="alert" style={{ marginTop: 12 }}>
            {error} Queue ranking continues from the early-warning score alone until the service is back. Check that the Python service is running and that the backend has its API key.
          </p>
        ) : null}
        {status === 'available' && model ? (
          <div className="cq-kv" style={{ marginTop: 14 }}>
            <div><span>Connection</span><strong>Available</strong></div>
            <div><span>Model</span><strong>{MODEL_NAMES[model.modelKey] || model.modelKey}</strong></div>
            <div><span>Version</span><strong>{model.modelVersion}</strong></div>
            <div><span>Inputs</span><strong>{model.featureCount} features</strong></div>
          </div>
        ) : null}
      </section>

      <section className="cq-panel" aria-labelledby="how-heading">
        <h2 id="how-heading">How priority is calculated</h2>
        <p className="cq-panel-sub">Each time vitals or lab results are saved, the patient is scored again.</p>
        <ul className="cq-reasons">
          <li><strong>ML deterioration score.</strong> A model trained on the public PhysioNet sepsis dataset estimates the chance of sepsis onset in the next six hours from vitals, labs, age and sex.</li>
          <li><strong>Early-warning score.</strong> A NEWS2-style score from breathing rate, oxygen, blood pressure, heart rate, temperature and consciousness.</li>
          <li><strong>Priority.</strong> Half the ML score plus half the early-warning score, with a small capped bonus for time spent waiting. The highest priority gets the next free bed.</li>
          <li><strong>ICU recommendation.</strong> “ICU recommended” when the early-warning score is 7 or more, the ML score is 0.8 or more, or both are elevated together. “Review for ICU” when either is raised.</li>
        </ul>
      </section>

      <section className="cq-panel" aria-labelledby="limits-heading">
        <h2 id="limits-heading">Limits to keep in mind</h2>
        <ul className="cq-reasons">
          <li>The model predicts sepsis onset, not the need for an ICU bed, so it is one input to the decision.</li>
          <li>Scores are uncalibrated. 0.8 is not an 80% chance.</li>
          <li>Real patients supply about 14 of the model’s 40 inputs, so the model works with missing values.</li>
          <li>It has not been clinically validated. A clinician confirms every placement.</li>
        </ul>
        {model?.targetDefinition ? <p className="cq-who-meta" style={{ marginTop: 12 }}>Model target: {model.targetDefinition}</p> : null}
      </section>
      <PrototypeNote />
    </RoleGate>
  );
}
