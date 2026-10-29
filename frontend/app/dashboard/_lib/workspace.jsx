'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const WorkspaceContext = createContext(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside the workspace layout.');
  return value;
}

export function WorkspaceProvider({ children }) {
  const router = useRouter();
  const csrfRef = useRef('');
  const [csrfReady, setCsrfReady] = useState(false);
  const [session, setSession] = useState({ status: 'loading', user: null, tenant: null, error: '' });
  const [counts, setCounts] = useState({ queue: 0, reminders: 0 });

  const api = useCallback(async (path, options = {}) => {
    const method = options.method || 'GET';
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    if (method !== 'GET' && method !== 'HEAD' && csrfRef.current) headers['X-CSRF-Token'] = csrfRef.current;
    const response = await fetch(path, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401 && !path.startsWith('/api/auth/login')) {
      router.replace('/login');
      throw new Error('Your session has ended. Sign in again.');
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'The request could not be completed.');
    return data;
  }, [router]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
        const csrfData = await csrf.json().catch(() => ({}));
        if (!csrf.ok) throw new Error(csrfData.error || 'Unable to start a secure session.');
        csrfRef.current = csrfData.csrfToken || '';
        if (active) setCsrfReady(Boolean(csrfRef.current));

        const me = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
        if (me.status === 401) { router.replace('/login'); return; }
        const meData = await me.json().catch(() => ({}));
        if (!me.ok) throw new Error(meData.error || 'Unable to load your workspace.');
        if (active) setSession({ status: 'ready', user: meData.user, tenant: meData.tenant, error: '' });
      } catch (reason) {
        if (active) setSession({ status: 'error', user: null, tenant: null, error: reason.message || 'Unable to load your workspace.' });
      }
    })();
    return () => { active = false; };
  }, [router]);

  const role = session.user?.role || '';
  const isPlatformAdmin = role === 'platform_admin';
  const isHospitalUser = Boolean(session.user) && !isPlatformAdmin;

  const refreshCounts = useCallback(async () => {
    if (!isHospitalUser) return;
    try {
      const [queue, reminders] = await Promise.all([api('/api/icu/queue'), api('/api/icu/reminders')]);
      setCounts({ queue: (queue.queue || []).length, reminders: (reminders.reminders || []).length });
    } catch { /* badges are a convenience; pages show their own errors */ }
  }, [api, isHospitalUser]);

  useEffect(() => {
    if (!isHospitalUser) return undefined;
    refreshCounts();
    const timer = window.setInterval(refreshCounts, 30000);
    return () => window.clearInterval(timer);
  }, [isHospitalUser, refreshCounts]);

  const signOut = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* leave anyway */ }
    router.replace('/login');
    router.refresh();
  }, [api, router]);

  const can = useMemo(() => ({
    createBeds: role === 'hospital_admin',
    updateBeds: ['hospital_admin', 'nurse', 'staff'].includes(role),
    manageQueue: ['hospital_admin', 'doctor', 'nurse'].includes(role),
    setReviewTier: ['hospital_admin', 'doctor'].includes(role),
    allocate: ['hospital_admin', 'doctor'].includes(role),
    closeAdmission: ['hospital_admin', 'doctor'].includes(role),
    acknowledge: ['hospital_admin', 'doctor', 'nurse', 'staff'].includes(role),
    viewModel: ['hospital_admin', 'doctor'].includes(role),
    manageTeam: role === 'hospital_admin',
  }), [role]);

  const value = useMemo(() => ({
    status: session.status, loadError: session.error, user: session.user, tenant: session.tenant,
    role, isPlatformAdmin, isHospitalUser, can, api, csrfReady, counts, refreshCounts, signOut,
  }), [session, role, isPlatformAdmin, isHospitalUser, can, api, csrfReady, counts, refreshCounts, signOut]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
