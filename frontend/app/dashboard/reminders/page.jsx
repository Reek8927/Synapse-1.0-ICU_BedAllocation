'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../_lib/workspace';
import { Empty, Loading, Notices, PageHeader, formatDateTime, useFeedback } from '../_components/ui';

export default function RemindersPage() {
  const { api, can, csrfReady, refreshCounts } = useWorkspace();
  const fb = useFeedback();
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState([]);

  const load = useCallback(async () => {
    const data = await api('/api/icu/reminders');
    setReminders(data.reminders || []);
  }, [api]);

  useEffect(() => {
    let active = true;
    load().catch((reason) => active && fb.setError(reason.message)).finally(() => active && setLoading(false));
    const timer = window.setInterval(() => { load().catch(() => {}); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const acknowledge = (reminder) => fb.run(async () => {
    await api(`/api/icu/reminders/${encodeURIComponent(reminder.id)}/acknowledge`, { method: 'POST', body: JSON.stringify({}) });
    await load(); await refreshCounts();
  }, 'Reminder acknowledged. Enter the new vitals when you have them.');

  return (
    <>
      <PageHeader title="Vitals reminders" description="Waiting patients are flagged when their vitals are more than eight minutes old. Entering new vitals re-ranks the queue." />
      <Notices error={fb.error} notice={fb.notice} />
      {loading ? <Loading /> : reminders.length ? (
        <div className="cq-history">
          {reminders.map((reminder) => (
            <article className="cq-panel" key={reminder.id} style={{ marginBottom: 0 }}>
              <div className="cq-history-head">
                <div>
                  <h2 style={{ fontSize: 18 }}>{reminder.patient.fullName}</h2>
                  <p className="cq-who-meta"><code>{reminder.patient.patientCode}</code> · {reminder.patient.wardName}{reminder.patient.bedLabel ? ` · ${reminder.patient.bedLabel}` : ''}</p>
                </div>
                <span className="cq-chip cq-chip--due">{reminder.reason === 'no_observations_recorded' ? 'No vitals recorded' : 'Vitals due'}</span>
              </div>
              <p>Last vitals: {formatDateTime(reminder.latestObservationAt)}{reminder.reminderCount > 1 ? ` · reminded ${reminder.reminderCount} times` : ''}</p>
              <div className="cq-inline" style={{ marginTop: 12 }}>
                <Link className="cq-btn cq-btn--sm" href={`/dashboard/patients/${reminder.patient.id}`}>Enter vitals</Link>
                {can.acknowledge ? <button className="cq-btn cq-btn--ghost cq-btn--sm" type="button" disabled={fb.busy || !csrfReady} onClick={() => acknowledge(reminder)}>Acknowledge</button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : <Empty title="No vitals are due">Reminders appear here when a waiting patient’s vitals reach eight minutes old.</Empty>}
    </>
  );
}
