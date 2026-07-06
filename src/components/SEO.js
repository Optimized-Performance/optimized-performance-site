import Head from 'next/head';
import { BRAND } from '../lib/brand';

export default function SEO({ title, description, path = '', noindex = false }) {
  // Brand meta from the central Syngyn config — neutral (no SKU names/"peptide").
  // Pages may still pass a cohort-aware `description` to override the default.
  const brand = BRAND;
  const SITE_NAME = brand.siteName;
  const SITE_URL = brand.siteUrl;
  const DEFAULT_DESC = brand.metaDescription;
  const pageTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — ${brand.tagline} | 99% Purity`;
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
      <meta name="theme-color" content="#000000" />
      <link rel="icon" href="/favicon.ico" />
    </Head>
  );
}
