import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'BedAllocation | Hospital Operations Decision Support',
    template: '%s | BedAllocation'
  },
  description: 'A hospital operations platform for ICU queue coordination, bed readiness, accountable allocation recommendations and AI-assisted medical report processing.',
  applicationName: 'BedAllocation',
  openGraph: {
    type: 'website',
    siteName: 'BedAllocation',
    title: 'BedAllocation | Hospital Operations Decision Support',
    description: 'Coordinate ICU queues, bed readiness and accountable hospital workflows.',
    images: [{ url: '/images/bedallocation-social.png', width: 1200, height: 630, alt: 'BedAllocation hospital operations platform' }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BedAllocation | Hospital Operations Decision Support',
    description: 'Coordinate ICU queues, bed readiness and accountable hospital workflows.',
    images: ['/images/bedallocation-social.png']
  },
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
