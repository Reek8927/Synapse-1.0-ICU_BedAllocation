import './app.css';
import { WorkspaceProvider } from './_lib/workspace';
import Shell from './_components/Shell';
import SessionGate from './_components/SessionGate';

export const metadata = {
  title: 'Workspace',
  description: 'Private CareQueue workspace.',
  robots: { index: false, follow: false, noarchive: true }
};

export default function DashboardLayout({ children }) {
  return (
    <WorkspaceProvider>
      <SessionGate>
        <Shell>{children}</Shell>
      </SessionGate>
    </WorkspaceProvider>
  );
}
