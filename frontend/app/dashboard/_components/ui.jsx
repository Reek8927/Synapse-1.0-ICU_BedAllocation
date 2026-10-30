'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import Icon from './Icon';

export function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

export function formatDuration(from, now = Date.now()) {
  if (!from) return '';
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}

export const REC_LABEL = {
  icu_recommended: 'ICU recommended',
  icu_review: 'Review for ICU',
  icu_not_indicated: 'ICU not indicated now',
};
export const RISK_LABEL = { high: 'High risk', medium: 'Medium risk', low: 'Low risk' };

export function PageHeader({ title, description, children }) {
  return (
    <div className="cq-ph">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="cq-ph-actions">{children}</div> : null}
    </div>
  );
}

export function Notices({ error, notice }) {
  return (
    <>
      {error ? <p className="cq-notice cq-notice--error" role="alert">{error}</p> : null}
      {notice ? <p className="cq-notice cq-notice--ok" role="status">{notice}</p> : null}
    </>
  );
}

// Shared error/notice/busy state for a page.
export function useFeedback() {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (task, successMessage) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await task();
      const message = typeof successMessage === 'function' ? successMessage(result) : successMessage;
      if (message) setNotice(message);
      return result;
    } catch (reason) {
      setError(reason?.message || 'Something went wrong. Try again.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { error, notice, busy, setError, setNotice, run };
}

export function RiskChip({ level }) {
  if (!level) return null;
  return <span className={`cq-chip cq-chip--${level}`}><span className="cq-dot" aria-hidden="true" />{RISK_LABEL[level] || level}</span>;
}

export function Empty({ title, children }) {
  return <div className="cq-empty"><strong>{title}</strong>{children}</div>;
}

export function Loading({ children = 'Loading…' }) {
  return <p className="cq-loading" role="status">{children}</p>;
}

export function RoleGate({ allowed, children }) {
  if (allowed) return children;
  return (
    <div className="cq-denied">
      <h1>You don’t have access to this page</h1>
      <p className="cq-panel-sub">Your role can’t use this area. Ask a hospital administrator if you need access.</p>
      <Link className="cq-btn" href="/dashboard"><Icon name="back" size={18} />Back to overview</Link>
    </div>
  );
}

export function PrototypeNote() {
  return (
    <p className="cq-note">
      Prototype for demonstration. The risk score is a research-model output combined with an early-warning score. It is not clinically validated and never admits a patient; a clinician confirms every placement.
    </p>
  );
}

export function StatusChip({ status }) {
  const labels = { ready: 'Ready', occupied: 'Occupied', cleaning: 'Cleaning', preparing: 'Preparing', reserved: 'Reserved', unavailable: 'Unavailable' };
  return <span className={`cq-chip cq-chip--${status}`}>{labels[status] || status}</span>;
}
