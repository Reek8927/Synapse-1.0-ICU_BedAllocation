import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-brand-block">
          <Link className="brand brand-footer" href="/">
            <span className="brand-mark" aria-hidden="true">BA</span>
            <span className="brand-name">BedAllocation</span>
          </Link>
          <p>Hospital operations decision support, designed around transparent workflows and human oversight.</p>
        </div>
        <div className="footer-links-group">
          <span className="footer-label">Explore</span>
          <Link href="/features">Platform features</Link>
          <Link href="/for-hospitals">For hospitals</Link>
          <Link href="/faq">Frequently asked questions</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <div className="footer-links-group">
          <span className="footer-label">Policies</span>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of use</Link>
          <Link href="/login">Staff sign in</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Byte Brains · BedAllocation</span>
        <span>Prototype only. Not clinically validated.</span>
      </div>
    </footer>
  );
}
