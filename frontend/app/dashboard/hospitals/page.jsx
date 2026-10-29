'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../_lib/workspace';
import { Empty, Loading, Notices, PageHeader, RoleGate, useFeedback } from '../_components/ui';

const EMPTY = { name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' };

export default function HospitalsPage() {
  const { api, isPlatformAdmin, csrfReady } = useWorkspace();
  const fb = useFeedback();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => { setTenants((await api('/api/platform/tenants')).tenants || []); }, [api]);

  useEffect(() => {
    if (!isPlatformAdmin) return undefined;
    let active = true;
    load().catch((reason) => active && fb.setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin, load]);

  const create = (event) => {
    event.preventDefault();
    return fb.run(async () => { const data = await api('/api/platform/tenants', { method: 'POST', body: JSON.stringify(form) }); setForm(EMPTY); await load(); return data; },
      (data) => `Workspace “${data.tenant.name}” created. Share its slug with the administrator.`);
  };

  return (
    <RoleGate allowed={isPlatformAdmin}>
      <PageHeader title="Hospitals" description="Each hospital gets its own workspace and a first administrator. Public sign-up stays off." />
      <Notices error={fb.error} notice={fb.notice} />
      <section className="cq-panel" aria-labelledby="new-hospital-heading">
        <h2 id="new-hospital-heading">Create a hospital workspace</h2>
        <form className="cq-form" style={{ marginTop: 14 }} onSubmit={create}>
          <div className="cq-field"><label htmlFor="h-name">Hospital name</label><input id="h-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} maxLength={150} /></div>
          <div className="cq-field"><label htmlFor="h-slug">Workspace slug</label><input id="h-slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required minLength={3} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="city-general" /><small>Staff type this to sign in.</small></div>
          <div className="cq-field"><label htmlFor="h-admin">Administrator name</label><input id="h-admin" value={form.adminName} onChange={(event) => setForm({ ...form, adminName: event.target.value })} required minLength={2} maxLength={100} /></div>
          <div className="cq-field"><label htmlFor="h-email">Administrator email</label><input id="h-email" type="email" value={form.adminEmail} onChange={(event) => setForm({ ...form, adminEmail: event.target.value })} required maxLength={254} /></div>
          <div className="cq-field"><label htmlFor="h-pass">Starting password</label><input id="h-pass" type="password" value={form.adminPassword} onChange={(event) => setForm({ ...form, adminPassword: event.target.value })} required minLength={14} maxLength={128} autoComplete="new-password" /><small>At least 14 characters.</small></div>
          <div className="cq-form-actions"><button className="cq-btn" type="submit" disabled={fb.busy || !csrfReady}>Create hospital</button></div>
        </form>
      </section>

      <h2 className="cq-section-title">Registered hospitals</h2>
      {loading ? <Loading /> : tenants.length ? (
        <div className="cq-table-wrap">
          <table className="cq-table">
            <thead><tr><th>Hospital</th><th>Slug</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>{tenants.map((item) => (
              <tr key={item.id || item._id}><td><strong>{item.name}</strong></td><td><code>{item.slug}</code></td><td><span className="cq-chip">{item.status}</span></td><td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty title="No hospitals yet">Create the first workspace above.</Empty>}
    </RoleGate>
  );
}
