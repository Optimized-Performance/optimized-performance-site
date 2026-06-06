const products = [
  {
    id: 'glp3-10mg',
    sku: 'OP-GLP3-10MG',
    name: 'GLP-3',
    dosage: '10mg',
    price: 69.95,
    description: 'Triple agonist GLP peptide (GLP-1 / GIP / Glucagon receptor). Lyophilized powder for research use.',
    category: 'GLPs',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: 'HERO',
    stock: 150,
    restricted: true,
  },
  {
    id: 'glp3-20mg',
    sku: 'OP-GLP3-20MG',
    name: 'GLP-3',
    dosage: '20mg',
    price: 109.95,
    description: 'Triple agonist GLP peptide (GLP-1 / GIP / Glucagon receptor). Lyophilized powder for research use.',
    category: 'GLPs',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: 'HERO',
    stock: 100,
    restricted: true,
  },
  {
    id: 'glp3-10mg-kit',
    sku: 'OP-GLP3-10MG-KIT',
    name: 'GLP-3 Kit (10x10mg)',
    dosage: '100mg total',
    price: 559.95,
    description: '10-vial kit — GLP-3 triple agonist GLP peptide (GLP-1 / GIP / Glucagon), 10mg each. Lyophilized powder for research use.',
    category: 'GLPs',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'glp3-10mg',
    vialCount: 10,
    restricted: true,
  },
  {
    id: 'glp3-20mg-kit',
    sku: 'OP-GLP3-20MG-KIT',
    name: 'GLP-3 Kit (10x20mg)',
    dosage: '200mg total',
    price: 879.95,
    description: '10-vial kit — GLP-3 triple agonist GLP peptide (GLP-1 / GIP / Glucagon), 20mg each. Lyophilized powder for research use.',
    category: 'GLPs',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'glp3-20mg',
    vialCount: 10,
    restricted: true,
  },
  {
    id: 'glp1-10mg',
    sku: 'OP-GLP1-10MG',
    name: 'GLP-1',
    dosage: '10mg',
    price: 74.95,
    description: 'GLP-1 receptor agonist peptide. Lyophilized powder for research use.',
    category: 'GLPs',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: false,
    badge: 'NEW',
    stock: 0,
    restricted: true,
  },
  {
    id: 'glp1-10mg-kit',
    sku: 'OP-GLP1-10MG-KIT',
    name: 'GLP-1 Kit (10x10mg)',
    dosage: '100mg total',
    price: 599.95,
    description: '10-vial kit — GLP-1 receptor agonist, 10mg each. Lyophilized powder for research use.',
    category: 'GLPs',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: false,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'glp1-10mg',
    vialCount: 10,
    restricted: true,
  },
  {
    id: 'bpc-5mg',
    sku: 'OP-BPC-5MG',
    name: 'BPC-157',
    dosage: '5mg',
    price: 29.95,
    description: 'Body Protection Compound-157. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: null,
    stock: 100,
  },
  {
    id: 'bpc-5mg-kit',
    sku: 'OP-BPC-5MG-KIT',
    name: 'BPC-157 Kit (10x5mg)',
    dosage: '50mg total',
    price: 249.95,
    description: '10-vial kit — BPC-157 Body Protection Compound, 5mg each. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'bpc-5mg',
    vialCount: 10,
  },
  {
    id: 'bpc-10mg',
    sku: 'OP-BPC-10MG',
    name: 'BPC-157',
    dosage: '10mg',
    price: 54.95,
    description: 'Body Protection Compound-157. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: null,
    stock: 75,
  },
  {
    id: 'bpc-10mg-kit',
    sku: 'OP-BPC-10MG-KIT',
    name: 'BPC-157 Kit (10x10mg)',
    dosage: '100mg total',
    price: 449.95,
    description: '10-vial kit — BPC-157 Body Protection Compound, 10mg each. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'bpc-10mg',
    vialCount: 10,
  },
  {
    id: 'tb500-5mg',
    sku: 'OP-TB500-5MG',
    name: 'TB-500',
    dosage: '5mg',
    price: 44.95,
    description: 'Thymosin Beta-4 Fragment. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: null,
    stock: 75,
  },
  {
    id: 'tb500-5mg-kit',
    sku: 'OP-TB500-5MG-KIT',
    name: 'TB-500 Kit (10x5mg)',
    dosage: '50mg total',
    price: 374.95,
    description: '10-vial kit — TB-500 Thymosin Beta-4 Fragment, 5mg each. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'tb500-5mg',
    vialCount: 10,
  },
  {
    id: 'tb500-10mg',
    sku: 'OP-TB500-10MG',
    name: 'TB-500',
    dosage: '10mg',
    price: 79.95,
    description: 'Thymosin Beta-4 Fragment. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: null,
    stock: 50,
  },
  {
    id: 'tb500-10mg-kit',
    sku: 'OP-TB500-10MG-KIT',
    name: 'TB-500 Kit (10x10mg)',
    dosage: '100mg total',
    price: 674.95,
    description: '10-vial kit — TB-500 Thymosin Beta-4 Fragment, 10mg each. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'tb500-10mg',
    vialCount: 10,
  },
  {
    id: 'combo-70mg',
    sku: 'OP-COMBO-70MG',
    name: 'BPC + TB + GHK-CU Combo',
    dosage: '70mg',
    price: 79.95,
    description: 'Triple peptide combination — BPC-157, TB-500, and GHK-CU. Lyophilized powder for research use.',
    category: 'Combos',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: 'BUNDLE',
    stock: 40,
  },
  {
    id: 'combo-70mg-kit',
    sku: 'OP-COMBO-70MG-KIT',
    name: 'BPC+TB+GHK Kit (10x70mg)',
    dosage: '700mg total',
    price: 674.95,
    description: '10-vial kit — Triple peptide combination, 70mg each. Lyophilized powder for research use.',
    category: 'Combos',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'combo-70mg',
    vialCount: 10,
  },
  {
    id: 'ipa-5mg',
    sku: 'OP-IPA-5MG',
    name: 'Ipamorelin',
    dosage: '5mg',
    price: 29.95,
    description: 'Selective growth hormone secretagogue. Lyophilized powder for research use.',
    category: 'GH Peptides',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    purity: 98,
    inStock: true,
    badge: null,
    stock: 75,
  },
  {
    id: 'ipa-5mg-kit',
    sku: 'OP-IPA-5MG-KIT',
    name: 'Ipamorelin Kit (10x5mg)',
    dosage: '50mg total',
    price: 249.95,
    description: '10-vial kit — Ipamorelin GH Secretagogue, 5mg each. Lyophilized powder for research use.',
    category: 'GH Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    purity: 98,
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'ipa-5mg',
    vialCount: 10,
  },
  {
    id: 'hgh-10iu',
    sku: 'OP-HGH-10IU-KIT',
    name: 'HGH 191AA',
    dosage: '10IU (Kit of 10)',
    price: 239.95,
    description: '10-vial kit of HGH 191AA (somatropin), 10 IU per vial — 100 IU total per kit. The 191-amino-acid sequence matches the natural human GH structure (vs the synthetic 192aa variant), giving cleaner research signal and lower immunogenicity in published comparisons. Lyophilized powder; reconstitute with bacteriostatic water before research use.',
    category: 'GH Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'HERO',
    stock: 25,
    restricted: true,
    vialCount: 10,
    mw: '22.1 kDa',
    halfLife: '~3-4 hours',
    reconShelfLife: '28 days at 2-8°C',
    expiry: '24 months at -20°C unopened',
    preorderShipDate: '2026-06-12',
  },
  {
    id: 'hgh-24iu',
    sku: 'OP-HGH-24IU-KIT',
    name: 'HGH 191AA',
    dosage: '24IU (Kit of 10)',
    price: 514.95,
    description: 'High-dose tier — 10-vial kit of HGH 191AA (somatropin), 24 IU per vial, 240 IU total per kit. Same 191-amino-acid sequence as the standard kit (matches natural human GH structure vs the synthetic 192aa variant) at a higher per-vial concentration for research requiring larger dosing. Lyophilized powder; reconstitute with bacteriostatic water before research use.',
    category: 'GH Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: false,
    badge: 'NEW',
    stock: 0,
    restricted: true,
    vialCount: 10,
    mw: '22.1 kDa',
    halfLife: '~3-4 hours',
    reconShelfLife: '28 days at 2-8°C',
    expiry: '24 months at -20°C unopened',
  },
  {
    id: 'mt2-5mg',
    sku: 'OP-MT2-5MG',
    name: 'MT-2',
    dosage: '5mg',
    price: 29.95,
    description: 'Melanotan II. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: null,
    stock: 75,
  },
  {
    id: 'mt2-5mg-kit',
    sku: 'OP-MT2-5MG-KIT',
    name: 'MT-2 Kit (10x5mg)',
    dosage: '50mg total',
    price: 249.95,
    description: '10-vial kit — Melanotan II, 5mg each. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'mt2-5mg',
    vialCount: 10,
  },
  {
    id: 'motsc-10mg',
    sku: 'OP-MOTSC-10MG',
    name: 'MOTS-C',
    dosage: '10mg',
    price: 64.99,
    description: 'Mitochondrial-derived peptide (16 amino acids) studied for metabolic regulation. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: false,
    badge: 'COMING SOON',
    stock: 0,
    // No preorderShipDate set → renders "Preorder · ship date TBD".
    // Preorderable by default (preorder !== false), so customers can buy now;
    // the NotifyMe capture on the PDP catches those who'd rather wait.
  },
  {
    id: 'motsc-10mg-kit',
    sku: 'OP-MOTSC-10MG-KIT',
    name: 'MOTS-C Kit (10x10mg)',
    dosage: '100mg total',
    price: 539.95,
    description: '10-vial kit — MOTS-C mitochondrial peptide, 10mg each. Lyophilized powder for research use.',
    category: 'Peptides',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: false,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'motsc-10mg',
    vialCount: 10,
  },
  {
    id: 'nad-500mg',
    sku: 'OP-NAD-500MG',
    name: 'NAD+',
    dosage: '500mg',
    price: 57.95,
    description: 'Nicotinamide adenine dinucleotide. Lyophilized powder for research use.',
    category: 'Supplements',
    format: 'Lyophilized Powder',
    vialSize: '2 mL Vial',
    inStock: true,
    badge: null,
    stock: 50,
  },
  {
    id: 'nad-500mg-kit',
    sku: 'OP-NAD-500MG-KIT',
    name: 'NAD+ Kit (10x500mg)',
    dosage: '5000mg total',
    price: 479.95,
    description: '10-vial kit — NAD+ Nicotinamide Adenine Dinucleotide, 500mg each. Lyophilized powder for research use.',
    category: 'Supplements',
    format: 'Lyophilized Powder',
    vialSize: '10 x 2 mL Vials',
    inStock: true,
    badge: 'BUNDLE',
    isKit: true,
    parentId: 'nad-500mg',
    vialCount: 10,
  },
  {
    id: 'tadalafil-20mg',
    sku: 'OP-TAD-20MG',
    name: 'Tadalafil',
    dosage: '20 mg/mL (30 mL)',
    price: 35.99,
    description: 'Tadalafil oral solution — 20 mg/mL in a 30 mL amber dropper bottle (600 mg total). Long-acting PDE5 inhibitor analog. For in-vitro research and laboratory use only.',
    category: 'Tinctures',
    format: 'Oral Solution',
    vialSize: '30 mL Amber Dropper Bottle',
    inStock: false,
    badge: 'NEW',
    stock: 0,
    restricted: true,
    noCoa: true,
    durableRailsOnly: true,
  },
  {
    id: 'bac-water-10ml',
    sku: 'OP-BAC-10ML',
    name: 'Bacteriostatic Water',
    dosage: '10 mL',
    price: 9.95,
    description: 'Sterile bacteriostatic water (0.9% benzyl alcohol preservative). Used for reconstitution of lyophilized research peptides.',
    category: 'Supplies',
    format: 'Bacteriostatic Solution',
    vialSize: '10 mL Vial',
    inStock: true,
    badge: null,
    stock: 40,
  },
  {
    id: 'bac-water-30ml-hospira',
    sku: 'OP-BAC-30ML',
    name: 'Bacteriostatic Water (Hospira)',
    dosage: '30 mL',
    price: 36.95,
    description: 'Genuine Hospira bacteriostatic water (0.9% benzyl alcohol preservative), 30 mL vial. Pharmaceutical-grade sterile water for reconstitution of lyophilized research peptides.',
    category: 'Supplies',
    format: 'Bacteriostatic Solution',
    vialSize: '30 mL Vial',
    inStock: false,
    badge: 'NEW',
    stock: 0,
  },
];

// Helper: get effective stock for a product (kits derive from parent).
// Deliberately does NOT reference the global `products` array — that ensures
// when this function is imported by client components (shop.js, [id].js),
// Next.js does not pull the full product list (incl. restricted SKU data)
// into the client JS bundle. The static product.stock fallback handles the
// rare case where inventory is missing; for kits, missing parent inventory
// = "out of stock" which is the safe default.
export function getEffectiveStock(product, inventoryMap = {}) {
  if (product.isKit) {
    const parentStock = inventoryMap[product.parentId] ?? 0;
    return Math.floor(parentStock / product.vialCount);
  }
  return inventoryMap[product.id] ?? product.stock ?? 0;
}

// Helper: get vials to deduct from inventory for an order item
export function getInventoryDeductions(product, quantity = 1) {
  if (product.isKit) {
    return [{ productId: product.parentId, vials: product.vialCount * quantity }];
  }
  return [{ productId: product.id, vials: quantity }];
}

// Three-mode restricted-SKU visibility, in priority order:
//
//   1. NEXT_PUBLIC_HIDE_RESTRICTED=true  → hard hide everywhere (kill switch
//      for "Bankful pulled, button up the catalog"). Ignores cohort flag.
//   2. NEXT_PUBLIC_RESTRICTED_FORCE_SHOW=true → show restricted to everyone
//      (kill switch for "durable rails live, gate is redundant"). Ignores
//      cohort flag.
//   3. Default (neither env set) → cohort gate active. The caller
//      (getServerSideProps) reads the cohort cookie via lib/cohort-session
//      and passes `cohortAllowed` here. cohortAllowed=true → restricted
//      visible, false → restricted hidden.
//
// `isRestrictedHidden()` preserved for legacy callers but now means
// "hard-kill mode is on" specifically.
export function isRestrictedHidden() {
  return process.env.NEXT_PUBLIC_HIDE_RESTRICTED === 'true';
}

export function isRestrictedForceShown() {
  return process.env.NEXT_PUBLIC_RESTRICTED_FORCE_SHOW === 'true';
}

// True when restricted SKUs should appear for this request. Used by SSR pages
// to decide what to render. cohortAllowed comes from the signed cookie /
// query token check in lib/cohort-session.
export function shouldShowRestricted(cohortAllowed) {
  if (isRestrictedHidden()) return false;
  if (isRestrictedForceShown()) return true;
  return cohortAllowed === true;
}

// Cohort-aware. Pass cohortAllowed from getServerSideProps after calling
// getCohortFromRequest(context, supabaseAdmin).
export function getVisibleProductsForCohort(cohortAllowed) {
  if (shouldShowRestricted(cohortAllowed)) return products;
  return products.filter((p) => !p.restricted);
}

// Legacy: env-only filter. Kept for any non-SSR callers (none currently in
// this repo, but exported in case external scripts import it).
export function getVisibleProducts() {
  if (!isRestrictedHidden()) return products;
  return products.filter((p) => !p.restricted);
}

// Default inquiry CTA when someone hits a hidden detail page. Prefer
// NEXT_PUBLIC_PRIVATE_INQUIRY_URL (e.g. Telegram invite) when set.
export function getPrivateInquiryUrl() {
  return (
    process.env.NEXT_PUBLIC_PRIVATE_INQUIRY_URL ||
    'mailto:admin@optimizedperformancepeptides.com?subject=Research%20inquiry&body=I%27m%20interested%20in%20a%20research%20inquiry.'
  );
}

// Preorder behavior — opt-out by default.
// A product is preorderable when out of stock UNLESS `preorder: false` is
// explicitly set on it. Set `preorderShipDate: 'YYYY-MM-DD'` per product to
// show a specific estimated ship date; if absent, the UI falls back to "TBD".
export function isPreorderable(product) {
  return product?.preorder !== false;
}

// Format a preorder ship date for customer display, e.g. "Jun 15, 2026".
// Returns null if no date is set so callers can render a TBD fallback.
export function formatPreorderShipDate(product) {
  if (!product?.preorderShipDate) return null;
  try {
    // Parse YYYY-MM-DD as a local date (avoid UTC shift on display)
    const [y, m, d] = product.preorderShipDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export default products;
