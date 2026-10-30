'use client';

import { useState } from 'react';
import { useWorkspace } from '../_lib/workspace';
import { Notices, PageHeader, RoleGate, useFeedback } from '../_components/ui';

const EMPTY = { name: '', email: '', password: '', role: 'nurse' };

export default function TeamPage() {
  const { api, can, csrfReady } = useWorkspace();
  const fb = useFeedback();
  const [form, setForm] = useState(EMPTY);

  const create = (event) => {
    event.preventDefault();
    return fb.run(async () => { await api('/api/auth/users', { method: 'POST', body: JSON.stringify(form) }); setForm(EMPTY); },
      'Account created. Share the starting password through a secure channel.');
  };

  return (
    <RoleGate allowed={can.manageTeam}>
      <PageHeader title="Team" description="Create accounts for your hospital’s doctors, nurses and operations staff. New accounts always belong to your hospital." />
      <Notices error={fb.error} notice={fb.notice} />
      <section className="cq-panel" aria-labelledby="team-heading">
        <h2 id="team-heading">Create an account</h2>
        <p className="cq-panel-sub">Doctors and administrators confirm ICU placements. Nurses and staff update bed status and enter vitals.</p>
        <form className="cq-form" onSubmit={create}>
          <div className="cq-field"><label htmlFor="t-name">Full name</label><input id="t-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} maxLength={100} /></div>
          <div className="cq-field"><label htmlFor="t-email">Work email</label><input id="t-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required maxLength={254} /></div>
          <div className="cq-field"><label htmlFor="t-role">Role</label>
            <select id="t-role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="doctor">Doctor</option><option value="nurse">Nurse</option><option value="staff">Operations staff</option>
            </select></div>
          <div className="cq-field"><label htmlFor="t-pass">Starting password</label><input id="t-pass" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={14} maxLength={128} autoComplete="new-password" /><small>At least 14 characters.</small></div>
          <div className="cq-form-actions"><button className="cq-btn" type="submit" disabled={fb.busy || !csrfReady}>Create account</button></div>
        </form>
      </section>
    </RoleGate>
  );
}
