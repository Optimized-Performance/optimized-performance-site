import { getVisibleCatalog } from '../lib/catalog';

const SITE_URL = 'https://syngyn.co';

// Public sitemap. Always omits restricted SKUs (GLP-3, HGH 191AA) — search
// engines never see these URLs regardless of cohort gate state. Keeps the
// public-internet view clean of AUP-flagged products.
//
// Static marketing pages + non-restricted product detail pages are listed.
// /admin, /affiliate, /api are deliberately excluded.

const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/shop', priority: '0.9', changefreq: 'daily' },
  { path: '/faq', priority: '0.6', changefreq: 'monthly' },
  { path: '/shipping', priority: '0.5', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/research-inquiries', priority: '0.4', changefreq: 'monthly' },
];

async function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  // Public-tier only (getVisibleCatalog with no cohort/gated flags) — same set
  // as the old `!p.restricted` filter, now from the DB catalog.
  const products = await getVisibleCatalog({});
  const productEntries = products
    .map((p) => ({
      path: `/products/${p.id}`,
      priority: '0.8',
      changefreq: 'weekly',
    }));

  const all = [...STATIC_PAGES, ...productEntries];
  const urls = all
    .map(
      (e) => `  <url>
    <loc>${SITE_URL}${e.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export default function Sitemap() {
  // Component never renders — the response is written in getServerSideProps.
  return null;
}

export async function getServerSideProps({ res }) {
  const xml = await buildSitemap();
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.write(xml);
  res.end();
  return { props: {} };
}
