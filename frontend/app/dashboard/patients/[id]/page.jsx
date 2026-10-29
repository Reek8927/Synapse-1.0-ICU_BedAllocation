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
      if (labs.assessedAt) payload.assessedAt = new Date(labs.assessedAt).toISOString();
      if (!payload.notes) delete payload.notes;
      const data = await api(`/api/patients/${encodeURIComponent(id)}/research-assessments`, { method: 'POST', body: JSON.stringify(payload) });
      setLabs(blankLabs());
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
              <div className="cq-field"><label htmlFor="l-time">Resulted at</label><input id="l-time" type="datetime-local" value={labs.assessedAt} onChange={(event) => setLabs({ ...labs, assessedAt: event.target.value })} /><small>Leave blank to use the current time.</small></div>
              <div className="cq-field cq-field--wide"><label htmlFor="l-notes">Notes</label><textarea id="l-notes" value={labs.notes} onChange={(event) => setLabs({ ...labs, notes: event.target.value })} maxLength={2000} /><small>All five results are needed. Zero is a value, so don’t use it for a missing result.</small></div>
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
                    <div><span>Glucose</span><strong>{show(item.glucose, ' mg/dL')}</strong></div>
                    <div><span>Lactate</span><strong>{show(item.lactate, ' mmol/L')}</strong></div>
                    <div><span>Creatinine</span><strong>{show(item.creatinine, ' mg/dL')}</strong></div>
                    <div><span>White cells</span><strong>{show(item.wbc, ' 10⁹/L')}</strong></div>
                    <div><span>Platelets</span><strong>{show(item.platelets, ' 10⁹/L')}</strong></div>
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
