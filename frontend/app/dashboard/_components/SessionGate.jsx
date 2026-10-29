'use client';

import Link from 'next/link';
import { useWorkspace } from '../_lib/workspace';

// Shows the shell only once the session is known, so role-based navigation never flashes.
export default function SessionGate({ children }) {
  const { status, loadError } = useWorkspace();
  if (status === 'ready') return children;
  return (
    <div className="cq-app" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="cq-denied">
        {status === 'error' ? (
          <>
            <h1>We couldn’t open your workspace</h1>
            <p className="cq-panel-sub">{loadError}</p>
            <Link className="cq-btn" href="/login">Go to sign in</Link>
          </>
        ) : (
          <p role="status">Opening your workspace…</p>
        )}
      </div>
    </div>
  );
}
