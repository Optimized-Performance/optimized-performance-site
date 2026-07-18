// Owner take-home estimate model.
//
// This is a PLANNING ESTIMATE, not accounting. It applies the SOB §3 blended
// margin assumptions to actual paid revenue to show roughly what lands in each
// owner's pocket after restocks and taxes. Two inputs use REAL data — processing
// fees (from the actual rail mix) and restock/COGS (from the vendor price list,
// per SKU) — everything else is a tunable % of gross. Adjust the rates + the
// cost map here; they flow straight to the Analytics "Take-home estimate" panel.

// % of gross revenue — restock / cost of goods FALLBACK for any SKU not in the
// PRODUCT_COST map below (new/unmapped SKUs). Mapped SKUs use real vendor cost.
export const COGS_PCT = 0.10
// % of gross — outbound shipping (pass-through-ish). SOB ~5%.
export const SHIPPING_PCT = 0.05
// % of gross — blended affiliate commission to non-owner coaches. SOB ~5%.
export const COMMISSION_PCT = 0.05
// % of gross — misc operating overhead. SOB ~1.5%.
export const OPS_PCT = 0.015
// Taxes + owner split: DELIBERATELY NOT MODELED (Matt, 2026-07-12). The old
// flat 30% reserve overstated Matt's realistic effective rate (S-corp
// distributions carry no SE tax, QBI applies to non-SSTB e-com, WA has no
// income tax → ~26-28%), per-owner rates differ (Tris's state/bracket are
// his own), and the post-re-cut splits diverge (OPP 65/35, GymThingz 50/50).
// The panel now reports the PRE-TAX pot; allocations get decided from there
// with Jason. If per-owner modeling ever returns, it returns as per-venture
// splits × per-owner effective rates — not one blended constant.

// Processing fee per rail = fraction of THAT rail's revenue.
// NoRamp card = 10% all-in; crypto ~1%; Venmo business ~1.9%; Zelle free.
export const RAIL_FEE_PCT = {
  noramp: 0.10, card: 0.10,
  nowpayments: 0.01, crypto: 0.01,
  venmo: 0.019,
  zelle: 0,
  paypal: 0.0349, // dead rail — retained for historical windows
}
export const RAIL_FEE_DEFAULT = 0.03

// Per-UNIT-AS-SOLD vendor cost (USD), keyed by product id (matches order-item
// id/sku). Single-vial SKUs = vendor box price / 10; kit SKUs (incl. HGH, sold
// as a 10-vial kit) = one full vendor box. Source: business-context/Vendor
// price list.pdf (prices are per box of 10 vials). ESTIMATE — edit when vendor
// prices move. Any SKU missing here falls back to COGS_PCT of its line revenue.
export const PRODUCT_COST = {
  // GLP-3 = Retatrutide (RT10 $54/box, RT20 $90/box)
  'glp3-10mg': 5.40, 'glp3-10mg-kit': 54,
  'glp3-20mg': 9.00, 'glp3-20mg-kit': 90,
  // GLP-1 = Semaglutide (SM10 $32/box)
  'glp1-10mg': 3.20, 'glp1-10mg-kit': 32,
  // BPC-157 (BC5 $27, BC10 $45)
  'bpc-5mg': 2.70, 'bpc-5mg-kit': 27,
  'bpc-10mg': 4.50, 'bpc-10mg-kit': 45,
  // TB-500 (BT5 $54, BT10 $99)
  'tb500-5mg': 5.40, 'tb500-5mg-kit': 54,
  'tb500-10mg': 9.90, 'tb500-10mg-kit': 99,
  // Combo BPC+TB+GHK-Cu (BBG70 $170/box)
  'combo-70mg': 17.00, 'combo-70mg-kit': 170,
  // Ipamorelin (IP5 $26/box)
  'ipa-5mg': 2.60, 'ipa-5mg-kit': 26,
  // MT-2 (ML5 $22/box)
  'mt2-5mg': 2.20, 'mt2-5mg-kit': 22,
  // MOTS-C (MS10 $47/box)
  'motsc-10mg': 4.70, 'motsc-10mg-kit': 47,
  // NAD+ (NJ500 $54/box)
  'nad-500mg': 5.40, 'nad-500mg-kit': 54,
  // HGH 191AA — box of 10 vials. This map is PER-VIAL (HGH now sells per vial,
  // kits retired 7/06), so cost = box price / 10. Both confirmed by Matt
  // HGH sells as a 10-VIAL KIT — the catalog unit IS the kit (retail ~$249.95),
  // so cost = the per-KIT box price, NOT per vial: 10iu $48/kit, 24iu $102/kit
  // (Matt confirmed 2026-07-18). Do NOT divide by 10 — 1 sold unit = 1 kit.
  'hgh-10iu': 48.00, 'hgh-24iu': 102.00,
  // Tadalafil oral solution — in-house fill; rough per-bottle est (confirm)
  'tadalafil-20mg': 3.00,
  // Bac water: 10ml $1.25/vial (Matt confirmed 2026-07-18); Hospira 30ml domestic ~$18 est (confirm)
  'bac-water-10ml': 1.25, 'bac-water-30ml-hospira': 18.00,
  // 2026-07-18 vendor order — injectables PER-VIAL (box ÷ 10):
  'glp3-30mg': 6.50, 'glp3-50mg': 20.00, 'tirzepatide-20mg': 6.80,
  'mt1-10mg': 4.00, 'glutathione-1500mg': 6.00, '5amino1mq-5mg': 3.00,
  'hcg-2000iu': 5.70,
  // SARMs + enclomiphene — sold as 30-ct bottles, so cost is PER-BOTTLE
  // ($/tab × 30 + ~$0.50 packaging):
  'enclo-125': 19.70, 'mk677-10mg': 13.10, 'rad140-10mg': 14.90,
  'cardarine-10mg': 12.50, 'yk11-10mg': 26.00,
  // Ancillary tablets — keyed by SKU (added via admin; per-30ct-bottle cost =
  // $/100ct × 30 + ~$0.50 pkg). Vendor: Tamox $22/100, Anas $21/100, Telmi $28/100.
  'OP-TAM-20MG-30CT': 7.10, 'OP-ANA-1MG-30CT': 6.80, 'OP-TEL-40MG-30CT': 8.90,
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Sum estimated COGS across order items. Known ids use PRODUCT_COST (real vendor
// cost); unmapped ids fall back to COGS_PCT of their line revenue so the estimate
// never silently under-counts. coveredRev = revenue whose COGS came from the map.
export function estimateOrderCogs(items = []) {
  let cogs = 0
  let coveredRev = 0
  let totalRev = 0
  for (const it of Array.isArray(items) ? items : []) {
    const qty = Number(it.quantity) || 1
    const line = (Number(it.price) || 0) * qty
    totalRev += line
    const unit = PRODUCT_COST[it.id] ?? PRODUCT_COST[it.sku]
    if (unit != null) { cogs += unit * qty; coveredRev += line }
    else { cogs += line * COGS_PCT }
  }
  return { cogs: r2(cogs), coveredRev: r2(coveredRev), totalRev: r2(totalRev) }
}

// ─── GymThingz (apparel venture, same Matt/Tris 50/50) ─────────────────────
// Facts (gross, rail mix, real accrued affiliate commission) come from
// GymThingz's /api/partner/revenue feed; these rates cover what that endpoint
// can't know. Apparel economics, so its own numbers — tune here.
export const GYMTHINGZ = {
  // Real blended ratio from Matt (2026-07-07): $31,250 total inventory cost
  // against $135,750 sell-through revenue = 23.0% of retail.
  COGS_PCT: 0.23,     // blanks + printing, % of gross
  SHIPPING_PCT: 0.08, // outbound apparel shipping, % of gross
  OPS_PCT: 0.015,     // misc overhead, % of gross
  // Plain Stripe (clean apparel MCC) ≈ 2.9% + 30¢; Venmo business ~1.9%.
  RAIL_FEE_PCT: { stripe: 0.03, venmo: 0.019 },
  RAIL_FEE_DEFAULT: 0.03,
}

// GymThingz venture net from the partner-revenue summary. Commission is the
// REAL accrued affiliate $ (not a % guess); processing uses its actual rail
// mix. Returns a venture object computeTakeHome rolls into the combined pot.
export function computeGymthingzNet(sum) {
  const gross = Number(sum?.gross) || 0
  let processing = 0
  for (const r of Array.isArray(sum?.rail_mix) ? sum.rail_mix : []) {
    const rate = GYMTHINGZ.RAIL_FEE_PCT[String(r.method || '').toLowerCase()] ?? GYMTHINGZ.RAIL_FEE_DEFAULT
    processing += (Number(r.revenue) || 0) * rate
  }
  const cogs = gross * GYMTHINGZ.COGS_PCT
  const shipping = gross * GYMTHINGZ.SHIPPING_PCT
  const ops = gross * GYMTHINGZ.OPS_PCT
  const commissions = Number(sum?.affiliate_commission) || 0
  const preTaxNet = gross - processing - cogs - shipping - commissions - ops
  return {
    name: 'GymThingz',
    gross: r2(gross),
    orders: Number(sum?.orders) || 0,
    deductions: { cogs: r2(cogs), shipping: r2(shipping), processing: r2(processing), commissions: r2(commissions), ops: r2(ops) },
    preTaxNet: r2(preTaxNet),
  }
}

// revenue: gross paid revenue for the window.
// railMix: [{ method, revenue }] from the analytics rail-mix aggregation.
// opts.cogs: real per-SKU COGS total (from estimateOrderCogs). If omitted, COGS
//   falls back to a flat COGS_PCT of gross.
// opts.cogsCoverage: 0..1, share of item revenue costed from the vendor map
//   (for the panel to note how "real" the restock figure is).
// opts.ventures: [{ name, gross, preTaxNet, ... }] — other 50/50 ventures
//   (e.g. computeGymthingzNet). Tax and the owner split apply to the COMBINED
//   pre-tax net, so a venture running negative offsets correctly.
export function computeTakeHome(revenue, railMix = [], opts = {}) {
  const gross = Number(revenue) || 0

  // Processing from the ACTUAL rail mix, not a flat guess.
  let processing = 0
  for (const r of railMix) {
    const rate = RAIL_FEE_PCT[String(r.method || '').toLowerCase()] ?? RAIL_FEE_DEFAULT
    processing += (Number(r.revenue) || 0) * rate
  }

  const hasRealCogs = typeof opts.cogs === 'number'
  const cogs = hasRealCogs ? opts.cogs : gross * COGS_PCT
  const shipping = gross * SHIPPING_PCT
  const commissions = gross * COMMISSION_PCT
  const ops = gross * OPS_PCT

  const preTaxNet = gross - processing - cogs - shipping - commissions - ops

  // Roll other ventures into the pot. With no ventures this collapses exactly
  // to the Syngyn-only math. The pot stays PRE-TAX and UNSPLIT (see the note
  // on taxes/owner split above).
  const ventures = Array.isArray(opts.ventures) ? opts.ventures.filter(Boolean) : []
  const combinedPreTax = preTaxNet + ventures.reduce((s, v) => s + (Number(v.preTaxNet) || 0), 0)
  const combinedGross = gross + ventures.reduce((s, v) => s + (Number(v.gross) || 0), 0)

  return {
    gross: r2(gross),
    deductions: {
      cogs: r2(cogs),
      shipping: r2(shipping),
      processing: r2(processing),
      commissions: r2(commissions),
      ops: r2(ops),
    },
    cogsBasis: hasRealCogs ? 'vendor' : 'flat',
    cogsCoverage: typeof opts.cogsCoverage === 'number' ? r2(opts.cogsCoverage * 100) : null,
    preTaxNet: r2(preTaxNet), // Syngyn-only detail line
    ventures,
    combinedGross: r2(combinedGross),
    combinedPreTax: r2(combinedPreTax),
    preTaxMarginPct: gross ? r2((preTaxNet / gross) * 100) : 0, // Syngyn-only
    combinedPreTaxMarginPct: combinedGross ? r2((combinedPreTax / combinedGross) * 100) : 0,
    rates: { cogs: COGS_PCT, shipping: SHIPPING_PCT, commission: COMMISSION_PCT, ops: OPS_PCT },
  }
}
