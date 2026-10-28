'use client';

import { useCallback, useEffect, useState } from 'react';
import ResearchModelPanel from './ResearchModelPanel';

const EMPTY_BED = { bedCode: '', unitName: 'ICU', locationLabel: '', status: 'ready', notes: '' };
const BED_STATUSES = [
  { value: 'ready', label: 'Available and ready' },
  { value: 'occupied', label: 'Occupied (set by allocation workflow)' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'reserved', label: 'Reserved (not supported yet)' },
  { value: 'unavailable', label: 'Temporarily unavailable' }
];
const MANUAL_BED_STATUSES = BED_STATUSES.filter((item) => !['occupied', 'reserved'].includes(item.value));
const NEW_BED_STATUSES = BED_STATUSES.filter((item) => ['ready', 'cleaning', 'preparing', 'unavailable'].includes(item.value));

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function observationFreshness(value) {
  if (!value) return 'No observations recorded';
  const observedMs = new Date(value).getTime();
  if (!Number.isFinite(observedMs)) return 'Observation timestamp invalid';
  const ageMinutes = Math.max(0, Math.floor((Date.now() - observedMs) / 60000));
  if (ageMinutes >= 8) return `Update needed · last observation ${ageMinutes} min ago`;
  if (ageMinutes === 0) return 'Observed less than 1 minute ago';
  return `Observed ${ageMinutes} min ago`;
}

export default function ICUWorkspace({ csrfToken, role, onQueueChanged }) {
  const [beds, setBeds] = useState([]);
  const [bedCounts, setBedCounts] = useState({ total: 0, ready: 0, occupied: 0, cleaning: 0, preparing: 0, reserved: 0, unavailable: 0 });
  const [queue, setQueue] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [wardPatients, setWardPatients] = useState([]);
  const [bedForm, setBedForm] = useState(EMPTY_BED);
  const [queueForm, setQueueForm] = useState({ patientId: '', requestReason: '' });
  const [withdrawReasons, setWithdrawReasons] = useState({});
  const [reviewPrioritySelections, setReviewPrioritySelections] = useState({});
  const [reviewPriorityReasons, setReviewPriorityReasons] = useState({});
  const [bedStatuses, setBedStatuses] = useState({});
  const [allocationSelections, setAllocationSelections] = useState({});
  const [confirmationReasons, setConfirmationReasons] = useState({});
  const [dischargeReasons, setDischargeReasons] = useState({});
  const [dischargeDispositions, setDischargeDispositions] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clockTick, setClockTick] = useState(0);

  const canCreateBeds = role === 'hospital_admin';
  const canUpdateBeds = ['hospital_admin', 'nurse', 'staff'].includes(role);
  const canManageQueue = ['hospital_admin', 'doctor', 'nurse'].includes(role);
  // Queue review tiers are restricted to the same roles enforced by the backend route.
  const canSetQueueReviewPriority = ['hospital_admin', 'doctor'].includes(role);
  const canConfirmAllocation = ['hospital_admin', 'doctor'].includes(role);
  const canCloseAdmission = ['hospital_admin', 'doctor'].includes(role);
  const canAcknowledgeReminders = ['hospital_admin', 'doctor', 'nurse', 'staff'].includes(role);

  const api = useCallback(async (path, options = {}) => {
    const method = options.method || 'GET';
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'The request could not be completed.');
    return data;
  }, [csrfToken]);

  const loadBeds = useCallback(async () => {
    const data = await api('/api/icu/beds');
    setBeds(data.beds || []);
    setBedCounts(data.counts || { total: 0, ready: 0, occupied: 0, cleaning: 0, preparing: 0, reserved: 0, unavailable: 0 });
    setBedStatuses(Object.fromEntries((data.beds || []).map((bed) => [bed.id, bed.status])));
  }, [api]);

  const loadQueue = useCallback(async () => {
    const data = await api('/api/icu/queue');
    setQueue(data.queue || []);
  }, [api]);

  const loadAdmissions = useCallback(async () => {
    const data = await api('/api/icu/admissions');
    setAdmissions(data.admissions || []);
  }, [api]);

  const loadReminders = useCallback(async () => {
    const data = await api('/api/icu/reminders');
    setReminders(data.reminders || []);
  }, [api]);

  const loadWardPatients = useCallback(async () => {
    const data = await api('/api/patients?status=ward&page=1&limit=100');
    setWardPatients(data.patients || []);
    setQueueForm((current) => ({
      ...current,
      patientId: current.patientId && (data.patients || []).some((patient) => patient.id === current.patientId)
        ? current.patientId : ((data.patients || [])[0]?.id || '')
    }));
  }, [api]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadBeds(), loadQueue(), loadAdmissions(), loadWardPatients(), loadReminders()]);
      setError('');
    } catch (reason) {
      setError(reason.message || 'Unable to load ICU operations.');
    } finally { setLoading(false); }
  }, [loadBeds, loadQueue, loadAdmissions, loadWardPatients, loadReminders]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick((value) => value + 1);
      loadReminders().catch((reason) => setError(reason.message || 'Unable to refresh ICU reminders.'));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadReminders]);

  useEffect(() => {
    function refreshPatients() { loadWardPatients().catch((reason) => setError(reason.message || 'Unable to refresh ward patients.')); }
    window.addEventListener('bedallocation:patients-changed', refreshPatients);
    return () => window.removeEventListener('bedallocation:patients-changed', refreshPatients);
  }, [loadWardPatients]);

  useEffect(() => {
    function refreshObservationData() {
      Promise.all([loadQueue(), loadAdmissions(), loadReminders()]).catch((reason) => setError(reason.message || 'Unable to refresh ICU records and reminders.'));
    }
    window.addEventListener('bedallocation:observations-changed', refreshObservationData);
    return () => window.removeEventListener('bedallocation:observations-changed', refreshObservationData);
  }, [loadQueue, loadAdmissions, loadReminders]);

  async function createBed(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/icu/beds', { method: 'POST', body: JSON.stringify(bedForm) });
      setBedForm(EMPTY_BED);
      await loadBeds();
      setNotice('ICU bed added. An occupied bed can only be created by the staff-confirmed allocation workflow.');
    } catch (reason) { setError(reason.message || 'Unable to add the bed.'); }
    finally { setBusy(false); }
  }

  async function updateBedStatus(bed) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/icu/beds/${encodeURIComponent(bed.id)}`, {
        method: 'PATCH', body: JSON.stringify({ status: bedStatuses[bed.id] || bed.status })
      });
      await loadBeds();
      setNotice(`Bed ${bed.bedCode} status updated. Occupancy and assignment are managed through the allocation workflow.`);
    } catch (reason) { setError(reason.message || 'Unable to update the bed.'); }
    finally { setBusy(false); }
  }

  async function addToQueue(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const data = await api('/api/icu/queue', { method: 'POST', body: JSON.stringify(queueForm) });
      setQueueForm({ patientId: '', requestReason: '' });
      await Promise.all([loadQueue(), loadWardPatients()]);
      onQueueChanged?.();
      setNotice(data.message || 'Patient added to the waiting list.');
    } catch (reason) { setError(reason.message || 'Unable to add the patient to the waiting list.'); }
    finally { setBusy(false); }
  }

  async function withdrawEntry(entry) {
    const reason = (withdrawReasons[entry.id] || '').trim();
    if (reason.length < 3) { setError('Enter a reason of at least 3 characters before withdrawing an entry.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await api(`/api/icu/queue/${encodeURIComponent(entry.id)}/withdraw`, {
        method: 'POST', body: JSON.stringify({ reason })
      });
      setWithdrawReasons((current) => { const next = { ...current }; delete next[entry.id]; return next; });
      await Promise.all([loadQueue(), loadWardPatients()]);
      onQueueChanged?.();
      setNotice(data.message || 'Waiting-list entry withdrawn.');
    } catch (reasonError) { setError(reasonError.message || 'Unable to withdraw the entry.'); }
    finally { setBusy(false); }
  }

  async function saveQueueReviewPriority(entry) {
    const reviewPriority = reviewPrioritySelections[entry.id] || entry.reviewPriority || '';
    const reason = (reviewPriorityReasons[entry.id] || '').trim();
    if (!reviewPriority) { setError('Select a staff-assigned review tier.'); return; }
    if (reason.length < 3) { setError('Enter a reason of at least 3 characters for the assigned review tier.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await api(`/api/icu/queue/${encodeURIComponent(entry.id)}/priority`, {
        method: 'PATCH', body: JSON.stringify({ reviewPriority, reason })
      });
      setReviewPriorityReasons((current) => { const next = { ...current }; delete next[entry.id]; return next; });
      await loadQueue();
      setNotice(data.message || 'Staff-assigned review priority saved.');
    } catch (reasonError) { setError(reasonError.message || 'Unable to save the queue review tier.'); }
    finally { setBusy(false); }
  }

  async function confirmAllocation(entry) {
    const bedId = allocationSelections[entry.id] || readyBeds[0]?.id || '';
    const confirmationReason = (confirmationReasons[entry.id] || '').trim();
    if (!bedId) { setError('No bed is currently available and ready. Update the bed inventory before allocating.'); return; }
    if (confirmationReason.length < 3) { setError('Enter a confirmation reason of at least 3 characters.'); return; }
    const chosenBed = beds.find((bed) => bed.id === bedId);
    const confirmed = window.confirm(`Confirm ICU placement?\n\nPatient: ${entry.patient.fullName} (${entry.patient.patientCode})\nBed: ${chosenBed?.bedCode || 'Selected bed'}\n\nThis will mark the patient admitted, mark the bed occupied, and remove the entry from the waiting list. This is a manual staff decision; no ML score or automated priority is used.`);
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await api(`/api/icu/queue/${encodeURIComponent(entry.id)}/confirm-allocation`, {
        method: 'POST', body: JSON.stringify({ bedId, confirmationReason })
      });
      setConfirmationReasons((current) => { const next = { ...current }; delete next[entry.id]; return next; });
      await Promise.all([loadBeds(), loadQueue(), loadAdmissions(), loadWardPatients()]);
      onQueueChanged?.();
      setNotice(data.message || 'Staff-confirmed allocation recorded.');
    } catch (reason) { setError(reason.message || 'Unable to confirm ICU placement. Refresh and review current bed and queue status.'); }
    finally { setBusy(false); }
  }

  async function acknowledgeReminder(reminder) {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await api(`/api/icu/reminders/${encodeURIComponent(reminder.id)}/acknowledge`, {
        method: 'POST', body: JSON.stringify({})
      });
      await loadReminders();
      setNotice(data.message || 'Reminder acknowledged. Please enter updated observations when collected.');
    } catch (reason) { setError(reason.message || 'Unable to acknowledge the reminder.'); }
    finally { setBusy(false); }
  }

  async function closeAdmission(admission) {
    const reason = (dischargeReasons[admission.patient.id] || '').trim();
    const disposition = dischargeDispositions[admission.patient.id] || 'ward';
    if (admission.integrityWarning) { setError('This admission has an inconsistent patient-bed link. Do not close it through this form; review the audit history.'); return; }
    if (reason.length < 3) { setError('Enter a discharge/transfer reason of at least 3 characters.'); return; }
    const confirmed = window.confirm(`Close the ICU admission for ${admission.patient.fullName}? The bed will be marked as Cleaning and must be confirmed ready before reuse.`);
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await api(`/api/icu/admissions/${encodeURIComponent(admission.patient.id)}/discharge`, {
        method: 'POST', body: JSON.stringify({ disposition, reason })
      });
      setDischargeReasons((current) => { const next = { ...current }; delete next[admission.patient.id]; return next; });
      setDischargeDispositions((current) => { const next = { ...current }; delete next[admission.patient.id]; return next; });
      await Promise.all([loadBeds(), loadQueue(), loadAdmissions(), loadWardPatients()]);
      onQueueChanged?.();
      setNotice(data.message || 'ICU admission closed; bed requires cleaning and readiness confirmation.');
    } catch (reasonError) { setError(reasonError.message || 'Unable to close the ICU admission. Refresh and review.'); }
    finally { setBusy(false); }
  }

  void clockTick;
  const countCards = [
    ['Total beds', bedCounts.total], ['Ready', bedCounts.ready], ['Occupied', bedCounts.occupied],
    ['Cleaning / preparing', bedCounts.cleaning + bedCounts.preparing], ['Reserved', bedCounts.reserved], ['Unavailable', bedCounts.unavailable]
  ];
  const readyBeds = beds.filter((bed) => bed.status === 'ready' && !bed.assignedPatientId);

  return (
    <section className="dashboard-panel" aria-labelledby="icu-operations-heading">
      <div className="dashboard-panel-heading">
        <p className="eyebrow">04 / ICU OPERATIONS</p>
        <h2 id="icu-operations-heading">ICU beds, waiting list and admissions</h2>
        <p>Queue order is chronological, not a clinical priority ranking. An authorized doctor or hospital administrator must select the patient and ready bed, enter a reason, and explicitly confirm every placement.</p>
      </div>
      {error && <p className="form-error dashboard-alert" role="alert">{error}</p>}
      {notice && <p className="status-message" role="status">{notice}</p>}
      {['hospital_admin', 'doctor'].includes(role) && <ResearchModelPanel csrfToken={csrfToken} />}
      {loading ? <p className="empty-state">Loading ICU operations…</p> : <>
        <div className="icu-summary-grid" aria-label="ICU bed summary">
          {countCards.map(([label, value]) => <div className="icu-summary-item" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>

        <div className="dashboard-subsection-heading"><h3>ICU observation reminders</h3><p>These in-app reminders apply only to patients currently waiting for ICU. A reminder is a prompt to collect and enter observations; it does not mean a measurement exists or that clinical risk has changed.</p></div>
        {reminders.length ? <div className="icu-queue-list">{reminders.map((reminder) => <article className="icu-queue-item" key={reminder.id}>
          <div className="icu-queue-heading"><div><h4>{reminder.patient.fullName}</h4><p><code>{reminder.patient.patientCode}</code> · {reminder.patient.wardName}{reminder.patient.bedLabel ? ` · ${reminder.patient.bedLabel}` : ''}</p></div><div className="icu-queue-entered"><span>Last reminder</span><strong>{formatDate(reminder.lastRemindedAt)}</strong></div></div>
          <p>{reminder.reason === 'no_observations_recorded' ? 'No manual observations are recorded for this ICU waiting entry yet.' : 'Updated manual observations are due for this ICU waiting entry.'}</p>
          <p className="icu-observation-stale"><strong>Last recorded observation:</strong> {formatDate(reminder.latestObservationAt)}{reminder.reminderCount > 1 ? ` · Reminder repeated ${reminder.reminderCount} times` : ''}</p>
          {canAcknowledgeReminders && <button className="button button-outline button-small" type="button" disabled={busy || !csrfToken} onClick={() => acknowledgeReminder(reminder)}>Acknowledge reminder</button>}
        </article>)}</div> : <p className="empty-state">No pending ICU observation reminders. New reminders appear when a waiting patient's observation-entry interval reaches eight minutes.</p>}

        {canCreateBeds && <>
          <div className="dashboard-subsection-heading"><h3>Add an ICU bed</h3><p>Bed codes are unique per hospital. Occupied status cannot be set manually here.</p></div>
          <form className="dashboard-form-grid" onSubmit={createBed}>
            <div className="field-group"><label htmlFor="icu-bed-code">Bed code *</label><input id="icu-bed-code" value={bedForm.bedCode} onChange={(event) => setBedForm({ ...bedForm, bedCode: event.target.value.toUpperCase() })} required minLength={1} maxLength={24} placeholder="ICU-01" /></div>
            <div className="field-group"><label htmlFor="icu-bed-unit">Unit name *</label><input id="icu-bed-unit" value={bedForm.unitName} onChange={(event) => setBedForm({ ...bedForm, unitName: event.target.value })} required minLength={1} maxLength={80} /></div>
            <div className="field-group"><label htmlFor="icu-bed-location">Location label</label><input id="icu-bed-location" value={bedForm.locationLabel} onChange={(event) => setBedForm({ ...bedForm, locationLabel: event.target.value })} maxLength={80} placeholder="East wing" /></div>
            <div className="field-group"><label htmlFor="icu-bed-status">Initial status</label><select id="icu-bed-status" value={bedForm.status} onChange={(event) => setBedForm({ ...bedForm, status: event.target.value })}>{NEW_BED_STATUSES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div>
            <div className="field-group observation-notes"><label htmlFor="icu-bed-notes">Operational notes</label><textarea id="icu-bed-notes" value={bedForm.notes} onChange={(event) => setBedForm({ ...bedForm, notes: event.target.value })} maxLength={500} rows={2} /></div>
            <div className="form-action-cell"><button className="button button-dark" type="submit" disabled={busy || !csrfToken}>{busy ? 'Saving…' : 'Add ICU bed'}</button></div>
          </form>
        </>}

        <div className="dashboard-subsection-heading"><h3>Bed inventory</h3><p>Only ready beds without an active patient assignment can be selected for a new placement. A closed ICU admission moves its bed to Cleaning.</p></div>
        {beds.length ? <div className="table-wrap"><table><thead><tr><th>Bed</th><th>Unit</th><th>Location</th><th>Status</th><th>Assigned patient</th><th>Last status change</th>{canUpdateBeds && <th>Update</th>}</tr></thead><tbody>{beds.map((bed) => {
          const hasAssignment = Boolean(bed.assignedPatientId);
          const currentStatus = bedStatuses[bed.id] || bed.status;
          const statusOptions = hasAssignment
            ? BED_STATUSES.filter((item) => item.value === 'occupied')
            : [...MANUAL_BED_STATUSES, ...(MANUAL_BED_STATUSES.some((item) => item.value === bed.status) ? [] : BED_STATUSES.filter((item) => item.value === bed.status))];
          return <tr key={bed.id}>
            <td><strong>{bed.bedCode}</strong></td><td>{bed.unitName}</td><td>{bed.locationLabel || 'Not recorded'}</td>
            <td>{BED_STATUSES.find((item) => item.value === bed.status)?.label || bed.status}</td>
            <td>{bed.assignedPatient ? <span>{bed.assignedPatient.fullName} · <code>{bed.assignedPatient.patientCode}</code></span> : '—'}</td>
            <td>{formatDate(bed.lastStatusChangedAt)}</td>
            {canUpdateBeds && <td><div className="icu-bed-update"><select aria-label={`New status for ${bed.bedCode}`} value={currentStatus} disabled={busy || hasAssignment} onChange={(event) => setBedStatuses((current) => ({ ...current, [bed.id]: event.target.value }))}>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button className="button button-outline button-small" type="button" disabled={busy || !csrfToken || hasAssignment || currentStatus === bed.status} onClick={() => updateBedStatus(bed)}>Save</button></div>{hasAssignment && <small>Close the active admission before changing this bed.</small>}</td>}
          </tr>;
        })}</tbody></table></div> : <p className="empty-state">No ICU beds recorded yet. A hospital administrator can add the first bed above.</p>}

        <div className="dashboard-subsection-heading"><h3>Add a patient to the ICU waiting list</h3><p>This records a staff-entered request for ICU assessment. It does not score urgency or confirm an admission.</p></div>
        {canManageQueue ? <form className="dashboard-form-grid" onSubmit={addToQueue}>
          <div className="field-group"><label htmlFor="icu-queue-patient">Ward patient *</label><select id="icu-queue-patient" value={queueForm.patientId} onChange={(event) => setQueueForm({ ...queueForm, patientId: event.target.value })} required disabled={!wardPatients.length}><option value="">{wardPatients.length ? 'Select a ward patient' : 'No ward patients available'}</option>{wardPatients.map((patient) => <option value={patient.id} key={patient.id}>{patient.fullName} · {patient.patientCode}</option>)}</select></div>
          <div className="field-group observation-notes"><label htmlFor="icu-queue-reason">Reason for ICU assessment request *</label><textarea id="icu-queue-reason" value={queueForm.requestReason} onChange={(event) => setQueueForm({ ...queueForm, requestReason: event.target.value })} required minLength={3} maxLength={1000} rows={3} placeholder="Record the staff-entered reason and relevant context." /></div>
          <div className="form-action-cell"><button className="button button-dark" type="submit" disabled={busy || !csrfToken || !wardPatients.length}>{busy ? 'Saving…' : 'Add to waiting list'}</button></div>
        </form> : <p className="empty-state">Your role can view the waiting list, but cannot add candidates.</p>}

        <div className="dashboard-subsection-heading"><h3>Current ICU waiting list</h3><p>Queue order is operational only: entries needing staff review appear first; reviewed entries follow the doctor/admin-assigned review tier and then oldest waiting time. The application does not calculate clinical urgency from observations or ML scores. Final placement always requires an authorized staff decision.</p></div>
        {queue.length ? <div className="icu-queue-list">{queue.map((entry) => <article className="icu-queue-item" key={entry.id}>
          <div className="icu-queue-heading"><div><span className="icu-queue-position">Queue position {entry.position}</span><h4>{entry.patient.fullName}</h4><p><code>{entry.patient.patientCode}</code> · {entry.patient.wardName}{entry.patient.bedLabel ? ` · ${entry.patient.bedLabel}` : ''}</p></div><div className="icu-queue-entered"><span>Waiting since</span><strong>{formatDate(entry.enteredAt)}</strong></div></div>
          <p className="icu-queue-reason"><strong>Request reason:</strong> {entry.requestReason}<br /><strong>Entered by:</strong> {entry.enteredByName || 'Hospital staff'}</p>
          <div className="icu-review-priority-panel">
            <p className={entry.priorityReviewRequired ? 'icu-observation-stale' : 'icu-observation-fresh'}>
              <strong>Staff review:</strong> {entry.priorityReviewRequired ? 'Review required' : 'Reviewed'}
              {entry.priorityReviewRequired && entry.priorityReviewRequestedAt ? ` · Requested ${formatDate(entry.priorityReviewRequestedAt)}` : ''}
            </p>
            <p className="icu-queue-reason"><strong>{entry.priorityReviewRequired ? 'Previously assigned review tier:' : 'Staff-assigned review tier:'}</strong> {entry.reviewPriority === 'immediate_review' ? 'Immediate review' : entry.reviewPriority === 'urgent_review' ? 'Urgent review' : entry.reviewPriority === 'routine_review' ? 'Routine review' : 'Not assigned yet'}
              {entry.priorityReviewedByName && entry.priorityReviewedAt ? ` · Set by ${entry.priorityReviewedByName} on ${formatDate(entry.priorityReviewedAt)}` : ''}
              {entry.priorityReason ? <><br /><strong>Reason:</strong> {entry.priorityReason}</> : null}
            </p>
          </div>
          <p className={entry.lastObservationAt && (Date.now() - new Date(entry.lastObservationAt).getTime()) < 8 * 60 * 1000 ? 'icu-observation-fresh' : 'icu-observation-stale'}><strong>Observation status:</strong> {observationFreshness(entry.lastObservationAt)}{entry.lastObservationAt ? ` · ${formatDate(entry.lastObservationAt)}` : ''}</p>
          {canSetQueueReviewPriority && <form className="icu-priority-form" onSubmit={(event) => { event.preventDefault(); saveQueueReviewPriority(entry); }}>
            <div className="field-group"><label htmlFor={`review-priority-${entry.id}`}>Staff-assigned review tier *</label><select id={`review-priority-${entry.id}`} value={reviewPrioritySelections[entry.id] ?? entry.reviewPriority ?? ''} onChange={(event) => setReviewPrioritySelections((current) => ({ ...current, [entry.id]: event.target.value }))} required disabled={busy || !csrfToken}>
              <option value="">Select a review tier</option><option value="immediate_review">Immediate review</option><option value="urgent_review">Urgent review</option><option value="routine_review">Routine review</option>
            </select></div>
            <div className="field-group"><label htmlFor={`review-priority-reason-${entry.id}`}>Reason under your hospital's policy *</label><textarea id={`review-priority-reason-${entry.id}`} value={reviewPriorityReasons[entry.id] ?? ''} onChange={(event) => setReviewPriorityReasons((current) => ({ ...current, [entry.id]: event.target.value }))} required minLength={3} maxLength={500} rows={2} placeholder="Record why this review tier was assigned." disabled={busy || !csrfToken} /></div>
            <p className="patient-workspace-note">The selected tier is entered by an authorized clinician. It is not calculated from vital signs or an AI/ML score. New observations reopen the review requirement.</p>
            <div><button className="button button-outline button-small" type="submit" disabled={busy || !csrfToken || !((reviewPrioritySelections[entry.id] ?? entry.reviewPriority) || '') || (reviewPriorityReasons[entry.id] || '').trim().length < 3}>{busy ? 'Saving…' : entry.priorityReviewRequired ? 'Save tier and mark reviewed' : 'Update review tier'}</button></div>
          </form>}
          {canConfirmAllocation && <div className="dashboard-subsection-heading"><h4>Staff-confirmed placement</h4><p>{entry.priorityReviewRequired ? 'A queue review is still pending. Follow your hospital process and reassess the patient before making any placement decision.' : "Verify the patient, bed readiness and the hospital clinical decision before confirming."} This application does not determine medical urgency.</p></div>}
          {canConfirmAllocation && <form className="dashboard-form-grid" onSubmit={(event) => { event.preventDefault(); confirmAllocation(entry); }}>
            <div className="field-group"><label htmlFor={`allocation-bed-${entry.id}`}>Ready ICU bed *</label><select id={`allocation-bed-${entry.id}`} value={readyBeds.some((bed) => bed.id === allocationSelections[entry.id]) ? allocationSelections[entry.id] : (readyBeds[0]?.id || '')} onChange={(event) => setAllocationSelections((current) => ({ ...current, [entry.id]: event.target.value }))} required disabled={busy || readyBeds.length === 0}><option value="">{readyBeds.length ? 'Select a ready bed' : 'No ready beds available'}</option>{readyBeds.map((bed) => <option key={bed.id} value={bed.id}>{bed.bedCode} · {bed.unitName}{bed.locationLabel ? ` · ${bed.locationLabel}` : ''}</option>)}</select></div>
            <div className="field-group observation-notes"><label htmlFor={`allocation-reason-${entry.id}`}>Reason for confirming placement *</label><textarea id={`allocation-reason-${entry.id}`} value={confirmationReasons[entry.id] || ''} onChange={(event) => setConfirmationReasons((current) => ({ ...current, [entry.id]: event.target.value }))} required minLength={3} maxLength={500} rows={2} placeholder="Record the staff decision and reason." /></div>
            <div className="form-action-cell"><button className="button button-dark" type="submit" disabled={busy || !csrfToken || !readyBeds.length || (confirmationReasons[entry.id] || '').trim().length < 3}>{busy ? 'Processing…' : 'Review and confirm placement'}</button></div>
          </form>}
          {canManageQueue && <div className="icu-queue-withdraw"><div className="field-group"><label htmlFor={`withdraw-reason-${entry.id}`}>Reason to withdraw from waiting list</label><input id={`withdraw-reason-${entry.id}`} value={withdrawReasons[entry.id] || ''} onChange={(event) => setWithdrawReasons((current) => ({ ...current, [entry.id]: event.target.value }))} minLength={3} maxLength={500} placeholder="Required for an auditable withdrawal" /></div><button className="button button-outline button-small" type="button" disabled={busy || !csrfToken || (withdrawReasons[entry.id] || '').trim().length < 3} onClick={() => withdrawEntry(entry)}>Withdraw entry</button></div>}
        </article>)}</div> : <p className="empty-state">No patients are currently on this hospital's ICU waiting list.</p>}

        <div className="dashboard-subsection-heading"><h3>Active ICU admissions</h3><p>Confirmed admissions are linked to one occupied bed. Closing an admission frees the bed into Cleaning; staff must then verify that it is ready before reuse.</p></div>
        {admissions.length ? <div className="icu-queue-list">{admissions.map((admission) => <article className="icu-queue-item" key={admission.patient.id}>
          <div className="icu-queue-heading"><div><h4>{admission.patient.fullName}</h4><p><code>{admission.patient.patientCode}</code> · {admission.patient.wardName}</p></div><div className="icu-queue-entered"><span>Admitted at</span><strong>{formatDate(admission.admittedAt)}</strong></div></div>
          {admission.bed ? <p><strong>Assigned bed:</strong> {admission.bed.bedCode} · {admission.bed.unitName} · {admission.bed.status}</p> : <p className="form-error" role="alert">Integrity warning: active patient-bed assignment is missing or inconsistent. Do not manually modify this admission.</p>}
          {canCloseAdmission && admission.bed && <form className="dashboard-form-grid" onSubmit={(event) => { event.preventDefault(); closeAdmission(admission); }}>
            <div className="field-group"><label htmlFor={`disposition-${admission.patient.id}`}>Disposition *</label><select id={`disposition-${admission.patient.id}`} value={dischargeDispositions[admission.patient.id] || 'ward'} onChange={(event) => setDischargeDispositions((current) => ({ ...current, [admission.patient.id]: event.target.value }))}><option value="ward">Return to ward</option><option value="discharged">Discharged from hospital</option></select></div>
            <div className="field-group observation-notes"><label htmlFor={`discharge-reason-${admission.patient.id}`}>Reason for closing admission *</label><textarea id={`discharge-reason-${admission.patient.id}`} value={dischargeReasons[admission.patient.id] || ''} onChange={(event) => setDischargeReasons((current) => ({ ...current, [admission.patient.id]: event.target.value }))} required minLength={3} maxLength={500} rows={2} /></div>
            <div className="form-action-cell"><button className="button button-outline" type="submit" disabled={busy || !csrfToken || (dischargeReasons[admission.patient.id] || '').trim().length < 3}>{busy ? 'Processing…' : 'Close ICU admission'}</button></div>
          </form>}
        </article>)}</div> : <p className="empty-state">No active ICU admissions.</p>}
      </>}
      <p className="patient-workspace-note">Safety boundary: this is a manual, auditable placement workflow. Queue sorting follows pending review status and doctor/admin-assigned review tier; it is not a calculated clinical score. No ML score selects a patient or bed. Confirm only under the hospital's authorized procedures.</p>
    </section>
  );
}
