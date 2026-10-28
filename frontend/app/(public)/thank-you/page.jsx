import Link from 'next/link';

export const metadata = {
  title: 'Inquiry Received',
  description: 'Confirmation that a BedAllocation contact inquiry was received.',
  robots: { index: false, follow: false, noarchive: true }
};

export default function ThankYouPage() {
  return <main><section className="confirmation-page"><div className="container narrow"><p className="eyebrow">CONTACT / RECEIVED</p><h1>Thank you for getting in touch.</h1><p>Your inquiry has been recorded for authorized follow-up. Please do not send patient information through the public website.</p><Link className="button button-dark" href="/">Return to the home page</Link></div></section></main>;
}
