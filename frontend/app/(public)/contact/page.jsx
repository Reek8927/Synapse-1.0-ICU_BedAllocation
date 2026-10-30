import ContactForm from '../components/ContactForm';

export const metadata = {
  title: 'Contact CareQueue',
  description: 'Contact the CareQueue team about hospital workflows, product information or a platform question. Do not submit patient information.',
  alternates: { canonical: '/contact' }
};

export default function ContactPage() {
  return <main><section className="page-hero"><div className="container narrow"><p className="eyebrow">CONTACT / INQUIRIES</p><h1>Tell us what your hospital needs.</h1><p>Use this form for product and operational questions only. It is not a clinical support channel.</p></div></section><section className="section-block"><div className="container contact-layout"><div className="contact-copy"><p className="eyebrow">BEFORE YOU SEND</p><h2>Keep patient information out of public inquiries.</h2><p>Please do not include patient names, medical record numbers, diagnoses, report images, test results or other confidential clinical data.</p><div className="contact-note"><strong>About the project</strong><p>CareQueue is a hackathon prototype under development. The platform is not clinically validated, and a response to an inquiry does not constitute medical advice.</p></div></div><div className="contact-form-panel"><ContactForm /></div></div></section></main>;
}
