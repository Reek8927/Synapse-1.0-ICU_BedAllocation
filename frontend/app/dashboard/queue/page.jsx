'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from '../_lib/workspace';
import { Empty, Loading, Notices, PageHeader, PrototypeNote, REC_LABEL, RiskChip, formatDateTime, formatDuration, useFeedback } from '../_components/ui';

const TIERS = [
  ['immediate_review', 'Immediate review'],
  ['urgent_review', 'Urgent review'],
  ['routine_review', 'Routine review'],
];
const emptyRow = { bedId: '', reason: '', withdrawReason: '', tier: '', tierReason: '' };

export default function QueuePage() {
  const { api, can, csrfReady, refreshCounts } = useWorkspace();
  const fb = useFeedback();
  const [loading, setLoading] = useState(true);
  const [ranked, setRanked] = useState({ queue: [] });
  const [entries, setEntries] = useState({});
  const [beds, setBeds] = useState([]);
  const [wardPatients, setWardPatients] = useState([]);
  const [open, setOpen] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [rows, setRows] = useState({});
  const [topBed, setTopBed] = useState('');
  const [topReason, setTopReason] = useState('');
  const [addForm, setAddForm] = useState({ patientId: '', requestReason: '' });

  const load = useCallback(async (rescore = false) => {
    const [r, q, b, w] = await Promise.all([
      api(`/api/risk/queue${rescore ? '?rescore=true' : ''}`),
      api('/api/icu/queue'),
      api('/api/icu/beds'),
      api('/api/patients?status=ward&page=1&limit=100'),
    ]);
    setRanked(r);
    setEntries(Object.fromEntries((q.queue || []).map((entry) => [entry.id, entry])));
    setBeds(b.beds || []);
    setWardPatients(w.patients || []);
  }, [api]);

  useEffect(() => {
    let active = true;
    load().catch((reason) => active && fb.setError(reason.message)).finally(() => active && setLoading(false));
    const timer = window.setInterval(() => { load().catch(() => {}); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const queue = ranked.queue || [];
  const readyBeds = beds.filter((bed) => bed.status === 'ready' && !bed.assignedPatientId);
  const chosenTopBed = readyBeds.find((bed) => bed.id === topBed) || readyBeds[0];
  const top = queue[0];
  const rowOf = (id) => ({ ...emptyRow, ...(rows[id] || {}) });
  const setRow = (id, patch) => setRows((current) => ({ ...current, [id]: { ...emptyRow, ...(current[id] || {}), ...patch } }));
  const refreshAll = async () => { await load(); await refreshCounts(); };

  const rescore = () => fb.run(async () => { await load(true); await refreshCounts(); }, 'Queue re-scored using the latest vitals and lab results.');

  const allocateTop = () => fb.run(async () => {
    const data = await api('/api/risk/queue/allocate-next', {
      method: 'POST',
      body: JSON.stringify({ bedId: chosenTopBed.id, confirmationReason: topReason.trim() || undefined }),
    });
    setConfirming(null); setTopReason('');
    await refreshAll();
    return data;
  }, (data) => `${data.allocation.patient.fullName} was placed in ${data.allocation.bed.bedCode}.`);

  const allocateRow = (row) => {
    const state = rowOf(row.queueEntryId);
    const bedId = readyBeds.find((bed) => bed.id === state.bedId)?.id || readyBeds[0]?.id;
    return fb.run(async () => {
      const data = await api(`/api/icu/queue/${encodeURIComponent(row.queueEntryId)}/confirm-allocation`, {
        method: 'POST', body: JSON.stringify({ bedId, confirmationReason: state.reason.trim() }),
      });
      setConfirming(null);
      await refreshAll();
      return data;
    }, (data) => `${data.allocation.patient.fullName} was placed in ${data.allocation.bed.bedCode}.`);
  };

  const withdraw = (row) => fb.run(async () => {
    await api(`/api/icu/queue/${encodeURIComponent(row.queueEntryId)}/withdraw`, { method: 'POST', body: JSON.stringify({ reason: rowOf(row.queueEntryId).withdrawReason.trim() }) });
    setConfirming(null); setOpen(null);
    await refreshAll();
  }, 'Patient withdrawn from the ICU queue.');

  const saveTier = (row, entry) => {
    const state = rowOf(row.queueEntryId);
    return fb.run(async () => {
      await api(`/api/icu/queue/${encodeURIComponent(row.queueEntryId)}/priority`, {
        method: 'PATCH', body: JSON.stringify({ reviewPriority: state.tier || entry?.reviewPriority, reason: state.tierReason.trim() }),
      });
      setRow(row.queueEntryId, { tierReason: '' });
      await refreshAll();
    }, 'Review tier saved.');
  };

  const addToQueue = (event) => {
    event.preventDefault();
    return fb.run(async () => {
      await api('/api/icu/queue', { method: 'POST', body: JSON.stringify(addForm) });
      setAddForm({ patientId: '', requestReason: '' });
      await refreshAll();
    }, 'Patient added to the ICU queue and scored.');
  };

  function renderCallout() {
    if (!queue.length) return <div className="cq-bedcall cq-bedcall--idle"><div><h2>No one is waiting</h2><p>Patients you add to the ICU queue appear here, ranked by risk.</p></div></div>;
    if (!readyBeds.length) return <div className="cq-bedcall cq-bedcall--idle"><div><h2>No ICU bed is ready</h2><p>When a bed is marked ready, the highest-ranked patient is offered it here.</p></div></div>;
    return (
      <div className="cq-bedcall">
        <div>
          <h2>{chosenTopBed.bedCode} is ready for {top.patient.fullName}</h2>
          <p>Highest priority in the queue ({top.priorityScore.toFixed(2)}). {can.allocate ? 'Confirm to place the patient in the bed.' : 'A doctor or hospital administrator confirms the placement.'}</p>
        </div>
        {can.allocate ? (
          <div className="cq-bedcall-actions">
            {readyBeds.length > 1 ? (
              <div className="cq-field"><label htmlFor="top-bed">Bed</label>
                <select id="top-bed" value={chosenTopBed.id} onChange={(event) => setTopBed(event.target.value)}>{readyBeds.map((bed) => <option key={bed.id} value={bed.id}>{bed.bedCode} · {bed.unitName}</option>)}</select>
              </div>
            ) : null}
            <div className="cq-field"><label htmlFor="top-reason">Note (optional)</label><input id="top-reason" value={topReason} onChange={(event) => setTopReason(event.target.value)} maxLength={500} placeholder="Added to the audit record" /></div>
            {confirming === 'top' ? (
              <>
                <button className="cq-btn" type="button" disabled={fb.busy || !csrfReady} onClick={allocateTop}>Confirm placement</button>
                <button className="cq-btn cq-btn--ghost" type="button" onClick={() => setConfirming(null)}>Cancel</button>
              </>
            ) : <button className="cq-btn" type="button" disabled={fb.busy || !csrfReady} onClick={() => setConfirming('top')}>Allocate {chosenTopBed.bedCode}</button>}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="ICU queue" description="Patients waiting for an ICU bed, highest priority first. The order updates whenever new vitals or lab results are entered.">
        <button className="cq-btn cq-btn--ghost" type="button" onClick={rescore} disabled={fb.busy || !csrfReady}>Re-score now</button>
      </PageHeader>
      <Notices error={fb.error} notice={fb.notice} />
      {loading ? <Loading>Loading the queue…</Loading> : (
        <>
          {renderCallout()}
          {queue.length ? (
            <ol className="cq-ladder" aria-label="ICU waiting queue">
              {queue.map((row) => {
                const entry = entries[row.queueEntryId];
                const state = rowOf(row.queueEntryId);
                const isOpen = open === row.queueEntryId;
                const due = row.observationDue;
                return (
                  <li className="cq-rung" key={row.queueEntryId}>
                    <div className="cq-rung-main">
                      <span className="cq-rank" aria-label={`Position ${row.position}`}>{row.position}</span>
                      <span className={`cq-bar cq-bar--${row.riskLevel}`} aria-hidden="true" />
                      <div className="cq-who">
                        <h3><Link href={`/dashboard/patients/${row.patientId}`}>{row.patient.fullName}</Link></h3>
                        <p className="cq-who-meta"><code>{row.patient.patientCode}</code> · {row.patient.wardName} · waiting {formatDuration(row.enteredAt)}</p>
                        <div className="cq-chips">
                          <RiskChip level={row.riskLevel} />
                          <span className="cq-chip">{REC_LABEL[row.icuRecommendation]}</span>
                          <span className="cq-chip">{row.modelScore != null ? `ML score ${row.modelScore.toFixed(2)}` : 'ML score unavailable'}</span>
                          {row.news2 != null ? <span className="cq-chip">Early-warning {row.news2}</span> : null}
                          <span className={`cq-chip ${due ? 'cq-chip--due' : 'cq-chip--ok'}`}>{row.minutesSinceObservation == null ? 'No vitals recorded' : due ? `Vitals due · ${row.minutesSinceObservation} min old` : `Vitals ${row.minutesSinceObservation} min ago`}</span>
                        </div>
                      </div>
                      <div className="cq-score">
                        <span className="cq-score-num">{row.priorityScore.toFixed(2)}</span>
                        <span className="cq-score-label">priority</span>
                        <div className={`cq-meter cq-meter--${row.riskLevel}`}><span style={{ width: `${Math.min(100, Math.max(2, row.priorityScore * 100))}%` }} /></div>
                      </div>
                    </div>
                    <div className="cq-rung-toggle">
                      <button className="cq-link-btn" type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.queueEntryId)}>{isOpen ? 'Hide details' : 'Why this rank, and actions'}</button>
                    </div>
                    {isOpen ? (
                      <div className="cq-rung-detail">
                        <div>
                          <h4 style={{ fontSize: 15, marginBottom: 6 }}>Why this rank</h4>
                          <ul className="cq-reasons">{(row.reasons || []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
                          {entry ? <p className="cq-who-meta" style={{ marginTop: 8 }}>Requested by {entry.enteredByName || 'hospital staff'} on {formatDateTime(entry.enteredAt)}: {entry.requestReason}</p> : null}
                          <p className="cq-who-meta">Last scored {formatDateTime(row.scoredAt)}. Priority blends the ML deterioration score with the early-warning score and adds a small bonus for time waited.</p>
                        </div>
                        <div className="cq-detail-grid">
                          {can.allocate ? (
                            <div className="cq-detail-block">
                              <h4>Place in a specific bed</h4>
                              <div className="cq-form">
                                <div className="cq-field"><label htmlFor={`bed-${row.queueEntryId}`}>Ready bed</label>
                                  <select id={`bed-${row.queueEntryId}`} value={readyBeds.find((bed) => bed.id === state.bedId)?.id || readyBeds[0]?.id || ''} onChange={(event) => setRow(row.queueEntryId, { bedId: event.target.value })} disabled={!readyBeds.length}>
                                    {readyBeds.length ? readyBeds.map((bed) => <option key={bed.id} value={bed.id}>{bed.bedCode} · {bed.unitName}</option>) : <option value="">No ready beds</option>}
                                  </select></div>
                                <div className="cq-field"><label htmlFor={`reason-${row.queueEntryId}`}>Reason</label><input id={`reason-${row.queueEntryId}`} value={state.reason} onChange={(event) => setRow(row.queueEntryId, { reason: event.target.value })} maxLength={500} placeholder="Why this patient and bed" /></div>
                                {confirming === `a-${row.queueEntryId}` ? (
                                  <div className="cq-confirm"><span>Place {row.patient.fullName}?</span>
                                    <button className="cq-btn cq-btn--sm" type="button" disabled={fb.busy} onClick={() => allocateRow(row)}>Confirm</button>
                                    <button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" onClick={() => setConfirming(null)}>Cancel</button></div>
                                ) : <div><button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" disabled={fb.busy || !readyBeds.length || state.reason.trim().length < 3} onClick={() => setConfirming(`a-${row.queueEntryId}`)}>Place patient</button></div>}
                              </div>
                            </div>
                          ) : null}
                          {can.setReviewTier ? (
                            <div className="cq-detail-block">
                              <h4>Clinician review tier</h4>
                              <p className="cq-who-meta" style={{ marginBottom: 8 }}>Recorded for the audit trail. It does not change the ML ranking.{entry?.reviewPriority ? ` Current: ${TIERS.find(([value]) => value === entry.reviewPriority)?.[1] || entry.reviewPriority}.` : ''}</p>
                              <div className="cq-form">
                                <div className="cq-field"><label htmlFor={`tier-${row.queueEntryId}`}>Tier</label>
                                  <select id={`tier-${row.queueEntryId}`} value={state.tier || entry?.reviewPriority || ''} onChange={(event) => setRow(row.queueEntryId, { tier: event.target.value })}>
                                    <option value="">Select a tier</option>{TIERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                  </select></div>
                                <div className="cq-field"><label htmlFor={`tier-reason-${row.queueEntryId}`}>Reason</label><input id={`tier-reason-${row.queueEntryId}`} value={state.tierReason} onChange={(event) => setRow(row.queueEntryId, { tierReason: event.target.value })} maxLength={500} /></div>
                                <div><button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" disabled={fb.busy || !(state.tier || entry?.reviewPriority) || state.tierReason.trim().length < 3} onClick={() => saveTier(row, entry)}>Save tier</button></div>
                              </div>
                            </div>
                          ) : null}
                          {can.manageQueue ? (
                            <div className="cq-detail-block">
                              <h4>Remove from the queue</h4>
                              <div className="cq-form">
                                <div className="cq-field"><label htmlFor={`wd-${row.queueEntryId}`}>Reason</label><input id={`wd-${row.queueEntryId}`} value={state.withdrawReason} onChange={(event) => setRow(row.queueEntryId, { withdrawReason: event.target.value })} maxLength={500} placeholder="Required for the audit trail" /></div>
                                {confirming === `w-${row.queueEntryId}` ? (
                                  <div className="cq-confirm"><span>Remove {row.patient.fullName}?</span>
                                    <button className="cq-btn cq-btn--danger cq-btn--sm" type="button" disabled={fb.busy} onClick={() => withdraw(row)}>Remove</button>
                                    <button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" onClick={() => setConfirming(null)}>Cancel</button></div>
                                ) : <div><button className="cq-btn cq-btn--danger cq-btn--sm" type="button" disabled={fb.busy || state.withdrawReason.trim().length < 3} onClick={() => setConfirming(`w-${row.queueEntryId}`)}>Remove from queue</button></div>}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : <Empty title="The ICU queue is empty">Add a ward patient below when an ICU assessment is requested.</Empty>}

          {can.manageQueue ? (
            <section className="cq-panel" style={{ marginTop: 24 }} aria-labelledby="add-heading">
              <h2 id="add-heading">Add a patient to the queue</h2>
              <p className="cq-panel-sub">The patient is scored straight away from their latest vitals and lab results. Enter those first on the patient’s page for an accurate rank.</p>
              <form className="cq-form" onSubmit={addToQueue}>
                <div className="cq-field"><label htmlFor="add-patient">Ward patient</label>
                  <select id="add-patient" value={addForm.patientId} onChange={(event) => setAddForm({ ...addForm, patientId: event.target.value })} required disabled={!wardPatients.length}>
                    <option value="">{wardPatients.length ? 'Select a patient' : 'No ward patients available'}</option>
                    {wardPatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.fullName} · {patient.patientCode}</option>)}
                  </select></div>
                <div className="cq-field cq-field--wide"><label htmlFor="add-reason">Reason for ICU assessment</label><textarea id="add-reason" value={addForm.requestReason} onChange={(event) => setAddForm({ ...addForm, requestReason: event.target.value })} required minLength={3} maxLength={1000} placeholder="What prompted the request?" /></div>
                <div className="cq-form-actions"><button className="cq-btn" type="submit" disabled={fb.busy || !csrfReady || !wardPatients.length}>Add to queue</button></div>
              </form>
            </section>
          ) : null}
        </>
      )}
      <PrototypeNote />
    </>
  );
}
