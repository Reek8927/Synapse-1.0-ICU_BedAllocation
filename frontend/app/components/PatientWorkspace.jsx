'use client';

import { useCallback, useEffect, useState } from 'react';

const emptyPatient = {
  fullName: '', hospitalRecordNumber: '', dateOfBirth: '', sexAtBirth: 'not_recorded', wardName: '', bedLabel: ''
};

function localDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentLocalDateTime() {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return now.toISOString().slice(0, 16);
}

function blankObservation() {
  return {
    observedAt: currentLocalDateTime(), temperatureC: '', heartRateBpm: '', systolicBpMmhg: '',
    diastolicBpMmhg: '', respiratoryRateBpm: '', oxygenSaturationPercent: '', gcsTotal: '', notes: ''
  };
}

const observationFields = [
  { name: 'temperatureC', label: 'Temperature (°C)', min: 0, max: 60, step: '0.1' },
  { name: 'heartRateBpm', label: 'Heart rate (bpm)', min: 0, max: 400, step: '1' },
  { name: 'systolicBpMmhg', label: 'Systolic BP (mmHg)', min: 0, max: 400, step: '1' },
  { name: 'diastolicBpMmhg', label: 'Diastolic BP (mmHg)', min: 0, max: 300, step: '1' },
  { name: 'respiratoryRateBpm', label: 'Respiratory rate (/min)', min: 0, max: 200, step: '1' },
  { name: 'oxygenSaturationPercent', label: 'Oxygen saturation (%)', min: 0, max: 100, step: '1' },
  { name: 'gcsTotal', label: 'GCS total (3–15)', min: 3, max: 15, step: '1' }
];

function displayValue(value, suffix = '') {
  return value === null || value === undefined || value === '' ? 'Not recorded' : `${value}${suffix}`;
}

export default function PatientWorkspace({ csrfToken }) {
  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [patientForm, setPatientForm] = useState(emptyPatient);
  const [observationForm, setObservationForm] = useState(blankObservation);
  const blankResearchAssessment = () => ({
  glucose: '',
  lactate: '',
  creatinine: '',
  wbc: '',
  platelets: '',
  assessedAt: '',
  notes: ''
});

const [researchAssessmentForm, setResearchAssessmentForm] =
  useState(blankResearchAssessment());

const [researchAssessments, setResearchAssessments] = useState([]);
const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [observations, setObservations] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const api = useCallback(async (path, options = {}) => {
    const method = options.method || 'GET';
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'The request could not be completed.');
    return data;
  }, [csrfToken]);

  const loadPatients = useCallback(async (search = activeSearch, page = 1) => {
    const payload = { page, limit: 25 };
    const data = search.trim()
      ? await api('/api/patients/search', { method: 'POST', body: JSON.stringify({ ...payload, search: search.trim() }) })
      : await api(`/api/patients?page=${page}&limit=25`);
    setPatients(data.patients || []);
    setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
  }, [activeSearch, api]);

  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      try {
        const query = new URLSearchParams({ page: '1', limit: '25' });
        const data = await api(`/api/patients?${query.toString()}`);
        if (!cancelled) {
          setPatients(data.patients || []);
          setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
        }
      } catch (reason) {
        if (!cancelled) setError(reason.message || 'Unable to load patient records.');
      }
    }
    initialLoad();
    return () => { cancelled = true; };
  }, [api]);

  async function openPatient(patient) {
    setError(''); setNotice(''); setSelectedPatient(patient);
    setObservationForm(blankObservation());
    try {
      const data = await api(`/api/patients/${encodeURIComponent(patient.id)}`);
      setSelectedPatient(data.patient);
      setObservations(data.observations || []);
      setResearchAssessments(data.researchAssessments || []);
      setResearchAssessmentForm(blankResearchAssessment());
      setAuditEvents(data.auditEvents || []);
    } catch (reason) {
      setError(reason.message || 'Unable to load this patient record.');
    }
  }

  async function registerPatient(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...patientForm };
      if (!payload.dateOfBirth) delete payload.dateOfBirth;
      const data = await api('/api/patients', { method: 'POST', body: JSON.stringify(payload) });
      setPatientForm(emptyPatient);
      setActiveSearch(''); setSearchInput('');
      await loadPatients('', 1);
      await openPatient(data.patient);
      setNotice(`Patient registered successfully. Patient code: ${data.patient.patientCode}.`);
      window.dispatchEvent(new CustomEvent('bedallocation:patients-changed'));
    } catch (reason) {
      setError(reason.message || 'Unable to register this patient.');
    } finally { setBusy(false); }
  }

  async function submitObservation(event) {
    event.preventDefault();
    if (!selectedPatient) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...observationForm, observedAt: new Date(observationForm.observedAt).toISOString() };
      for (const field of observationFields) {
        if (payload[field.name] === '') delete payload[field.name];
      }
      const data = await api(`/api/patients/${encodeURIComponent(selectedPatient.id)}/observations`, {
        method: 'POST', body: JSON.stringify(payload)
      });
      setObservationForm(blankObservation());
      setObservations((current) => [data.observation, ...current].slice(0, 30));
      setNotice('Observation saved. It has not been interpreted as an ICU recommendation; clinical prioritization remains separate.');
      window.dispatchEvent(new CustomEvent('bedallocation:observations-changed'));
    } catch (reason) {
      setError(reason.message || 'Unable to save this observation.');
    } finally { setBusy(false); }
  }

  
async function submitResearchAssessment(event) {
  event.preventDefault();

  if (!selectedPatient || assessmentSubmitting) return;

  setAssessmentSubmitting(true);

  try {
    const payload = {
      glucose: researchAssessmentForm.glucose,
      lactate: researchAssessmentForm.lactate,
      creatinine: researchAssessmentForm.creatinine,
      wbc: researchAssessmentForm.wbc,
      platelets: researchAssessmentForm.platelets,
      notes: researchAssessmentForm.notes
    };

    if (researchAssessmentForm.assessedAt) {
      payload.assessedAt = new Date(
        researchAssessmentForm.assessedAt
      ).toISOString();
    }

    const response = await api(
      `/api/patients/${encodeURIComponent(selectedPatient.id)}/research-assessments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || 'Unable to save research assessment'
      );
    }

    const data = await response.json();

    setResearchAssessments(current => [
      data.researchAssessment,
      ...current
    ]);

    setResearchAssessmentForm(blankResearchAssessment());
    setNotice('Research assessment saved successfully.');
  } catch (error) {
    setNotice(error.message || 'Unable to save research assessment.');
  } finally {
    setAssessmentSubmitting(false);
  }
}


  async function searchPatients(event) {
    event.preventDefault(); setError(''); setNotice('');
    const value = searchInput.trim();
    setActiveSearch(value);
    try { await loadPatients(value, 1); }
    catch (reason) { setError(reason.message || 'Unable to search patients.'); }
  }

  async function changePage(nextPage) {
    setError('');
    try { await loadPatients(activeSearch, nextPage); }
    catch (reason) { setError(reason.message || 'Unable to load this page.'); }
  }

  return (
    <>
      {error && <p className="form-error dashboard-alert" role="alert">{error}</p>}
      {notice && <p className="status-message" role="status">{notice}</p>}
      <section className="dashboard-panel" aria-labelledby="patient-registration-heading">
        <div className="dashboard-panel-heading">
          <p className="eyebrow">01 / PATIENT MANAGEMENT</p>
          <h2 id="patient-registration-heading">Register a ward patient</h2>
          <p>Patient codes are generated by the server. Records are automatically scoped to your authenticated hospital workspace.</p>
        </div>
        <form className="dashboard-form-grid" onSubmit={registerPatient}>
          <div className="field-group"><label htmlFor="patient-full-name">Patient full name *</label><input id="patient-full-name" autoComplete="off" value={patientForm.fullName} onChange={(event) => setPatientForm({ ...patientForm, fullName: event.target.value })} minLength={2} maxLength={120} required /></div>
          <div className="field-group"><label htmlFor="patient-mrn">Hospital record number</label><input id="patient-mrn" autoComplete="off" value={patientForm.hospitalRecordNumber} onChange={(event) => setPatientForm({ ...patientForm, hospitalRecordNumber: event.target.value })} maxLength={40} /></div>
          <div className="field-group"><label htmlFor="patient-dob">Date of birth</label><input id="patient-dob" type="date" value={patientForm.dateOfBirth} max={localDateString()} onChange={(event) => setPatientForm({ ...patientForm, dateOfBirth: event.target.value })} /></div>
          <div className="field-group"><label htmlFor="patient-sex">Sex at birth</label><select id="patient-sex" value={patientForm.sexAtBirth} onChange={(event) => setPatientForm({ ...patientForm, sexAtBirth: event.target.value })}><option value="not_recorded">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option><option value="unknown">Unknown</option></select></div>
          <div className="field-group"><label htmlFor="patient-ward">Ward name *</label><input id="patient-ward" value={patientForm.wardName} onChange={(event) => setPatientForm({ ...patientForm, wardName: event.target.value })} minLength={1} maxLength={80} placeholder="e.g. Medical Ward" required /></div>
          <div className="field-group"><label htmlFor="patient-bed-label">Bed / room label</label><input id="patient-bed-label" value={patientForm.bedLabel} onChange={(event) => setPatientForm({ ...patientForm, bedLabel: event.target.value })} maxLength={30} placeholder="e.g. M-12" /></div>
          <div className="form-action-cell"><button className="button button-dark" type="submit" disabled={busy || !csrfToken}>{busy ? 'Saving…' : 'Register patient'}</button></div>
        </form>
      </section>

      <section className="dashboard-panel" aria-labelledby="patient-list-heading">
        <div className="dashboard-panel-heading">
          <p className="eyebrow">02 / HOSPITAL RECORDS</p>
          <h2 id="patient-list-heading">Patient records</h2>
          <p>Search by name, server-generated patient code or hospital record number. Only records belonging to your hospital are returned.</p>
        </div>
        <form className="patient-search-form" onSubmit={searchPatients}>
          <div className="field-group"><label htmlFor="patient-search">Search records</label><input id="patient-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} placeholder="Patient name, BA-code or hospital number" /></div>
          <button className="button button-outline" type="submit">Search</button>
          <button className="button button-outline" type="button" onClick={async () => { setSearchInput(''); setActiveSearch(''); try { await loadPatients('', 1); } catch (reason) { setError(reason.message || 'Unable to load records.'); } }}>Clear</button>
        </form>
        <p className="table-count">{pagination.total} patient record{pagination.total === 1 ? '' : 's'}</p>
        {patients.length ? <div className="table-wrap"><table><thead><tr><th>Patient</th><th>Patient code</th><th>Ward</th><th>Bed / room</th><th>Status</th><th>Action</th></tr></thead><tbody>{patients.map((patient) => <tr key={patient.id}><td>{patient.fullName}</td><td><code>{patient.patientCode}</code></td><td>{patient.wardName}</td><td>{patient.bedLabel || 'Not recorded'}</td><td>{patient.status.replaceAll('_', ' ')}</td><td><button className="button button-outline button-small" type="button" onClick={() => openPatient(patient)}>Open record</button></td></tr>)}</tbody></table></div> : <p className="empty-state">No patient records match this search. Register a ward patient above to begin.</p>}
        {pagination.pages > 1 && <div className="pagination-controls"><button className="button button-outline button-small" type="button" disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)}>Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button className="button button-outline button-small" type="button" disabled={pagination.page >= pagination.pages} onClick={() => changePage(pagination.page + 1)}>Next</button></div>}
      </section>

      {selectedPatient && <section className="dashboard-panel" aria-labelledby="patient-record-heading">
        <div className="dashboard-panel-heading patient-record-heading">
          <div><p className="eyebrow">03 / PATIENT RECORD</p><h2 id="patient-record-heading">{selectedPatient.fullName}</h2><p><code>{selectedPatient.patientCode}</code> · {selectedPatient.wardName}{selectedPatient.bedLabel ? ` · ${selectedPatient.bedLabel}` : ''} · Status: {selectedPatient.status.replaceAll('_', ' ')}</p></div>
          <button className="button button-outline button-small" type="button" onClick={() => { setSelectedPatient(null); setObservations([]); setAuditEvents([]); }}>Close record</button>
        </div>
        <div className="patient-detail-grid">
          <div><span>Hospital record number</span><strong>{selectedPatient.hospitalRecordNumber || 'Not recorded'}</strong></div>
          <div><span>Date of birth</span><strong>{selectedPatient.dateOfBirth || 'Not recorded'}</strong></div>
          <div><span>Sex at birth</span><strong>{selectedPatient.sexAtBirth.replaceAll('_', ' ')}</strong></div>
          <div><span>Admitted</span><strong>{new Date(selectedPatient.admittedAt).toLocaleString()}</strong></div>
        </div>

        {['ward', 'icu_waiting'].includes(selectedPatient.status) && <>
          <div className="dashboard-subsection-heading"><h3>Record manual observations</h3><p>Enter the values exactly as recorded and confirm the observation time. Wide numeric bounds are data-entry safeguards, not clinical alert thresholds. {selectedPatient.status === 'icu_waiting' ? 'For ICU waiting patients, enter updates promptly. The scheduled eight-minute reminder worker will be added in a later phase.' : 'This form does not make a diagnosis or assign ICU priority.'}</p></div>
          <form className="dashboard-form-grid observation-form" onSubmit={submitObservation}>
            <div className="field-group"><label htmlFor="observation-time">Observation date and time *</label><input id="observation-time" type="datetime-local" value={observationForm.observedAt} onChange={(event) => setObservationForm({ ...observationForm, observedAt: event.target.value })} required /></div>
            {observationFields.map((field) => <div className="field-group" key={field.name}><label htmlFor={`obs-${field.name}`}>{field.label}</label><input id={`obs-${field.name}`} type="number" min={field.min} max={field.max} step={field.step} value={observationForm[field.name]} onChange={(event) => setObservationForm({ ...observationForm, [field.name]: event.target.value })} /></div>)}
            <div className="field-group observation-notes"><label htmlFor="observation-notes">Staff notes (avoid unnecessary identifying details)</label><textarea id="observation-notes" value={observationForm.notes} onChange={(event) => setObservationForm({ ...observationForm, notes: event.target.value })} maxLength={2000} rows={3} /></div>
            <div className="form-action-cell"><button className="button button-dark" type="submit" disabled={busy || !csrfToken}>{busy ? 'Saving…' : 'Save observation'}</button></div>
          </form>
        </>}

        <div className="dashboard-subsection-heading"><h3>Observation history</h3><p>Most recent 30 records. Missing measurements are shown explicitly.</p></div>
        {observations.length ? <div className="observation-history-list">{observations.map((item) => <article className="observation-history-item" key={item.id}><div className="observation-history-heading"><strong>{new Date(item.observedAt).toLocaleString()}</strong><span>Manual entry{item.recordedByName ? ` · ${item.recordedByName}` : ''}</span></div><div className="observation-values-grid">
          <div><span>Temperature</span><strong>{displayValue(item.temperatureC, ' °C')}</strong></div>
          <div><span>Heart rate</span><strong>{displayValue(item.heartRateBpm, ' bpm')}</strong></div>
          <div><span>Blood pressure</span><strong>{item.systolicBpMmhg == null && item.diastolicBpMmhg == null ? 'Not recorded' : `${displayValue(item.systolicBpMmhg)} / ${displayValue(item.diastolicBpMmhg)} mmHg`}</strong></div>
          <div><span>Respiratory rate</span><strong>{displayValue(item.respiratoryRateBpm, ' /min')}</strong></div>
          <div><span>Oxygen saturation</span><strong>{displayValue(item.oxygenSaturationPercent, '%')}</strong></div>
          <div><span>GCS total</span><strong>{displayValue(item.gcsTotal)}</strong></div>
        </div>{item.notes && <p className="observation-note-text">{item.notes}</p>}</article>)}</div> : <p className="empty-state">No observations have been recorded for this patient yet.</p>}
        
{['ward', 'icu_waiting'].includes(selectedPatient.status) && (
  <section className="research-assessment-section" aria-labelledby="research-assessment-heading">
    <div className="dashboard-subsection-heading">
      <h3 id="research-assessment-heading">Research assessment data entry</h3>
      <p>
        Research data entry only — not a clinically validated sepsis assessment.
        Enter the exact recorded laboratory results. Zero is a value, not a
        placeholder for a missing result. Units and numeric limits are data-entry
        safeguards, not clinical reference ranges.
      </p>
    </div>

    <form className="dashboard-form-grid observation-form" onSubmit={submitResearchAssessment}>
      <div className="field-group">
        <label htmlFor="assessment-glucose">Glucose (mg/dL) *</label>
        <input
          id="assessment-glucose"
          type="number"
          min="0"
          max="2000"
          step="any"
          value={researchAssessmentForm.glucose}
          onChange={(event) => setResearchAssessmentForm({
            ...researchAssessmentForm,
            glucose: event.target.value
          })}
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="assessment-lactate">Lactate (mmol/L) *</label>
        <input
          id="assessment-lactate"
          type="number"
          min="0"
          max="50"
          step="any"
          value={researchAssessmentForm.lactate}
          onChange={(event) => setResearchAssessmentForm({
            ...researchAssessmentForm,
            lactate: event.target.value
          })}
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="assessment-creatinine">Creatinine (mg/dL) *</label>
        <input
          id="assessment-creatinine"
          type="number"
          min="0"
          max="100"
          step="any"
          value={researchAssessmentForm.creatinine}
          onChange={(event) => setResearchAssessmentForm({
            ...researchAssessmentForm,
            creatinine: event.target.value
          })}
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="assessment-wbc">WBC (10⁹/L) *</label>
        <input
          id="assessment-wbc"
          type="number"
          min="0"
          max="1000"
          step="any"
          value={researchAssessmentForm.wbc}
          onChange={(event) => setResearchAssessmentForm({
            ...researchAssessmentForm,
            wbc: event.target.value
          })}
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="assessment-platelets">Platelets (10⁹/L) *</label>
        <input
          id="assessment-platelets"
          type="number"
          min="0"
          max="10000"
          step="any"
          value={researchAssessmentForm.platelets}
          onChange={(event) => setResearchAssessmentForm({
            ...researchAssessmentForm,
            platelets: event.target.value
          })}
          required
        />
      </div>

      <div className="field-group">
        <label htmlFor="assessment-time">Assessment date and time</label>
        <input
          id="assessment-time"
          type="datetime-local"
          value={researchAssessmentForm.assessedAt}
          onChange={(event) => setResearchAssessmentForm({
            ...researchAssessmentForm,
            assessedAt: event.target.value
          })}
        />
      </div>

      <div className="field-group observation-notes">
        <label htmlFor="assessment-notes">Research notes (avoid unnecessary identifying details)</label>
        <textarea
          id="assessment-notes"
          value={researchAssessmentForm.notes}
          onChange={(event) => setResearchAssessmentForm({
            ...researchAssessmentForm,
            notes: event.target.value
          })}
          maxLength={2000}
          rows={3}
        />
      </div>

      <div className="form-action-cell">
        <button
          className="button button-dark"
          type="submit"
          disabled={assessmentSubmitting || busy || !csrfToken}
        >
          {assessmentSubmitting ? 'Saving…' : 'Save research assessment'}
        </button>
      </div>
    </form>
  </section>
)}


<div className="dashboard-subsection-heading">
  <h3>Research assessment history</h3>
  <p>Most recent 30 saved assessments. Results are stored separately from routine observations.</p>
</div>

{researchAssessments.length ? (
  <div className="observation-history-list">
    {researchAssessments.map((assessment) => (
      <article className="observation-history-item" key={assessment.id}>
        <div className="observation-history-heading">
          <strong>{new Date(assessment.assessedAt).toLocaleString()}</strong>
          <span>
            Research entry
            {assessment.recordedByName
              ? ` · ${assessment.recordedByName}`
              : ''}
          </span>
        </div>

        <div className="observation-values-grid">
          <div>
            <span>Glucose</span>
            <strong>{displayValue(assessment.glucose, ' mg/dL')}</strong>
          </div>
          <div>
            <span>Lactate</span>
            <strong>{displayValue(assessment.lactate, ' mmol/L')}</strong>
          </div>
          <div>
            <span>Creatinine</span>
            <strong>{displayValue(assessment.creatinine, ' mg/dL')}</strong>
          </div>
          <div>
            <span>WBC</span>
            <strong>{displayValue(assessment.wbc, ' 10⁹/L')}</strong>
          </div>
          <div>
            <span>Platelets</span>
            <strong>{displayValue(assessment.platelets, ' 10⁹/L')}</strong>
          </div>
        </div>

        {assessment.notes && (
          <p className="observation-note-text">{assessment.notes}</p>
        )}
      </article>
    ))}
  </div>
) : (
  <p className="empty-state">
    No research assessments have been recorded for this patient yet.
  </p>
)}


        {auditEvents.length > 0 && <div className="audit-summary"><h3>Patient record history</h3>{auditEvents.map((event) => <div className="audit-summary-item" key={event.id}><span>{event.eventType.replaceAll('.', ' ')} · {event.actorName}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div>}
      </section>}
      <p className="patient-workspace-note">Clinical safety note: this build stores manually entered ward observations only. It does not calculate clinical risk or recommend ICU admission. Follow your institution's clinical procedures for urgent deterioration.</p>
    </>
  );
}
