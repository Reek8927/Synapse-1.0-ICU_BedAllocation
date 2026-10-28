import Link from 'next/link';

export default function NotFound() {
  return <main><section className="confirmation-page"><div className="container narrow"><p className="eyebrow">ERROR / 404</p><h1>This page could not be found.</h1><p>The page may have moved, or the address may be incorrect.</p><Link className="button button-dark" href="/">Go to home</Link></div></section></main>;
}
