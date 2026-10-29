'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWorkspace } from './_lib/workspace';
import Icon from './_components/Icon';
import { Loading, PageHeader, PrototypeNote, REC_LABEL, RiskChip } from './_components/ui';

function HospitalOverview() {
  const { api, tenant, counts } = useWorkspace();
  const [data, setData] = useState({ loading: true, beds: null, ranked: null, error: '' });

  useEffect(() => {
    let active = true;
    Promise.all([api('/api/icu/beds'), api('/api/risk/queue')])
      .then(([beds, ranked]) => { if (active) setData({ loading: false, beds, ranked, error: '' }); })
      .catch((reason) => { if (active) setData({ loading: false, beds: null, ranked: null, error: reason.message }); });
    return () => { active = false; };
  }, [api]);

  const bedCounts = data.beds?.counts || {};
  const queue = data.ranked?.queue || [];
  const readyBeds = bedCounts.ready ?? 0;

  return (
    <>
      <PageHeader title={tenant?.name || 'Hospital workspace'} description="Where the ICU stands right now." />
      {data.error ? <p className="cq-notice cq-notice--error" role="alert">{data.error}</p> : null}
      {data.loading ? <Loading /> : (
        <>
          {readyBeds > 0 && queue.length > 0 ? (
            <p className="cq-notice cq-notice--info" role="status">
              {readyBeds === 1 ? 'An ICU bed is ready' : `${readyBeds} ICU beds are ready`} and {queue.length} {queue.length === 1 ? 'patient is' : 'patients are'} waiting.{' '}
              <Link href="/dashboard/queue"><strong>Review the queue</strong></Link>
            </p>
          ) : null}
          <div className="cq-stats">
            <div className="cq-stat"><span className="cq-stat-label">Ready beds</span><strong className="cq-stat-value">{readyBeds}</strong></div>
            <div className="cq-stat"><span className="cq-stat-label">Occupied beds</span><strong className="cq-stat-value">{bedCounts.occupied ?? 0}</strong></div>
            <div className="cq-stat"><span className="cq-stat-label">Waiting for ICU</span><strong className="cq-stat-value">{queue.length}</strong></div>
            <div className="cq-stat"><span className="cq-stat-label">Vitals due</span><strong className={`cq-stat-value${counts.reminders ? ' cq-stat-value--warn' : ''}`}>{counts.reminders}</strong></div>
          </div>

          <div className="cq-two">
            <section className="cq-panel" aria-labelledby="next-heading">
              <h2 id="next-heading">Next in line</h2>
              <p className="cq-panel-sub">Highest priority first, based on the latest vitals and lab results.</p>
              {queue.length ? (
                <ol className="cq-mini">
                  {queue.slice(0, 4).map((row) => (
                    <li key={row.queueEntryId}>
                      <span className="cq-mini-rank">{row.position}</span>
                      <span className="cq-mini-main"><strong>{row.patient.fullName}</strong><span>{REC_LABEL[row.icuRecommendation]} · priority {row.priorityScore.toFixed(2)}</span></span>
                      <RiskChip level={row.riskLevel} />
                    </li>
                  ))}
                </ol>
              ) : <p className="cq-panel-sub">Nobody is waiting for an ICU bed.</p>}
              <p style={{ marginTop: 14 }}><Link className="cq-btn cq-btn--ghost cq-btn--sm" href="/dashboard/queue">Open the ICU queue <Icon name="arrow" size={16} /></Link></p>
            </section>
            <section className="cq-panel" aria-labelledby="go-heading">
              <h2 id="go-heading">Go to</h2>
              <div className="cq-links" style={{ marginTop: 14 }}>
                <Link href="/dashboard/patients"><Icon name="users" size={18} />Enter vitals or lab results</Link>
                <Link href="/dashboard/beds"><Icon name="bed" size={18} />Update bed status</Link>
                <Link href="/dashboard/admissions"><Icon name="pulse" size={18} />Active ICU admissions</Link>
                <Link href="/dashboard/reminders"><Icon name="bell" size={18} />Vitals reminders</Link>
              </div>
            </section>
          </div>
        </>
      )}
      <PrototypeNote />
    </>
  );
}

function PlatformOverview() {
  const { api } = useWorkspace();
  const [data, setData] = useState({ loading: true, tenants: [], messages: [], error: '' });
  useEffect(() => {
    let active = true;
    Promise.all([api('/api/platform/tenants'), api('/api/platform/contact-messages')])
      .then(([t, m]) => { if (active) setData({ loading: false, tenants: t.tenants || [], messages: m.messages || [], error: '' }); })
      .catch((reason) => { if (active) setData({ loading: false, tenants: [], messages: [], error: reason.message }); });
    return () => { active = false; };
  }, [api]);
  return (
    <>
      <PageHeader title="Platform administration" description="Hospital workspaces and public inquiries." />
      {data.error ? <p className="cq-notice cq-notice--error" role="alert">{data.error}</p> : null}
      {data.loading ? <Loading /> : (
        <div className="cq-stats">
          <div className="cq-stat"><span className="cq-stat-label">Hospitals</span><strong className="cq-stat-value">{data.tenants.length}</strong></div>
          <div className="cq-stat"><span className="cq-stat-label">Messages</span><strong className="cq-stat-value">{data.messages.length}</strong></div>
        </div>
      )}
      <div className="cq-links" style={{ maxWidth: 420 }}>
        <Link href="/dashboard/hospitals"><Icon name="hospital" size={18} />Create or review hospital workspaces</Link>
        <Link href="/dashboard/messages"><Icon name="mail" size={18} />Read contact messages</Link>
      </div>
    </>
  );
}

export default function OverviewPage() {
  const { isPlatformAdmin } = useWorkspace();
  return isPlatformAdmin ? <PlatformOverview /> : <HospitalOverview />;
}
