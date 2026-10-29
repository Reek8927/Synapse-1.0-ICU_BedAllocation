'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../_lib/workspace';
import Icon from '../_components/Icon';
import { Empty, Loading, Notices, PageHeader, useFeedback } from '../_components/ui';

const EMPTY = { fullName: '', hospitalRecordNumber: '', dateOfBirth: '', sexAtBirth: 'not_recorded', wardName: '', bedLabel: '' };
const STATUS_TEXT = { ward: 'On ward', icu_waiting: 'Waiting for ICU', icu_admitted: 'In ICU', discharged: 'Discharged' };

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function PatientsPage() {
  const router = useRouter();
  const { api, csrfReady } = useWorkspace();
  const fb = useFeedback();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async (search = '', page = 1) => {
    const body = { page, limit: 25 };
    const data = search.trim()
      ? await api('/api/patients/search', { method: 'POST', body: JSON.stringify({ ...body, search: search.trim() }) })
      : await api(`/api/patients?page=${page}&limit=25`);
    setPatients(data.patients || []);
    setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
  }, [api]);

  useEffect(() => {
    let active = true;
    load().catch((reason) => active && fb.setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const search = (event) => {
    event.preventDefault();
    setActiveSearch(searchInput.trim());
    return fb.run(() => load(searchInput, 1));
  };
  const goTo = (page) => fb.run(() => load(activeSearch, page));

  const register = (event) => {
    event.preventDefault();
    return fb.run(async () => {
      const payload = { ...form };
      if (!payload.dateOfBirth) delete payload.dateOfBirth;
      const data = await api('/api/patients', { method: 'POST', body: JSON.stringify(payload) });
      router.push(`/dashboard/patients/${data.patient.id}`);
    });
  };

  return (
    <>
      <PageHeader title="Patients" description="Search records, register a ward patient, and open a record to enter vitals or lab results.">
        <button className="cq-btn" type="button" onClick={() => setShowForm((value) => !value)} aria-expanded={showForm}><Icon name="plus" size={18} />Register patient</button>
      </PageHeader>
      <Notices error={fb.error} notice={fb.notice} />

      {showForm ? (
        <section className="cq-panel" aria-labelledby="register-heading">
          <h2 id="register-heading">Register a ward patient</h2>
          <p className="cq-panel-sub">A patient code is created for you. The record belongs to your hospital only.</p>
          <form className="cq-form" onSubmit={register}>
            <div className="cq-field"><label htmlFor="p-name">Full name</label><input id="p-name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required minLength={2} maxLength={120} autoComplete="off" /></div>
            <div className="cq-field"><label htmlFor="p-mrn">Hospital record number</label><input id="p-mrn" value={form.hospitalRecordNumber} onChange={(event) => setForm({ ...form, hospitalRecordNumber: event.target.value })} maxLength={40} autoComplete="off" /></div>
            <div className="cq-field"><label htmlFor="p-dob">Date of birth</label><input id="p-dob" type="date" max={today()} value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} /><small>Age is one of the inputs to the risk score.</small></div>
            <div className="cq-field"><label htmlFor="p-sex">Sex at birth</label>
              <select id="p-sex" value={form.sexAtBirth} onChange={(event) => setForm({ ...form, sexAtBirth: event.target.value })}>
                <option value="not_recorded">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option><option value="unknown">Unknown</option>
              </select></div>
            <div className="cq-field"><label htmlFor="p-ward">Ward</label><input id="p-ward" value={form.wardName} onChange={(event) => setForm({ ...form, wardName: event.target.value })} required maxLength={80} placeholder="Medical ward" /></div>
            <div className="cq-field"><label htmlFor="p-bed">Bed or room</label><input id="p-bed" value={form.bedLabel} onChange={(event) => setForm({ ...form, bedLabel: event.target.value })} maxLength={30} placeholder="M-12" /></div>
            <div className="cq-form-actions">
              <button className="cq-btn" type="submit" disabled={fb.busy || !csrfReady}>Register and open record</button>
              <button className="cq-btn cq-btn--ghost" type="button" onClick={() => { setShowForm(false); setForm(EMPTY); }}>Cancel</button>
            </div>
          </form>
        </section>
      ) : null}

      <form className="cq-search" onSubmit={search}>
        <div className="cq-field"><label htmlFor="p-search">Search</label><input id="p-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} placeholder="Name, patient code or record number" /></div>
        <button className="cq-btn cq-btn--ghost" type="submit">Search</button>
        {activeSearch ? <button className="cq-btn cq-btn--ghost" type="button" onClick={() => { setSearchInput(''); setActiveSearch(''); fb.run(() => load('', 1)); }}>Clear</button> : null}
      </form>

      {loading ? <Loading /> : patients.length ? (
        <>
          <p className="cq-who-meta" style={{ marginBottom: 8 }}>{pagination.total} {pagination.total === 1 ? 'patient' : 'patients'}</p>
          <div className="cq-table-wrap">
            <table className="cq-table">
              <thead><tr><th>Patient</th><th>Code</th><th>Ward</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td><strong>{patient.fullName}</strong></td>
                    <td><code>{patient.patientCode}</code></td>
                    <td>{patient.wardName}{patient.bedLabel ? ` · ${patient.bedLabel}` : ''}</td>
                    <td><span className="cq-chip">{STATUS_TEXT[patient.status] || patient.status}</span></td>
                    <td><Link className="cq-btn cq-btn--ghost cq-btn--sm" href={`/dashboard/patients/${patient.id}`}>Open record</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.pages > 1 ? (
            <div className="cq-pager">
              <button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" disabled={pagination.page <= 1 || fb.busy} onClick={() => goTo(pagination.page - 1)}>Previous</button>
              <span>Page {pagination.page} of {pagination.pages}</span>
              <button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" disabled={pagination.page >= pagination.pages || fb.busy} onClick={() => goTo(pagination.page + 1)}>Next</button>
            </div>
          ) : null}
        </>
      ) : <Empty title={activeSearch ? 'No patients match that search' : 'No patients yet'}>{activeSearch ? 'Check the spelling or try the patient code.' : 'Register the first ward patient to begin.'}</Empty>}
    </>
  );
}
