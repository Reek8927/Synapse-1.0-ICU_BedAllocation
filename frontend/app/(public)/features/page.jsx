import Link from 'next/link';

export const metadata = {
  title: 'Platform Features',
  description: 'Explore BedAllocation capabilities for ICU queue coordination, bed readiness, report extraction, audit history and hospital operations analytics.',
  alternates: { canonical: '/features' }
};

const sections = [
  ['01', 'Patient and observation workflow', 'Record patient admission details and observations manually. New valid observations can trigger reassessment. Ward patients do not receive the ICU queue reminder schedule.'],
  ['02', 'ICU eligibility and priority queue', 'Maintain a queue of eligible candidates using a documented policy. Show ranking rationale and observation freshness, and reassess when new observations or capacity changes are recorded.'],
  ['03', 'Bed readiness', 'Track ready, occupied, cleaning, preparation and unavailable states. Only beds marked ready count as immediately available.'],
  ['04', 'AI-assisted medical report extraction', 'Read supported photographs, scanned reports and PDFs into candidate structured fields. Authorized staff review extracted values beside the source before saving them.'],
  ['05', 'Decision and audit history', 'Record key observation changes, queue recommendations, bed-state updates, staff decisions and authorized overrides.'],
  ['06', 'Operations and simulation', 'Provide operational summaries and a separate what-if simulator using synthetic scenarios without changing live allocation records.']
];

export default function FeaturesPage() {
  return <main><section className="page-hero"><div className="container narrow"><p className="eyebrow">PLATFORM / CAPABILITIES</p><h1>Designed around the operational work, not just a prediction.</h1><p>BedAllocation brings several hospital workflow components together while keeping clinical review and final placement with authorized staff.</p></div></section><section className="section-block"><div className="container feature-detail-list">{sections.map(([number, title, body]) => <article className="feature-detail" key={number}><span className="capability-index">{number}</span><div><h2>{title}</h2><p>{body}</p></div></article>)}</div></section><section className="notice-band"><div className="container notice-band-inner"><div><strong>Prototype and clinical safety</strong><p>The platform is not clinically validated. The ML target, queue policy and report extraction must be tested and appropriately reviewed before any real-world clinical use.</p></div><Link className="inline-link" href="/for-hospitals">Read the workflow principles <span aria-hidden="true">→</span></Link></div></section></main>;
}
