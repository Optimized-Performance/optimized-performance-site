import Head from 'next/head';

const SITE_NAME = 'Optimized Performance Peptides';
const SITE_URL = 'https://optimizedperformancepeptides.com';
// Default description is what unflagged visitors / scrapers see. Deliberately
// omits restricted SKU names (GLP-3, HGH 191AA) so the public-internet meta
// description stays AUP-clean. Pages that need cohort-aware descriptions
// (shop, homepage) pass their own `description` prop derived from the
// resolved cohort flag.
const DEFAULT_DESC = 'Research-grade peptides. 99% average purity, third-party tested, US owned & operated. BPC-157, TB-500, Ipamorelin, MT-2, NAD+, and more. Ships within 24 hours.';

export default function SEO({ title, description, path = '', noindex = false }) {
  const pageTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Research Peptides | 99% Purity`;
  const pageDesc = description || DEFAULT_DESC;
  const url = `${SITE_URL}${path}`;
  // Cohort-gated views (private inquiry pages for unflagged visitors hitting
  // a restricted product URL) opt out of indexing — even if a tokenized URL
  // leaks, search engines won't catalog the SKU page either way.
  const robots = noindex ? 'noindex, nofollow' : 'index, follow';

  return (
    <Head>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDesc} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDesc} />
      <meta property="og:url" content={url} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDesc} />

      {/* Additional */}
      <meta name="robots" content={robots} />
      <meta name="theme-color" content="#08111A" />
      <link rel="icon" href="/favicon.ico" />
    </Head>
  );
}
