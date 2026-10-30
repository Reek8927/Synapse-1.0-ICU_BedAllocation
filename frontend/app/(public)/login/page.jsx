import LoginForm from '../components/LoginForm';

export const metadata = {
  title: 'Staff Sign In',
  description: 'Secure sign-in for authorized CareQueue hospital and platform users.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/login' }
};

export default function LoginPage() {
  return <main><section className="auth-page"><div className="container auth-layout"><div className="auth-copy"><p className="eyebrow">PRIVATE WORKSPACE</p><h1>Sign in to your hospital workspace.</h1><p>Hospital members must use their workspace slug. Platform administrators can leave the workspace field blank.</p><div className="auth-note"><strong>Restricted access</strong><p>Access to patient data and operational records is controlled by backend authorization and hospital membership.</p></div></div><div className="auth-form-panel"><LoginForm /></div></div></section></main>;
}
