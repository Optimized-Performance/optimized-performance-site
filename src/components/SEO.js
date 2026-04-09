import Head from 'next/head';

const SITE_NAME = 'Optimized Performance Peptides';
const SITE_URL = 'https://optimizedperformance.com';
const DEFAULT_DESC = 'Research-grade peptides. 99% purity, third-party tested, US owned & operated. BPC-157, TB-500, GLP-3, Ipamorelin, HGH 191AA, and more. Ships within 24 hours.';

export default function SEO({ title, description, path = '' }) {
  const pageTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Research Peptides | 99% Purity`;
  const pageDesc = description || DEFAULT_DESC;
  const url = `${SITE_URL}${path}`;

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
      <meta name="robots" content="index, follow" />
      <meta name="theme-color" content="#08111A" />
      <link rel="icon" href="/favicon.ico" />
    </Head>
  );
}
