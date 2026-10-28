'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export default function ContactForm() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to initialize the secure form. Refresh and try again.');
        const data = await response.json();
        setCsrfToken(data.csrfToken || '');
      })
      .catch((reason) => setError(reason.message || 'Unable to initialize the form.'));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!csrfToken) throw new Error('Secure form is not ready. Refresh the page and try again.');
      const values = new FormData(event.currentTarget);
      const payload = {
        name: values.get('name'),
        email: values.get('email'),
        organization: values.get('organization'),
        subject: values.get('subject'),
        message: values.get('message'),
        turnstileToken: values.get('cf-turnstile-response') || ''
      };
      if (siteKey && !payload.turnstileToken) throw new Error('Complete the spam-protection check before submitting.');
      const response = await fetch('/api/contact', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to submit the form.');
      router.replace('/thank-you');
    } catch (reason) {
      setError(reason.message || 'Unable to submit the form. Try again later.');
      if (siteKey && window.turnstile) window.turnstile.reset();
    } finally {
      setBusy(false);
    }
  }

  const productionBuild = process.env.NODE_ENV === 'production';
  const canSubmit = Boolean(csrfToken) && (!productionBuild || Boolean(siteKey));

  return (
    <>
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
      <form className="form-stack" onSubmit={submit}>
        <div className="field-group"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" required minLength={2} maxLength={100} autoComplete="name" /></div>
        <div className="field-group"><label htmlFor="contact-email">Work email</label><input id="contact-email" name="email" type="email" required maxLength={254} autoComplete="email" /></div>
        <div className="field-group"><label htmlFor="contact-organization">Hospital or organization <span className="field-optional">(optional)</span></label><input id="contact-organization" name="organization" maxLength={150} autoComplete="organization" /></div>
        <div className="field-group"><label htmlFor="contact-subject">Subject</label><input id="contact-subject" name="subject" required minLength={3} maxLength={120} /></div>
        <div className="field-group"><label htmlFor="contact-message">How can we help?</label><textarea id="contact-message" name="message" rows={5} required minLength={10} maxLength={3000} aria-describedby="contact-message-help" /><p id="contact-message-help" className="field-help">Do not include patient names, diagnoses, medical reports or confidential clinical information.</p></div>
        {siteKey ? <div className="turnstile-wrap"><div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" /></div> : <p className="field-help">Anti-spam verification must be configured before production submissions are enabled.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark button-full" type="submit" disabled={busy || !canSubmit}>{busy ? 'Submitting…' : 'Send inquiry'}</button>
        <p className="form-footnote">Your inquiry will be stored for authorized follow-up. Avoid sharing confidential or patient information.</p>
      </form>
    </>
  );
}
