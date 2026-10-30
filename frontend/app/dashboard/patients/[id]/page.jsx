'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../../_lib/workspace';
import Icon from '../../_components/Icon';
import { Loading, Notices, REC_LABEL, RISK_LABEL, formatDateTime, useFeedback } from '../../_components/ui';

const STATUS_TEXT = { ward: 'On ward', icu_waiting: 'Waiting for ICU', icu_admitted: 'In ICU', discharged: 'Discharged' };
const VITALS = [
  { name: 'temperatureC', label: 'Temperature (°C)', min: 0, max: 60, step: '0.1' },
  { name: 'heartRateBpm', label: 'Heart rate (beats/min)', min: 0, max: 400, step: '1' },
  { name: 'systolicBpMmhg', label: 'Systolic BP (mmHg)', min: 0, max: 400, step: '1' },
  { name: 'diastolicBpMmhg', label: 'Diastolic BP (mmHg)', min: 0, max: 300, step: '1' },
  { name: 'respiratoryRateBpm', label: 'Breathing rate (/min)', min: 0, max: 200, step: '1' },
  { name: 'oxygenSaturationPercent', label: 'Oxygen saturation (%)', min: 0, max: 100, step: '1' },
  { name: 'gcsTotal', label: 'Glasgow Coma Scale (3–15)', min: 3, max: 15, step: '1' },
];
const LABS = [
  { name: 'glucose', label: 'Glucose (mg/dL)', max: 2000 },
  { name: 'lactate', label: 'Lactate (mmol/L)', max: 50 },
  { name: 'creatinine', label: 'Creatinine (mg/dL)', max: 100 },
  { name: 'wbc', label: 'White cells (10⁹/L)', max: 1000 },
  { name: 'platelets', label: 'Platelets (10⁹/L)', max: 10000 },
];

function localNow() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const blankVitals = () => ({ observedAt: localNow(), temperatureC: '', heartRateBpm: '', systolicBpMmhg: '', diastolicBpMmhg: '', respiratoryRateBpm: '', oxygenSaturationPercent: '', gcsTotal: '', notes: '' });
const blankLabs = () => ({ glucose: '', lactate: '', creatinine: '', wbc: '', platelets: '', assessedAt: '', notes: '' });
const show = (value, unit = '') => (value === null || value === undefined || value === '' ? 'Not recorded' : `${value}${unit}`);

const WHERE = {
  vitals: 'Add on the Vitals tab',
  lab_core: 'Required on every lab entry',
  lab_extra: 'Optional: Lab results, More lab results',
};

function groupInputs(inputs) {
  const order = [];
  const map = new Map();
  inputs.forEach((item) => {
    if (!map.has(item.group)) { map.set(item.group, []); order.push(item.group); }
    map.get(item.group).push(item);
  });
  return order.map((group) => ({ group, items: map.get(group) }));
}

function InputsChecklist({ inputs, supplied }) {
  const total = inputs.length || 40;
  const have = inputs.filter((item) => supplied.has(item.key)).length;
  return (
    <details className="cq-inputs">
      <summary>
        <span><strong>Model inputs: {have} of {total} available</strong><span className="cq-who-meta"> · more inputs give a better-informed score</span></span>
        <span className="cq-meter" aria-hidden="true"><span style={{ width: `${(have / total) * 100}%` }} /></span>
      </summary>
      <p className="cq-who-meta" style={{ margin: '10px 0 14px' }}>The model uses {total} inputs. Anything left blank is treated as “not measured”, never as normal. Enter what you have; you don’t need all {total}.</p>
      {groupInputs(inputs).map(({ group, items }) => (
        <section className="cq-input-group" key={group}>
          <h3>{group} <span className="cq-who-meta">({items.filter((item) => supplied.has(item.key)).length}/{items.length})</span></h3>
          <ul className="cq-input-list">
            {items.map((item) => {
              const ok = supplied.has(item.key);
              return (
                <li key={item.key} className={ok ? 'is-have' : 'is-missing'}>
                  <span className="cq-input-mark" aria-hidden="true">{ok ? '✓' : '–'}</span>
                  <span><span className="sr-only">{ok ? 'Available: ' : 'Missing: '}</span>{item.label}{!ok ? <small>{WHERE[item.source] || item.note}</small> : null}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </details>
  );
}

export default function PatientRecordPage() {
  const { id } = useParams();
  const { api, can, csrfReady, refreshCounts } = useWorkspace();
  const fb = useFeedback();
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [risk, setRisk] = useState(null);
  const [tab, setTab] = useState('vitals');
  const [vitals, setVitals] = useState(blankVitals);
  const [labs, setLabs] = useState(blankLabs);
  const [queueReason, setQueueReason] = useState('');
  const [inputs, setInputs] = useState([]);
  const [extraLabs, setExtraLabs] = useState({});
  const [icuUnitType, setIcuUnitType] = useState('');

  useEffect(() => {
    let active = true;
    api('/api/risk/model-inputs').then((data) => { if (active) setInputs(data.inputs || []); }).catch(() => {});
    return () => { active = false; };
  }, [api]);

  const loadRisk = useCallback(async () => {
    try { setRisk((await api(`/api/risk/patients/${encodeURIComponent(id)}`)).risk); } catch { setRisk(null); }
  }, [api, id]);

  const load = useCallback(async () => {
    const data = await api(`/api/patients/${encodeURIComponent(id)}`);
    setRecord(data);
    await loadRisk();
  }, [api, id, loadRisk]);

  useEffect(() => {
    let active = true;
    load().catch((reason) => active && fb.setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const patient = record?.patient;
  const editable = patient && ['ward', 'icu_waiting'].includes(patient.status);

  const saveVitals = (event) => {
    event.preventDefault();
    return fb.run(async () => {
      const payload = { ...vitals, observedAt: new Date(vitals.observedAt).toISOString() };
      VITALS.forEach((field) => { if (payload[field.name] === '') delete payload[field.name]; });
      if (!payload.notes) delete payload.notes;
      const data = await api(`/api/patients/${encodeURIComponent(id)}/observations`, { method: 'POST', body: JSON.stringify(payload) });
      setVitals(blankVitals());
      if (data.risk) setRisk(data.risk);
      await load(); await refreshCounts();
      return data;
    }, 'Vitals saved and the risk score updated.');
  };

  const saveLabs = (event) => {
    event.preventDefault();
    return fb.run(async () => {
      const payload = { glucose: labs.glucose, lactate: labs.lactate, creatinine: labs.creatinine, wbc: labs.wbc, platelets: labs.platelets, notes: labs.notes };
      Object.entries(extraLabs).forEach(([field, value]) => { if (value !== '') payload[field] = value; });
      if (icuUnitType) payload.icuUnitType = icuUnitType;
      if (labs.assessedAt) payload.assessedAt = new Date(labs.assessedAt).toISOString();
      if (!payload.notes) delete payload.notes;
      const data = await api(`/api/patients/${encodeURIComponent(id)}/research-assessments`, { method: 'POST', body: JSON.stringify(payload) });
      setLabs(blankLabs()); setExtraLabs({}); setIcuUnitType('');
      if (data.risk) setRisk(data.risk);
      await load();
      return data;
    }, 'Lab results saved and the risk score updated.');
  };

  const addToQueue = (event) => {
    event.preventDefault();
    return fb.run(async () => {
      await api('/api/icu/queue', { method: 'POST', body: JSON.stringify({ patientId: id, requestReason: queueReason }) });
      setQueueReason('');
      await load(); await refreshCounts();
    }, 'Patient added to the ICU queue.');
  };

  if (loading) return <Loading>Loading the record…</Loading>;
  if (!patient) return <><Link className="cq-back" href="/dashboard/patients"><Icon name="back" size={18} />Patients</Link><Notices error={fb.error || 'This patient record could not be found.'} /></>;

  const observations = record.observations || [];
  const assessments = record.researchAssessments || [];

  return (
    <>
      <Link className="cq-back" href="/dashboard/patients"><Icon name="back" size={18} />Patients</Link>
      <div className="cq-ph">
        <div>
          <h1>{patient.fullName}</h1>
          <p><code>{patient.patientCode}</code> · {patient.wardName}{patient.bedLabel ? ` · ${patient.bedLabel}` : ''} · {STATUS_TEXT[patient.status] || patient.status}</p>
        </div>
      </div>
      <Notices error={fb.error} notice={fb.notice} />

      {risk ? (
        <section className={`cq-risk cq-risk--${risk.riskLevel}`} aria-label="Current risk">
          <div>
            <p className="cq-risk-level">{RISK_LABEL[risk.riskLevel]}</p>
            <p className="cq-risk-meta">{REC_LABEL[risk.icuRecommendation]}</p>
          </div>
          <div>
            <ul className="cq-reasons">{(risk.reasons || []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <p className="cq-risk-meta">ML score {risk.modelScore != null ? risk.modelScore.toFixed(2) : 'unavailable'} · early-warning score {risk.news2 ?? 'not available'} · scored {formatDateTime(risk.scoredAt)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="cq-score-num">{risk.priorityScore?.toFixed(2)}</span>
            <span className="cq-score-label">priority</span>
          </div>
        </section>
      ) : null}

      {inputs.length ? <InputsChecklist inputs={inputs} supplied={new Set(risk?.suppliedFeatures || [])} /> : null}

      <div className="cq-facts">
        <div className="cq-fact"><span>Record number</span><strong>{show(patient.hospitalRecordNumber)}</strong></div>
        <div className="cq-fact"><span>Date of birth</span><strong>{show(patient.dateOfBirth)}</strong></div>
        <div className="cq-fact"><span>Sex at birth</span><strong>{patient.sexAtBirth.replaceAll('_', ' ')}</strong></div>
        <div className="cq-fact"><span>Admitted to hospital</span><strong>{formatDateTime(patient.admittedAt)}</strong></div>
      </div>

      {patient.status === 'ward' && can.manageQueue ? (
        <section className="cq-panel" aria-labelledby="queue-heading">
          <h2 id="queue-heading">Request an ICU assessment</h2>
          <p className="cq-panel-sub">Adds this patient to the ICU queue, ranked by their current risk.</p>
          <form className="cq-form" onSubmit={addToQueue}>
            <div className="cq-field cq-field--wide"><label htmlFor="queue-reason">Reason</label><input id="queue-reason" value={queueReason} onChange={(event) => setQueueReason(event.target.value)} required minLength={3} maxLength={1000} /></div>
            <div className="cq-form-actions"><button className="cq-btn" type="submit" disabled={fb.busy || !csrfReady}>Add to ICU queue</button></div>
          </form>
        </section>
      ) : null}

      <div className="cq-tabs" role="tablist" aria-label="Patient record sections">
        {[['vitals', 'Vitals'], ['labs', 'Lab results'], ['audit', 'Activity']].map(([key, label]) => (
          <button key={key} className="cq-tab" type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'vitals' ? (
        <div role="tabpanel">
          {editable ? (
            <form className="cq-panel cq-form" onSubmit={saveVitals}>
              <div className="cq-field"><label htmlFor="v-time">Measured at</label><input id="v-time" type="datetime-local" value={vitals.observedAt} onChange={(event) => setVitals({ ...vitals, observedAt: event.target.value })} required /></div>
              {VITALS.map((field) => (
                <div className="cq-field" key={field.name}><label htmlFor={`v-${field.name}`}>{field.label}</label>
                  <input id={`v-${field.name}`} type="number" inputMode="decimal" min={field.min} max={field.max} step={field.step} value={vitals[field.name]} onChange={(event) => setVitals({ ...vitals, [field.name]: event.target.value })} /></div>
              ))}
              <div className="cq-field cq-field--wide"><label htmlFor="v-notes">Notes</label><textarea id="v-notes" value={vitals.notes} onChange={(event) => setVitals({ ...vitals, notes: event.target.value })} maxLength={2000} /><small>Leave a value blank if it wasn’t measured. Avoid unnecessary identifying details.</small></div>
              <div className="cq-form-actions"><button className="cq-btn" type="submit" disabled={fb.busy || !csrfReady}>Save vitals</button></div>
            </form>
          ) : <p className="cq-notice cq-notice--info">Vitals can only be entered while a patient is on the ward or waiting for ICU.</p>}

          <h2 className="cq-section-title">Vitals history</h2>
          {observations.length ? (
            <div className="cq-history">
              {observations.map((item) => (
                <article className="cq-history-item" key={item.id}>
                  <div className="cq-history-head"><strong>{formatDateTime(item.observedAt)}</strong><span>{item.entrySource === 'monitor' ? 'Bedside monitor' : 'Manual entry'}{item.recordedByName ? ` · ${item.recordedByName}` : ''}</span></div>
                  <div className="cq-values">
                    <div><span>Temperature</span><strong>{show(item.temperatureC, ' °C')}</strong></div>
                    <div><span>Heart rate</span><strong>{show(item.heartRateBpm, ' /min')}</strong></div>
                    <div><span>Blood pressure</span><strong>{item.systolicBpMmhg == null && item.diastolicBpMmhg == null ? 'Not recorded' : `${show(item.systolicBpMmhg)} / ${show(item.diastolicBpMmhg)}`}</strong></div>
                    <div><span>Breathing rate</span><strong>{show(item.respiratoryRateBpm, ' /min')}</strong></div>
                    <div><span>Oxygen saturation</span><strong>{show(item.oxygenSaturationPercent, '%')}</strong></div>
                    <div><span>GCS</span><strong>{show(item.gcsTotal)}</strong></div>
                  </div>
                  {item.notes ? <p className="cq-who-meta" style={{ marginTop: 8 }}>{item.notes}</p> : null}
                </article>
              ))}
            </div>
          ) : <p className="cq-panel-sub">No vitals recorded yet.</p>}
        </div>
      ) : null}

      {tab === 'labs' ? (
        <div role="tabpanel">
          {editable ? (
            <form className="cq-panel cq-form" onSubmit={saveLabs}>
              {LABS.map((field) => (
                <div className="cq-field" key={field.name}><label htmlFor={`l-${field.name}`}>{field.label}</label>
                  <input id={`l-${field.name}`} type="number" inputMode="decimal" min="0" max={field.max} step="any" value={labs[field.name]} onChange={(event) => setLabs({ ...labs, [field.name]: event.target.value })} required /></div>
              ))}
              <details className="cq-more cq-field--wide">
                <summary>More lab results (optional) <span className="cq-who-meta">· {Object.values(extraLabs).filter((value) => value !== '').length} of {inputs.filter((item) => item.source === 'lab_extra').length} entered</span></summary>
                <p className="cq-who-meta" style={{ margin: '8px 0 14px' }}>Fill in only the tests that were actually run. Blank means not measured.</p>
                {groupInputs(inputs.filter((item) => item.source === 'lab_extra')).map(({ group, items }) => (
                  <fieldset className="cq-fieldset" key={group}>
                    <legend>{group}</legend>
                    <div className="cq-form">
                      {items.map((item) => (
                        <div className="cq-field" key={item.field}><label htmlFor={`x-${item.field}`}>{item.label}{item.unit ? ` (${item.unit})` : ''}</label>
                          <input id={`x-${item.field}`} type="number" inputMode="decimal" min={item.min} max={item.max} step="any" value={extraLabs[item.field] ?? ''} onChange={(event) => setExtraLabs({ ...extraLabs, [item.field]: event.target.value })} /></div>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <fieldset className="cq-fieldset">
                  <legend>Hospital context</legend>
                  <div className="cq-form">
                    <div className="cq-field"><label htmlFor="x-icu-type">Type of ICU this patient is waiting for</label>
                      <select id="x-icu-type" value={icuUnitType} onChange={(event) => setIcuUnitType(event.target.value)}>
                        <option value="">Not specified</option><option value="medical">Medical ICU</option><option value="surgical">Surgical ICU</option>
                      </select></div>
                  </div>
                </fieldset>
              </details>
              <div className="cq-field"><label htmlFor="l-time">Resulted at</label><input id="l-time" type="datetime-local" value={labs.assessedAt} onChange={(event) => setLabs({ ...labs, assessedAt: event.target.value })} /><small>Leave blank to use the current time.</small></div>
              <div className="cq-field cq-field--wide"><label htmlFor="l-notes">Notes</label><textarea id="l-notes" value={labs.notes} onChange={(event) => setLabs({ ...labs, notes: event.target.value })} maxLength={2000} /><small>The five core results are required. Zero is a value, so don’t use it for a missing result.</small></div>
              <div className="cq-form-actions"><button className="cq-btn" type="submit" disabled={fb.busy || !csrfReady}>Save lab results</button></div>
            </form>
          ) : <p className="cq-notice cq-notice--info">Lab results can only be entered while a patient is on the ward or waiting for ICU.</p>}

          <h2 className="cq-section-title">Lab history</h2>
          {assessments.length ? (
            <div className="cq-history">
              {assessments.map((item) => (
                <article className="cq-history-item" key={item.id}>
                  <div className="cq-history-head"><strong>{formatDateTime(item.assessedAt)}</strong><span>{item.recordedByName || 'Staff entry'}</span></div>
                  <div className="cq-values">
                    {inputs.filter((def) => (def.source === 'lab_core' || def.source === 'lab_extra') && item[def.field] != null).map((def) => <div key={def.key}><span>{def.label}</span><strong>{show(item[def.field], def.unit ? ` ${def.unit}` : '')}</strong></div>)}
                    {item.icuUnitType ? <div><span>ICU type</span><strong>{item.icuUnitType === 'medical' ? 'Medical ICU' : 'Surgical ICU'}</strong></div> : null}
                  </div>
                  {item.notes ? <p className="cq-who-meta" style={{ marginTop: 8 }}>{item.notes}</p> : null}
                </article>
              ))}
            </div>
          ) : <p className="cq-panel-sub">No lab results recorded yet.</p>}
        </div>
      ) : null}

      {tab === 'audit' ? (
        <div role="tabpanel">
          <h2 className="cq-section-title" style={{ marginTop: 0 }}>Activity</h2>
          {(record.auditEvents || []).length ? (
            <div className="cq-history">
              {record.auditEvents.map((event, index) => (
                <article className="cq-history-item" key={event.id || index}>
                  <div className="cq-history-head"><strong>{(event.action || event.eventType || 'Event').replaceAll('_', ' ')}</strong><span>{formatDateTime(event.createdAt)}</span></div>
                  {event.actorName ? <p className="cq-who-meta">By {event.actorName}</p> : null}
                </article>
              ))}
            </div>
          ) : <p className="cq-panel-sub">No activity recorded yet.</p>}
        </div>
      ) : null}
    </>
  );
}
