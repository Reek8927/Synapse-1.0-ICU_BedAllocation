const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

export default function sitemap() {
  const pages = [
    ['', 'weekly', 1],
    ['/features', 'monthly', 0.8],
    ['/for-hospitals', 'monthly', 0.8],
    ['/faq', 'monthly', 0.6],
    ['/contact', 'yearly', 0.5],
    ['/privacy', 'yearly', 0.3],
    ['/terms', 'yearly', 0.3]
  ];
  return pages.map(([path, changeFrequency, priority]) => ({
    url: `${siteUrl}${path || '/'}`,
    lastModified: new Date(),
    changeFrequency,
    priority
  }));
}
