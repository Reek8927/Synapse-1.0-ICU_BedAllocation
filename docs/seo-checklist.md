# Public Website and SEO Checklist

| Requirement | Status | Notes |
|---|---|---|
| Custom 404 | Implemented | `app/not-found.jsx`. |
| Unique page title | Implemented for current public routes | Root template plus per-page title metadata. |
| Unique meta description | Implemented for current public routes | Review final copy before launch. |
| Social preview image | Implemented | Static 1200 × 630 Open Graph/Twitter image. |
| Alt text | Applicable to images | Decorative brand mark is text/CSS; any added informative image needs meaningful alt text. |
| Internal links | Implemented | Header/footer, contextual feature and FAQ links. |
| Sitemap | Implemented | Lists public pages only; set `NEXT_PUBLIC_SITE_URL` to production HTTPS origin. |
| robots.txt | Implemented | Disallows dashboard/API/login/thank-you; not a security control. |
| HTTPS | Deployment pending | Enable HTTPS on all deployed origins and use secure cookies. |
| Contact form spam protection | Implemented with production gate | Cloudflare Turnstile required to enable production submissions; verify site/secret keys. |
| Thank-you page | Implemented | `noindex`. |
| Google Analytics | Deferred | Add after privacy review; never send patient data, report contents or clinical values. |
| Privacy policy | Draft created | Must reflect the real operator, jurisdiction, providers and data handling before launch. |
| FAQ | Implemented | No FAQ structured data is claimed. |
| Real testimonials | Deliberately omitted | Add only genuine, approved feedback. Never use fabricated testimonials. |
