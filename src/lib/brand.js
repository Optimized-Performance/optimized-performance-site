// ============================================================
// Brand constants — Syngyn.
// ============================================================
// Full rebrand from "Optimized Performance" → "Syngyn" (2026-06-22). One brand,
// one storefront on syngyn.co. Centralized here so the placeholders below are
// finalized in ONE place. Imported directly (client + server) — no per-host
// resolution, no context (single brand).
//
// ⚠️ PLACEHOLDERS — Matt finalizes:
//   tagline   — neutral; NOT "peptides"/"compounds"
//   legalName — the entity behind Syngyn (Tris-ownership pending; what boards
//               Whop / the PayPal). Must not be "Optimized Performance Inc."
//   email     — stand up the support inbox
//   phone     — shared OPP line for now; consider a separate number

export const BRAND = {
  name: 'Syngyn',
  siteName: 'Syngyn',
  legalName: 'Syngyn', // ⚠️ set real legal entity
  tagline: 'Analytical Reference Materials', // ⚠️ neutral placeholder
  siteUrl: 'https://syngyn.co',
  coaBaseUrl: 'https://syngyn.co',
  descriptor: 'SYNGYN',
  email: 'support@syngyn.co', // ⚠️ stand up inbox
  phoneDisplay: '+1 (831) 218-5147', // ⚠️ shared for now
  phoneTel: '+18312185147',
  metaDescription:
    'High-purity analytical reference materials for in-vitro laboratory research. Third-party HPLC tested with public COAs. US owned & operated. Ships within 24 hours.',
  footerBlurb:
    'High-purity analytical reference materials for laboratory research. Third-party verified. Shipped from the United States.',
};

export default BRAND;

// Research-framing switch. OFF (default/unset) = the clean lab-supply /
// analytical-reference storefront — the Stripe-approved posture as of
// 2026-07-22: NO age gate, NO RUO/21+/"not for consumption" attestation, NO
// field-of-research requirement, neutral copy throughout. Set
// NEXT_PUBLIC_RESEARCH_MODE=true to bring the research-use framing back (age
// gate, checkout attestation + field-of-research, RUO tags, "research peptide"
// copy) if/when gated research SKUs return to the catalog.
//
// NEXT_PUBLIC_ so the value is identical on client and server — the checkout
// UI and the server-side ack enforcement in /api/orders/create MUST agree, or
// checkout 400s ("Research-use acknowledgment is required") with the UI hidden.
export const RESEARCH_MODE = process.env.NEXT_PUBLIC_RESEARCH_MODE === 'true';
