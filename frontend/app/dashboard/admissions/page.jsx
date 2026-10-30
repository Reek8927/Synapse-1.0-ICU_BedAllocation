'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../_lib/workspace';
import { Empty, Loading, Notices, PageHeader, StatusChip, formatDateTime, useFeedback } from '../_components/ui';

export default function AdmissionsPage() {
  const { api, can, csrfReady, refreshCounts } = useWorkspace();
  const fb = useFeedback();
  const [loading, setLoading] = useState(true);
  const [admissions, setAdmissions] = useState([]);
  const [forms, setForms] = useState({});
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    const data = await api('/api/icu/admissions');
    setAdmissions(data.admissions || []);
  }, [api]);

  useEffect(() => {
    let active = true;
    load().catch((reason) => active && fb.setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const formOf = (id) => ({ disposition: 'ward', reason: '', ...(forms[id] || {}) });
  const setForm = (id, patch) => setForms((current) => ({ ...current, [id]: { ...formOf(id), ...patch } }));

  const close = (admission) => {
    const { disposition, reason } = formOf(admission.patient.id);
    return fb.run(async () => {
      await api(`/api/icu/admissions/${encodeURIComponent(admission.patient.id)}/discharge`, { method: 'POST', body: JSON.stringify({ disposition, reason: reason.trim() }) });
      setConfirming(null);
      await load(); await refreshCounts();
    }, `${admission.patient.fullName}’s ICU admission is closed. The bed now needs cleaning.`);
  };

  return (
    <>
      <PageHeader title="Admissions" description="Patients currently in an ICU bed. Closing an admission frees the bed for cleaning; a nurse then marks it ready so the next waiting patient can take it." />
      <Notices error={fb.error} notice={fb.notice} />
      {loading ? <Loading /> : admissions.length ? (
        <div className="cq-history">
          {admissions.map((admission) => {
            const id = admission.patient.id;
            const form = formOf(id);
            return (
              <article className="cq-panel" key={id} style={{ marginBottom: 0 }}>
                <div className="cq-history-head">
                  <div>
                    <h2 style={{ fontSize: 18 }}><Link href={`/dashboard/patients/${id}`}>{admission.patient.fullName}</Link></h2>
                    <p className="cq-who-meta"><code>{admission.patient.patientCode}</code> · {admission.patient.wardName} · admitted {formatDateTime(admission.admittedAt)}</p>
                  </div>
                  {admission.bed ? <div className="cq-inline"><strong>{admission.bed.bedCode}</strong><StatusChip status={admission.bed.status} /></div> : null}
                </div>
                {!admission.bed ? <p className="cq-notice cq-notice--error" role="alert">The patient–bed link is missing or inconsistent. Don’t change this admission here; review the audit history.</p> : null}
                {can.closeAdmission && admission.bed ? (
                  <form className="cq-form" onSubmit={(event) => { event.preventDefault(); setConfirming(id); }}>
                    <div className="cq-field"><label htmlFor={`disp-${id}`}>Outcome</label>
                      <select id={`disp-${id}`} value={form.disposition} onChange={(event) => setForm(id, { disposition: event.target.value })}>
                        <option value="ward">Return to ward</option><option value="discharged">Discharged from hospital</option>
                      </select></div>
                    <div className="cq-field"><label htmlFor={`why-${id}`}>Reason for closing</label><input id={`why-${id}`} value={form.reason} onChange={(event) => setForm(id, { reason: event.target.value })} required minLength={3} maxLength={500} /></div>
                    {confirming === id ? (
                      <div className="cq-confirm"><span>Close this admission?</span>
                        <button className="cq-btn cq-btn--sm" type="button" disabled={fb.busy || !csrfReady} onClick={() => close(admission)}>Close admission</button>
                        <button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" onClick={() => setConfirming(null)}>Cancel</button></div>
                    ) : <div><button className="cq-btn cq-btn--ghost" type="submit" disabled={fb.busy || form.reason.trim().length < 3}>Close admission</button></div>}
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : <Empty title="No active ICU admissions">Placed patients appear here.</Empty>}
    </>
  );
}
