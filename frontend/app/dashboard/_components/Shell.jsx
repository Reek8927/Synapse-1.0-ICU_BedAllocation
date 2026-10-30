'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Logo from '../../_shared/Logo';
import Icon from './Icon';
import { useWorkspace } from '../_lib/workspace';

const STORAGE_KEY = 'carequeue.nav.collapsed';

function buildNav({ isPlatformAdmin, can }) {
  if (isPlatformAdmin) {
    return [
      { group: '', items: [{ href: '/dashboard', label: 'Overview', icon: 'grid' }] },
      { group: 'Platform', items: [
        { href: '/dashboard/hospitals', label: 'Hospitals', icon: 'hospital' },
        { href: '/dashboard/messages', label: 'Messages', icon: 'mail' },
      ] },
    ];
  }
  return [
    { group: '', items: [{ href: '/dashboard', label: 'Overview', icon: 'grid' }] },
    { group: 'Care', items: [
      { href: '/dashboard/queue', label: 'ICU queue', icon: 'queue', badge: 'queue' },
      { href: '/dashboard/beds', label: 'ICU beds', icon: 'bed' },
      { href: '/dashboard/admissions', label: 'Admissions', icon: 'pulse' },
      { href: '/dashboard/patients', label: 'Patients', icon: 'users' },
      { href: '/dashboard/reminders', label: 'Vitals reminders', icon: 'bell', badge: 'reminders' },
    ] },
    ...(can.viewModel || can.manageTeam ? [{ group: 'Administration', items: [
      ...(can.viewModel ? [{ href: '/dashboard/model', label: 'Risk model', icon: 'model' }] : []),
      ...(can.manageTeam ? [{ href: '/dashboard/team', label: 'Team', icon: 'team' }] : []),
    ] }] : []),
  ];
}

export default function Shell({ children }) {
  const pathname = usePathname();
  const { user, tenant, isPlatformAdmin, can, counts, signOut } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1'); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  const groups = buildNav({ isPlatformAdmin, can });
  const flat = groups.flatMap((group) => group.items);
  const current = flat.find((item) => (item.href === '/dashboard' ? pathname === '/dashboard' : pathname === item.href || pathname.startsWith(`${item.href}/`)));
  const initials = (user?.name || '?').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const roleLabel = (user?.role || '').replaceAll('_', ' ');
  const orgName = isPlatformAdmin ? 'Platform administration' : tenant?.name || 'Hospital workspace';

  return (
    <div className={`cq-app${collapsed ? ' is-collapsed' : ''}${drawer ? ' is-drawer-open' : ''}`}>
      <aside className="cq-side" id="cq-sidebar" aria-label="Workspace navigation">
        <div className="cq-side-head">
          <Link className="cq-brand" href="/dashboard" aria-label="CareQueue overview">
            <span className="brand-mark"><Logo /></span>
            <span className="cq-brand-name">CareQueue</span>
          </Link>
          <button className="cq-collapse" type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-controls="cq-sidebar" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            <Icon name="chevron" size={18} />
          </button>
        </div>

        <nav className="cq-nav" aria-label="Pages">
          {groups.map((group, index) => (
            <div key={group.group || `g${index}`}>
              {group.group ? <p className="cq-nav-group">{group.group}</p> : null}
              {group.items.map((item) => {
                const active = current?.href === item.href;
                const badge = item.badge ? counts[item.badge] : 0;
                return (
                  <Link key={item.href} href={item.href} className="cq-nav-item" data-label={item.label} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}>
                    <Icon name={item.icon} />
                    <span className="cq-nav-label">{item.label}</span>
                    {badge > 0 ? <span className={`cq-badge${item.badge === 'reminders' ? ' cq-badge--warn' : ''}`} aria-label={`${badge} ${item.label}`}>{badge}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="cq-side-foot">
          <div className="cq-user">
            <span className="cq-avatar" aria-hidden="true">{initials}</span>
            <div className="cq-user-text">
              <p className="cq-user-name">{user?.name}</p>
              <p className="cq-user-role">{roleLabel}</p>
            </div>
          </div>
          <button className="cq-signout" type="button" onClick={signOut} title="Sign out">
            <Icon name="logout" size={18} />
            <span className="cq-nav-label">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="cq-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />

      <div className="cq-main">
        <header className="cq-top">
          <button className="cq-menu-btn" type="button" onClick={() => setDrawer(true)} aria-label="Open navigation" aria-expanded={drawer} aria-controls="cq-sidebar">
            <Icon name="menu" />
          </button>
          <span className="cq-top-title">{current?.label || 'CareQueue'}</span>
          <span className="cq-top-sub">{orgName}</span>
          <div className="cq-top-right"><span className="cq-proto">Prototype</span></div>
        </header>
        <main className="cq-page">{children}</main>
      </div>
    </div>
  );
}
