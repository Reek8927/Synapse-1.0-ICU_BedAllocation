import Link from 'next/link';
import Logo from '../../_shared/Logo';

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/" aria-label="CareQueue home">
          <span className="brand-mark" aria-hidden="true"><Logo /></span>
          <span className="brand-name">CareQueue</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/features">Platform</Link>
          <Link href="/for-hospitals">For hospitals</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="header-actions">
          <Link className="text-link" href="/login">Staff sign in</Link>
          <Link className="button button-small button-dark" href="/contact">Talk to the team</Link>
        </div>
      </div>
    </header>
  );
}
