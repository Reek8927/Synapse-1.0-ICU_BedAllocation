import Link from 'next/link';

export const metadata = {
  title: 'Frequently Asked Questions',
  description: 'Answers about CareQueue, multi-hospital workspaces, ICU recommendations, risk scoring, data security and the prototype limitations.',
  alternates: { canonical: '/faq' }
};

const faqs = [
  ['What is CareQueue?', 'CareQueue is a hospital decision-support prototype. It ranks patients waiting for an ICU bed by risk, reminds staff to re-check vitals every eight minutes, and offers the next free bed to the highest-ranked patient for a clinician to confirm.'],
  ['Can multiple hospitals use the platform?', 'The platform is being designed as a multi-tenant SaaS application. Each hospital will have its own workspace and server-enforced access boundaries.'],
  ['Does the platform automatically admit a patient to ICU?', 'No. It can present recommendations based on the configured workflow, eligibility policy, bed readiness and available information. Final placement requires confirmation by authorized staff.'],
  ['How is a patient\'s risk calculated?', 'From the latest vitals and lab results. A machine-learning model trained on the public PhysioNet sepsis dataset gives a deterioration score, which is combined with an early-warning score such as NEWS2. The score is uncalibrated and is not a diagnosis.'],
  ['What happens when observations are missing or outdated?', 'The application should flag missing or stale observations. It must not invent readings or change physiological risk simply because time has passed.'],
  ['Does the system connect to hospital monitors today?', 'No. The current version uses manually entered observations and lab results, with a reminder every eight minutes. Device and hospital-record integrations are future work and require appropriate authorization and security review.'],
  ['Is CareQueue clinically validated?', 'No. It is a hackathon decision-support prototype. Its prediction model and clinical policy require appropriate evaluation and review before any real-world clinical use.'],
  ['Should patient information be submitted through the public contact form?', 'No. Do not submit patient names, identifiers, medical reports, diagnoses or any other confidential clinical information through the public contact form.']
];

export default function FAQPage() {
  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) };
  return <main><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} /><section className="page-hero"><div className="container narrow"><p className="eyebrow">HELP / FAQ</p><h1>Questions about the platform.</h1><p>Information about the intended workflow, security boundaries and current prototype limitations.</p></div></section><section className="section-block"><div className="container narrow faq-list">{faqs.map(([question, answer], index) => <details className="faq-item" key={question}><summary><span>{String(index + 1).padStart(2, '0')}</span>{question}</summary><p>{answer}</p></details>)}<div className="faq-contact"><p>Didn't find your answer?</p><Link className="inline-link" href="/contact">Contact the team <span aria-hidden="true">→</span></Link></div></div></section></main>;
}
