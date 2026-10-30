'use client';

import { useEffect, useState } from 'react';
import { useWorkspace } from '../_lib/workspace';
import { Empty, Loading, Notices, PageHeader, RoleGate, formatDateTime } from '../_components/ui';

export default function MessagesPage() {
  const { api, isPlatformAdmin } = useWorkspace();
  const [state, setState] = useState({ loading: true, messages: [], error: '' });

  useEffect(() => {
    if (!isPlatformAdmin) return undefined;
    let active = true;
    api('/api/platform/contact-messages')
      .then((data) => active && setState({ loading: false, messages: data.messages || [], error: '' }))
      .catch((reason) => active && setState({ loading: false, messages: [], error: reason.message }));
    return () => { active = false; };
  }, [api, isPlatformAdmin]);

  return (
    <RoleGate allowed={isPlatformAdmin}>
      <PageHeader title="Messages" description="Business inquiries from the public website. This is not a clinical support channel." />
      <Notices error={state.error} />
      {state.loading ? <Loading /> : state.messages.length ? (
        <div className="cq-messages">
          {state.messages.map((item) => (
            <article className="cq-message" key={item.id}>
              <header><h2 style={{ fontSize: 17 }}>{item.subject}</h2><span>{formatDateTime(item.createdAt)}</span></header>
              <p className="cq-who-meta">{item.name} · {item.email}{item.organization ? ` · ${item.organization}` : ''}</p>
              <p style={{ marginTop: 8 }}>{item.message}</p>
            </article>
          ))}
        </div>
      ) : <Empty title="No messages yet">Inquiries from the contact form appear here.</Empty>}
    </RoleGate>
  );
}
