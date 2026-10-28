'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [form, setForm] = useState({ tenantSlug: '', email: '', password: '' });
  const [csrfToken, setCsrfToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to initialize secure sign-in. Refresh the page and try again.');
        const data = await response.json();
        setCsrfToken(data.csrfToken || '');
      })
      .catch((reason) => setError(reason.message || 'Unable to initialize secure sign-in.'));
  }, []);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!csrfToken) throw new Error('Secure sign-in is not ready. Refresh the page and try again.');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.');
      setForm({ tenantSlug: '', email: '', password: '' });
      router.replace('/dashboard');
      router.refresh();
    } catch (reason) {
      setError(reason.message || 'Unable to reach BedAllocation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="form-intro"><h2>Staff sign in</h2><p>Use your hospital workspace credentials. Public account registration is disabled.</p></div>
      <div className="field-group"><label htmlFor="tenantSlug">Hospital workspace slug <span className="field-optional">(leave blank for platform admin)</span></label><input id="tenantSlug" name="tenantSlug" value={form.tenantSlug} onChange={update} autoComplete="organization" placeholder="e.g. city-general" maxLength={60} /></div>
      <div className="field-group"><label htmlFor="email">Work email</label><input id="email" name="email" value={form.email} onChange={update} type="email" autoComplete="username" required maxLength={254} placeholder="name@hospital.org" /></div>
      <div className="field-group"><label htmlFor="password">Password</label><input id="password" name="password" value={form.password} onChange={update} type="password" autoComplete="current-password" required maxLength={128} /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-dark button-full" type="submit" disabled={busy || !csrfToken}>{busy ? 'Signing in…' : 'Sign in securely'}</button>
      <p className="form-footnote">Session credentials are stored in a protected cookie, not browser local storage.</p>
    </form>
  );
}
