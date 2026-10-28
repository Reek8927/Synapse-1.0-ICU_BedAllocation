import Link from 'next/link';

export const metadata = {
  title: 'Hospital Operations and ICU Bed Coordination',
  description: 'Explore BedAllocation, a multi-hospital operations platform for ICU queue coordination, bed readiness, traceable decisions and AI-assisted report extraction.',
  alternates: { canonical: '/' }
};

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'BedAllocation',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'A hospital operations decision-support prototype for ICU queue coordination, bed readiness and accountable workflows.',
  publisher: { '@type': 'Organization', name: 'Byte Brains' }
};

export default function HomePage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">HOSPITAL OPERATIONS · DECISION SUPPORT</p>
            <h1>More clarity across every ICU bed decision.</h1>
            <p className="hero-description">BedAllocation brings patient observations, ICU waiting queues, bed readiness and allocation recommendations into a traceable workflow for hospital teams.</p>
            <div className="hero-actions">
              <Link className="button button-dark" href="/contact">Discuss your hospital workflow</Link>
              <Link className="button button-outline" href="/features">Explore the platform</Link>
            </div>
            <p className="hero-caption">Built for multi-hospital use. Designed for staff review and confirmation.</p>
          </div>
          <div className="workflow-preview" aria-label="Illustration of the BedAllocation workflow">
            <div className="preview-head">
              <span className="preview-label">OPERATIONS OVERVIEW</span>
              <span className="preview-date">Illustrative view</span>
            </div>
            <div className="preview-metric-row">
              <div><span className="metric-label">ICU queue</span><strong>Priority-based</strong><span className="metric-note">Reviewed by staff</span></div>
              <div><span className="metric-label">Bed status</span><strong>Readiness-aware</strong><span className="metric-note">Available means ready</span></div>
            </div>
            <div className="preview-divider" />
            <p className="preview-label">RECOMMENDATION FLOW</p>
            <div className="preview-step"><span className="step-number">01</span><span><strong>Review observations</strong><small>Latest valid clinical information</small></span><span className="step-status">Input</span></div>
            <div className="preview-step"><span className="step-number">02</span><span><strong>Review queue position</strong><small>Policy and rationale visible</small></span><span className="step-status">Rank</span></div>
            <div className="preview-step"><span className="step-number">03</span><span><strong>Confirm allocation</strong><small>Authorized staff decision</small></span><span className="step-status step-status-strong">Human</span></div>
            <p className="preview-disclaimer">Illustrative product preview. No real patient information.</p>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Platform principles">
        <div className="container trust-strip-inner">
          <span>Tenant-aware workspaces</span><span>Traceable decisions</span><span>Private patient data</span><span>Human-confirmed placement</span>
        </div>
      </section>

      <section className="section-block" aria-labelledby="designed-for-title">
        <div className="container two-column-section">
          <div className="section-lead">
            <p className="eyebrow">01 / THE PLATFORM</p>
            <h2 id="designed-for-title">One coordinated view of the work around a bed.</h2>
          </div>
          <div className="section-body">
            <p>Hospitals need clear operational context when a patient requires reassessment, an ICU bed is being prepared, or a team is reviewing a waiting queue. BedAllocation is being built to bring those updates into one accountable workflow.</p>
            <Link className="inline-link" href="/features">See the planned capabilities <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="section-block section-muted" aria-labelledby="capabilities-title">
        <div className="container">
          <div className="section-heading-row">
            <div><p className="eyebrow">02 / CORE CAPABILITIES</p><h2 id="capabilities-title">Useful information, in context.</h2></div>
            <Link className="inline-link" href="/features">All platform features <span aria-hidden="true">→</span></Link>
          </div>
          <div className="capability-list">
            <article className="capability-row"><span className="capability-index">01</span><div><h3>ICU queue coordination</h3><p>See eligible candidates, priority rationale, observation freshness and changes over time in one structured queue.</p></div><span className="capability-type">Workflow</span></article>
            <article className="capability-row"><span className="capability-index">02</span><div><h3>Bed readiness and availability</h3><p>Distinguish a bed that is ready for admission from one occupied, under preparation or temporarily unavailable.</p></div><span className="capability-type">Operations</span></article>
            <article className="capability-row"><span className="capability-index">03</span><div><h3>AI-assisted report extraction</h3><p>Turn uploaded report images and PDFs into candidate structured fields for authorized staff to verify before use.</p></div><span className="capability-type">Assisted entry</span></article>
            <article className="capability-row"><span className="capability-index">04</span><div><h3>Traceable staff decisions</h3><p>Maintain a record of recommendations, confirmations, overrides and the reasons captured by the team.</p></div><span className="capability-type">Accountability</span></article>
          </div>
        </div>
      </section>

      <section className="section-block" aria-labelledby="principles-title">
        <div className="container principle-grid">
          <div><p className="eyebrow">03 / BUILT WITH GUARDRAILS</p><h2 id="principles-title">A recommendation is a prompt for review, not an order.</h2><p className="section-intro">BedAllocation is being developed as a decision-support prototype. It will not independently diagnose a patient or authorize an ICU placement.</p><Link className="inline-link" href="/for-hospitals">How the workflow is designed <span aria-hidden="true">→</span></Link></div>
          <div className="principle-list"><div><span>01</span><p><strong>Human confirmation</strong><br />Authorized staff confirm final allocation.</p></div><div><span>02</span><p><strong>Freshness visible</strong><br />Missing or stale observations are flagged.</p></div><div><span>03</span><p><strong>Hospital data isolation</strong><br />Each tenant's records are scoped to its workspace.</p></div></div>
        </div>
      </section>

      <section className="cta-section"><div className="container cta-inner"><div><p className="eyebrow">START A CONVERSATION</p><h2>Explore how the workflow could fit your hospital.</h2><p>Tell us about your operational needs. Do not include patient-identifying or clinical information.</p></div><Link className="button button-light" href="/contact">Contact BedAllocation</Link></div></section>
    </main>
  );
}
