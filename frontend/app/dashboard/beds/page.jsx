'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../_lib/workspace';
import { Empty, Loading, Notices, PageHeader, StatusChip, formatDateTime, useFeedback } from '../_components/ui';

const STATUS_OPTIONS = [
  ['ready', 'Ready'], ['cleaning', 'Cleaning'], ['preparing', 'Preparing'], ['unavailable', 'Unavailable'],
];
const EMPTY_BED = { bedCode: '', unitName: 'ICU', locationLabel: '', status: 'ready', notes: '' };

export default function BedsPage() {
  const { api, can, csrfReady, refreshCounts } = useWorkspace();
  const fb = useFeedback();
  const [loading, setLoading] = useState(true);
  const [beds, setBeds] = useState([]);
  const [counts, setCounts] = useState({});
  const [pending, setPending] = useState({});
  const [form, setForm] = useState(EMPTY_BED);

  const load = useCallback(async () => {
    const data = await api('/api/icu/beds');
    setBeds(data.beds || []);
    setCounts(data.counts || {});
    setPending({});
  }, [api]);

  useEffect(() => {
    let active = true;
    load().catch((reason) => active && fb.setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const addBed = (event) => {
    event.preventDefault();
    return fb.run(async () => { await api('/api/icu/beds', { method: 'POST', body: JSON.stringify(form) }); setForm(EMPTY_BED); await load(); }, 'ICU bed added.');
  };
  const saveStatus = (bed) => fb.run(async () => {
    await api(`/api/icu/beds/${encodeURIComponent(bed.id)}`, { method: 'PATCH', body: JSON.stringify({ status: pending[bed.id] }) });
    await load(); await refreshCounts();
  }, `${bed.bedCode} updated.`);

  return (
    <>
      <PageHeader title="ICU beds" description="Only a bed marked ready can be given to a waiting patient. A bed becomes occupied through a confirmed placement and goes to cleaning when the admission closes." />
      <Notices error={fb.error} notice={fb.notice} />
      {loading ? <Loading /> : (
        <>
          <div className="cq-stats">
            <div className="cq-stat"><span className="cq-stat-label">Total</span><strong className="cq-stat-value">{counts.total ?? 0}</strong></div>
            <div className="cq-stat"><span className="cq-stat-label">Ready</span><strong className="cq-stat-value">{counts.ready ?? 0}</strong></div>
            <div className="cq-stat"><span className="cq-stat-label">Occupied</span><strong className="cq-stat-value">{counts.occupied ?? 0}</strong></div>
            <div className="cq-stat"><span className="cq-stat-label">Cleaning or preparing</span><strong className="cq-stat-value">{(counts.cleaning ?? 0) + (counts.preparing ?? 0)}</strong></div>
            <div className="cq-stat"><span className="cq-stat-label">Unavailable</span><strong className="cq-stat-value">{counts.unavailable ?? 0}</strong></div>
          </div>

          {beds.length ? (
            <div className="cq-table-wrap">
              <table className="cq-table">
                <thead><tr><th>Bed</th><th>Unit</th><th>Status</th><th>Patient</th><th>Changed</th>{can.updateBeds ? <th>Update status</th> : null}</tr></thead>
                <tbody>
                  {beds.map((bed) => {
                    const assigned = Boolean(bed.assignedPatientId);
                    const value = pending[bed.id] ?? bed.status;
                    const options = STATUS_OPTIONS.some(([v]) => v === bed.status) ? STATUS_OPTIONS : [...STATUS_OPTIONS, [bed.status, bed.status]];
                    return (
                      <tr key={bed.id}>
                        <td><strong>{bed.bedCode}</strong>{bed.locationLabel ? <><br /><span className="cq-who-meta">{bed.locationLabel}</span></> : null}</td>
                        <td>{bed.unitName}</td>
                        <td><StatusChip status={bed.status} /></td>
                        <td>{bed.assignedPatient ? <>{bed.assignedPatient.fullName} <code>{bed.assignedPatient.patientCode}</code></> : '—'}</td>
                        <td>{formatDateTime(bed.lastStatusChangedAt)}</td>
                        {can.updateBeds ? (
                          <td>
                            {assigned ? <span className="cq-who-meta">Close the admission first</span> : (
                              <div className="cq-inline">
                                <select aria-label={`New status for ${bed.bedCode}`} value={value} onChange={(event) => setPending((current) => ({ ...current, [bed.id]: event.target.value }))} disabled={fb.busy}>
                                  {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                                </select>
                                <button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" disabled={fb.busy || !csrfReady || value === bed.status} onClick={() => saveStatus(bed)}>Save</button>
                              </div>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No ICU beds yet">{can.createBeds ? 'Add the first bed below.' : 'A hospital administrator can add beds.'}</Empty>}

          {can.createBeds ? (
            <section className="cq-panel" style={{ marginTop: 24 }} aria-labelledby="add-bed-heading">
              <h2 id="add-bed-heading">Add a bed</h2>
              <p className="cq-panel-sub">Bed codes are unique within your hospital. A new bed can’t start as occupied.</p>
              <form className="cq-form" onSubmit={addBed}>
                <div className="cq-field"><label htmlFor="bed-code">Bed code</label><input id="bed-code" value={form.bedCode} onChange={(event) => setForm({ ...form, bedCode: event.target.value.toUpperCase() })} required maxLength={24} placeholder="ICU-05" /></div>
                <div className="cq-field"><label htmlFor="bed-unit">Unit</label><input id="bed-unit" value={form.unitName} onChange={(event) => setForm({ ...form, unitName: event.target.value })} required maxLength={80} /></div>
                <div className="cq-field"><label htmlFor="bed-loc">Location</label><input id="bed-loc" value={form.locationLabel} onChange={(event) => setForm({ ...form, locationLabel: event.target.value })} maxLength={80} placeholder="East wing" /></div>
                <div className="cq-field"><label htmlFor="bed-status">Starting status</label><select id="bed-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{STATUS_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></div>
                <div className="cq-field cq-field--wide"><label htmlFor="bed-notes">Notes</label><textarea id="bed-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={500} /></div>
                <div className="cq-form-actions"><button className="cq-btn" type="submit" disabled={fb.busy || !csrfReady}>Add bed</button></div>
              </form>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
