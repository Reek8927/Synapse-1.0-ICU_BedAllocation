import Link from 'next/link';

export const metadata = {
  title: 'ICU queue and bed coordination',
  description: 'CareQueue ranks patients waiting for an ICU bed by live risk, reminds staff to re-check vitals every eight minutes, and offers each free bed to the highest-risk patient for a clinician to confirm.',
  alternates: { canonical: '/' }
};

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'CareQueue',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'A hospital decision-support prototype that ranks the ICU waiting queue by risk and supports clinician-confirmed bed allocation.',
  publisher: { '@type': 'Organization', name: 'Byte Brains' }
};

const sampleQueue = [
  { rank: 1, name: 'Patient W-003', note: 'Low blood pressure, low oxygen', score: 0.97, level: 'high', label: 'ICU recommended' },
  { rank: 2, name: 'Patient W-001', note: 'Heart rate and breathing rising', score: 0.92, level: 'high', label: 'ICU recommended' },
  { rank: 3, name: 'Patient W-002', note: 'Fever, raised heart rate', score: 0.59, level: 'medium', label: 'Review for ICU' }
];

export default function HomePage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">ICU queue and bed coordination</p>
            <h1>When one ICU bed opens, know who needs it most.</h1>
            <p className="hero-description">CareQueue re-ranks everyone waiting for an ICU bed each time new vitals or lab results come in. When a bed is ready, it offers that bed to the highest-risk patient, and a doctor confirms.</p>
            <div className="hero-actions">
              <Link className="button button-dark" href="/login">Staff sign in</Link>
              <Link className="button button-outline" href="/features">How the ranking works</Link>
            </div>
            <p className="hero-caption">Decision support for nurses and doctors. A clinician confirms every placement.</p>
          </div>
          <div className="workflow-preview" aria-label="Example of a risk-ranked ICU waiting queue">
            <div className="preview-head">
              <span className="preview-label">Waiting for an ICU bed</span>
              <span className="preview-date">Example data</span>
            </div>
            {sampleQueue.map((row) => (
              <div className="preview-step" key={row.rank}>
                <span className="step-number">{row.rank}</span>
                <span><strong>{row.name}</strong><small>{row.note}</small></span>
                <span className={row.level === 'high' ? 'step-status step-status-strong' : 'step-status'}>{row.score.toFixed(2)} {row.label}</span>
              </div>
            ))}
            <p className="preview-disclaimer">Illustrative example. No real patient information.</p>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Platform principles">
        <div className="container trust-strip-inner">
          <span>Re-ranks on every new reading</span><span>Vitals reminder every 8 minutes</span><span>Separate hospital workspaces</span><span>Clinician-confirmed placement</span>
        </div>
      </section>

      <section className="section-block section-muted" aria-labelledby="capabilities-title">
        <div className="container">
          <div className="section-heading-row">
            <div><h2 id="capabilities-title">What the team sees</h2></div>
            <Link className="inline-link" href="/features">All platform features <span aria-hidden="true">→</span></Link>
          </div>
          <div className="capability-list">
            <article className="capability-row"><span className="capability-index">1</span><div><h3>A ranked waiting queue</h3><p>Each waiting patient has a priority score, an ICU recommendation and the reasons behind it, so the order is never a mystery.</p></div></article>
            <article className="capability-row"><span className="capability-index">2</span><div><h3>Fresh vitals, always</h3><p>Patients whose vitals are more than eight minutes old are flagged, so the queue is ranked on current data.</p></div></article>
            <article className="capability-row"><span className="capability-index">3</span><div><h3>Beds that are actually ready</h3><p>Ready, occupied, cleaning, preparing and unavailable are tracked separately. Only a ready bed can be allocated.</p></div></article>
            <article className="capability-row"><span className="capability-index">4</span><div><h3>Every decision on record</h3><p>Allocations, withdrawals and discharges are saved with who made them and why.</p></div></article>
          </div>
        </div>
      </section>

      <section className="section-block" aria-labelledby="principles-title">
        <div className="container two-column-section">
          <div className="section-lead"><h2 id="principles-title">A recommendation is a prompt for review, not an order.</h2></div>
          <div className="section-body">
            <p>The risk score comes from a research model trained on the public PhysioNet sepsis dataset, combined with a standard early-warning score. It is uncalibrated, it predicts sepsis onset rather than ICU need, and it has not been clinically validated. CareQueue shows it as one input to a clinician&apos;s decision and never admits a patient on its own.</p>
            <Link className="inline-link" href="/faq">Read the limitations <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
