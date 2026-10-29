import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const tagline = 'ICU queue and bed coordination with live risk ranking.';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'CareQueue | ICU queue and bed coordination', template: '%s | CareQueue' },
  description: 'CareQueue helps nurses and doctors see which waiting patients need an ICU bed first, using live vitals, lab results and a risk model, with a clinician confirming every placement.',
  applicationName: 'CareQueue',
  openGraph: { type: 'website', siteName: 'CareQueue', title: 'CareQueue | ICU queue and bed coordination', description: tagline },
  twitter: { card: 'summary', title: 'CareQueue', description: tagline },
  icons: { icon: '/favicon.svg' }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
