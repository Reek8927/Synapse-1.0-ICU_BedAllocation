
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PatientWorkspace from './PatientWorkspace';
import ICUWorkspace from './ICUWorkspace';

const emptyHospital = { name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' };
const emptyStaff = { name: '', email: '', password: '', role: 'staff' };

export default function DashboardPanel() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [tenants, setTenants] = useState([]);
  const [contactMessages, setContactMessages] = useState([]);
  const [hospitalForm, setHospitalForm] = useState(emptyHospital);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [statusMessage, setStatusMessage] = useState('Loading your secure workspace…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [patientRefreshKey, setPatientRefreshKey] = useState(0);

  async function api(path, options = {}) {
    const headers = {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };

    if (options.method && options.method !== 'GET' && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const response = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });

    const data = response.status === 204
      ? null
      : await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || 'The request could not be completed.');
    }

    return data;
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const csrfResponse = await fetch('/api/auth/csrf', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const csrfData = await csrfResponse.json();

        if (!csrfResponse.ok) {
          throw new Error(csrfData.error || 'Unable to initialize the session.');
        }

        if (active) setCsrfToken(csrfData.csrfToken || '');

        const meResponse = await fetch('/api/auth/me', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const meData = await meResponse.json();

        if (meResponse.status === 401) {
          router.replace('/login');
          return;
        }

        if (!meResponse.ok) {
          throw new Error(meData.error || 'Unable to load the workspace.');
        }

        if (!active) return;

        setUser(meData.user);
        setTenant(meData.tenant);
        setStatusMessage(
          meData.user?.role === 'platform_admin'
            ? 'Your platform administrator session is active.'
            : 'Your hospital session is active. You can register ward patients and record manual observations below.'
        );

        if (meData.user?.role === 'platform_admin') {
          const tenantResponse = await fetch('/api/platform/tenants', {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          const tenantData = await tenantResponse.json();

          if (tenantResponse.ok && active) {
            setTenants(tenantData.tenants || []);
          }

          const contactResponse = await fetch('/api/platform/contact-messages', {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          const contactData = await contactResponse.json();

          if (contactResponse.ok && active) {
            setContactMessages(contactData.messages || []);
          }
        }
      } catch (reason) {
        if (active) {
          setError(reason.message || 'Unable to load the workspace.');
        }
      }
    }

    load();
    return () => { active = false; };
  }, [router]);

  async function createHospital(event) {
    event.preventDefault();
    setError('');
    setStatusMessage('');
    setBusy(true);

    try {
      const data = await api('/api/platform/tenants', {
        method: 'POST',
        body: JSON.stringify(hospitalForm),
      });

      setHospitalForm(emptyHospital);
      setTenants((current) => [data.tenant, ...current]);
      setStatusMessage(
        `Hospital workspace “${data.tenant.name}” created. Share the slug with its administrator securely.`
      );
    } catch (reason) {
      setError(reason.message || 'Unable to create hospital.');
    } finally {
      setBusy(false);
    }
  }

  async function createStaff(event) {
    event.preventDefault();
    setError('');
    setStatusMessage('');
    setBusy(true);

    try {
      await api('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify(staffForm),
      });

      setStaffForm(emptyStaff);
      setStatusMessage(
        'Staff account created for this hospital workspace. Share the initial password through an approved secure channel.'
      );
    } catch (reason) {
      setError(reason.message || 'Unable to create account.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setError('');

    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (reason) {
      setError(reason.message || 'Unable to complete sign out.');
      return;
    }

    router.replace('/login');
    router.refresh();
  }

  const isPlatformAdmin = user?.role === 'platform_admin';
  const isHospitalAdmin = user?.role === 'hospital_admin';
  const isHospitalUser = Boolean(user && !isPlatformAdmin);

  return (
    <main className="dashboard-page">
      <div className="dashboard-header">
        <div className="container dashboard-header-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">BA</span>
            <span className="brand-name">BedAllocation</span>
          </Link>

          <div className="dashboard-user">
            <span>{user ? user.name : 'Loading user'}</span>
            <button
              className="button button-outline button-small"
              type="button"
              onClick={signOut}
              disabled={!user}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="ba-dashboard-shell">
        <aside className="ba-sidebar">
          <Link className="ba-sidebar-brand" href="/">
            <span className="brand-mark">BA</span>
            <span>BedAllocation</span>
          </Link>

          <p className="ba-sidebar-label">WORKSPACE</p>

          <nav className="ba-sidebar-nav" aria-label="Dashboard navigation">
            <a className="ba-nav-link ba-nav-active" href="#overview">
              <span aria-hidden="true">◫</span> Overview
            </a>

            {isPlatformAdmin && (
              <>
                <a className="ba-nav-link" href="#hospital-onboarding">
                  <span aria-hidden="true">＋</span> Hospital onboarding
                </a>
                <a className="ba-nav-link" href="#registered-hospitals">
                  <span aria-hidden="true">▤</span> Hospitals
                </a>
                <a className="ba-nav-link" href="#contact-messages">
                  <span aria-hidden="true">✉</span> Contact messages
                </a>
              </>
            )}

            {isHospitalUser && (
              <>
                <a className="ba-nav-link" href="#icu-workspace">
                  <span aria-hidden="true">▦</span> ICU workflow
                </a>
                <a className="ba-nav-link" href="#patient-workspace">
                  <span aria-hidden="true">♙</span> Patients
                </a>
                {isHospitalAdmin && (
                  <a className="ba-nav-link" href="#team-management">
                    <span aria-hidden="true">♧</span> Team management
                  </a>
                )}
              </>
            )}
          </nav>

          <div className="ba-sidebar-footer">
            <span className="ba-status-dot" />
            <span>Secure workspace</span>
          </div>
        </aside>

        <div className="ba-dashboard-main">
          <div className="container dashboard-content" id="overview">
            <div className="dashboard-title-row">
              <div>
                <p className="eyebrow">PRIVATE WORKSPACE</p>
                <h1>
                  {isPlatformAdmin
                    ? 'Platform administration'
                    : tenant?.name || 'Hospital workspace'}
                </h1>
                <p>
                  {user
                    ? `${user.email} · ${user.role.replaceAll('_', ' ')}`
                    : 'Verifying your session'}
                </p>
              </div>
              <span className="secure-label">Private · No indexing</span>
            </div>

            {error && (
              <p className="form-error dashboard-alert" role="alert">{error}</p>
            )}
            {statusMessage && (
              <p className="status-message" role="status">{statusMessage}</p>
            )}

            {isPlatformAdmin && (
              <>
                <section className="dashboard-panel" id="hospital-onboarding">
                  <div className="dashboard-panel-heading">
                    <p className="eyebrow">01 / TENANT ONBOARDING</p>
                    <h2>Create a hospital workspace</h2>
                    <p>
                      Creates a tenant and its initial hospital administrator.
                      Public self-registration remains disabled.
                    </p>
                  </div>

                  <form className="dashboard-form-grid" onSubmit={createHospital}>
                    <div className="field-group">
                      <label htmlFor="hospital-name">Hospital name</label>
                      <input id="hospital-name" value={hospitalForm.name}
                        onChange={(event) => setHospitalForm({ ...hospitalForm, name: event.target.value })}
                        required minLength={2} maxLength={150} />
                    </div>
                    <div className="field-group">
                      <label htmlFor="hospital-slug">Workspace slug</label>
                      <input id="hospital-slug" value={hospitalForm.slug}
                        onChange={(event) => setHospitalForm({
                          ...hospitalForm,
                          slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                        })}
                        required minLength={3} maxLength={60}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="city-general" />
                    </div>
                    <div className="field-group">
                      <label htmlFor="hospital-admin-name">Initial admin name</label>
                      <input id="hospital-admin-name" value={hospitalForm.adminName}
                        onChange={(event) => setHospitalForm({ ...hospitalForm, adminName: event.target.value })}
                        required minLength={2} maxLength={100} />
                    </div>
                    <div className="field-group">
                      <label htmlFor="hospital-admin-email">Initial admin email</label>
                      <input id="hospital-admin-email" type="email" value={hospitalForm.adminEmail}
                        onChange={(event) => setHospitalForm({ ...hospitalForm, adminEmail: event.target.value })}
                        required maxLength={254} />
                    </div>
                    <div className="field-group">
                      <label htmlFor="hospital-admin-password">Initial admin password</label>
                      <input id="hospital-admin-password" type="password" value={hospitalForm.adminPassword}
                        onChange={(event) => setHospitalForm({ ...hospitalForm, adminPassword: event.target.value })}
                        required minLength={14} maxLength={128} autoComplete="new-password" />
                    </div>
                    <div className="form-action-cell">
                      <button className="button button-dark" type="submit" disabled={busy || !csrfToken}>
                        {busy ? 'Creating…' : 'Create hospital'}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="dashboard-panel" id="registered-hospitals">
                  <div className="dashboard-panel-heading">
                    <p className="eyebrow">02 / HOSPITAL WORKSPACES</p>
                    <h2>Registered tenants</h2>
                    <p>Only workspace-level metadata is displayed here.</p>
                  </div>

                  {tenants.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Hospital</th><th>Workspace slug</th><th>Status</th><th>Created</th></tr>
                        </thead>
                        <tbody>
                          {tenants.map((item) => (
                            <tr key={item.id || item._id}>
                              <td>{item.name}</td>
                              <td><code>{item.slug}</code></td>
                              <td>{item.status}</td>
                              <td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="empty-state">No hospital workspaces have been created yet.</p>
                  )}
                </section>

                <section className="dashboard-panel" id="contact-messages">
                  <div className="dashboard-panel-heading">
                    <p className="eyebrow">03 / PUBLIC INQUIRIES</p>
                    <h2>Contact messages</h2>
                    <p>
                      Business inquiries submitted through the public website.
                      Review before follow-up and do not treat this inbox as a clinical support channel.
                    </p>
                  </div>

                  {contactMessages.length ? (
                    <div className="contact-message-list">
                      {contactMessages.map((item) => (
                        <article className="contact-message-item" key={item.id}>
                          <div className="contact-message-heading">
                            <div>
                              <h3>{item.subject}</h3>
                              <p>
                                {item.name} · {item.email}
                                {item.organization ? ` · ${item.organization}` : ''}
                              </p>
                            </div>
                            <time dateTime={item.createdAt}>
                              {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                            </time>
                          </div>
                          <p>{item.message}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No contact messages have been received.</p>
                  )}
                </section>
              </>
            )}

            {isHospitalAdmin && (
              <section className="dashboard-panel" id="team-management">
                <div className="dashboard-panel-heading">
                  <p className="eyebrow">01 / USER MANAGEMENT</p>
                  <h2>Create a team account</h2>
                  <p>
                    Accounts created here are always assigned to your hospital workspace.
                    Hospital administrators cannot create platform administrators or other hospital administrators.
                  </p>
                </div>

                <form className="dashboard-form-grid" onSubmit={createStaff}>
                  <div className="field-group">
                    <label htmlFor="staff-name">Full name</label>
                    <input id="staff-name" value={staffForm.name}
                      onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })}
                      required minLength={2} maxLength={100} />
                  </div>
                  <div className="field-group">
                    <label htmlFor="staff-email">Work email</label>
                    <input id="staff-email" type="email" value={staffForm.email}
                      onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })}
                      required maxLength={254} />
                  </div>
                  <div className="field-group">
                    <label htmlFor="staff-role">Role</label>
                    <select id="staff-role" value={staffForm.role}
                      onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value })}>
                      <option value="staff">Operations staff</option>
                      <option value="doctor">Doctor</option>
                      <option value="nurse">Nurse</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label htmlFor="staff-password">Initial password</label>
                    <input id="staff-password" type="password" value={staffForm.password}
                      onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })}
                      required minLength={14} maxLength={128} autoComplete="new-password" />
                  </div>
                  <div className="form-action-cell">
                    <button className="button button-dark" type="submit" disabled={busy || !csrfToken}>
                      {busy ? 'Creating…' : 'Create team account'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {user && !isPlatformAdmin && !isHospitalAdmin && (
              <section className="dashboard-panel">
                <p className="eyebrow">YOUR ACCESS</p>
                <h2>Hospital workspace</h2>
                <p>
                  Your account is connected to the {tenant?.name || 'hospital'} workspace.
                  Access to actions is enforced by your assigned role.
                </p>
              </section>
            )}

            {isHospitalUser && (
              <section id="icu-workspace" className="ba-workspace-section">
                <ICUWorkspace
                  csrfToken={csrfToken}
                  role={user.role}
                  onQueueChanged={() => setPatientRefreshKey((value) => value + 1)}
                />
              </section>
            )}

            {isHospitalUser && (
              <section id="patient-workspace" className="ba-workspace-section">
                <PatientWorkspace
                  key={patientRefreshKey}
                  csrfToken={csrfToken}
                  role={user.role}
                />
              </section>
            )}

            <p className="prototype-banner">
              <strong>Prototype status</strong> · This environment is for development
              and synthetic demonstrations. It is not clinically validated.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
