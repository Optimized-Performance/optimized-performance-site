// ============================================================
// Order pricing — THE single source of truth for order totals.
// ============================================================
//
// Why this exists: the discount-stacking SEQUENCE (site sale → GLP-3 BOGO →
// affiliate % → recovery % → alt-pay % → shipping → round) was previously
// hand-coded TWICE — once client-side in pages/checkout.js and once
// server-side in pages/api/orders/create.js — with comments begging the two to
// "mirror exactly." That duplication caused the May 2026 timezone sale-pricing
// bug (client showed a discounted cart, server charged undiscounted). One pure
// function now owns the sequence; both callers delegate to it, so they cannot
// drift. The server remains authoritative by passing server-validated product
// prices; the client passes its cart prices. Same math, different price source.
//
// PURE + deterministic (inject `now` for time-windowed promos) so it is fully
// unit-testable without a DB, a browser, or a clock.

import {
  isMemorialDaySaleActive,
  applyMemorialDiscount,
  calcGlp3Bogo,
  calcVolumeDiscount,
  calcAltPayDiscount,
  ALT_PAY_DISCOUNT_PCT,
  ALT_PAY_DISCOUNT_METHODS,
} from './sale'
import { calcShipping } from './shipping'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export function isAltPayMethod(paymentMethod) {
  return ALT_PAY_DISCOUNT_METHODS.includes(paymentMethod)
}

/**
 * Compute the full order total breakdown.
 *
 * @param {Object}   input
 * @param {Array}    input.lineItems   - [{ id, sku?, price, quantity, isKit? }]
 *                                       price is the per-unit price (cart price
 *                                       client-side; server-validated product
 *                                       price server-side).
 * @param {number}   [input.affiliatePct=0]  - affiliate discount %, pre-validated.
 * @param {number}   [input.recoveryPct=0]    - payment-recovery incentive %, pre-verified.
 * @param {string}   [input.paymentMethod]    - rail; only crypto/zelle get the alt-pay discount.
 * @param {Date}     [input.now=new Date()]   - injectable clock for time-windowed promos.
 * @returns {Object} breakdown — see fields below. `total` is the authoritative
 *                   charge for the given paymentMethod; standardTotal/altPayTotal
 *                   are exposed so the checkout UI can show every rail's price at once.
 */
export function computeOrderTotals({
  lineItems = [],
  affiliatePct = 0,
  recoveryPct = 0,
  paymentMethod = null,
  country = 'US',
  now = new Date(),
} = {}) {
  const items = Array.isArray(lineItems) ? lineItems : []

  // 1) Subtotal from line prices.
  const subtotal = round2(
    items.reduce((sum, it) => sum + (Number(it.price) || 0) * (parseInt(it.quantity, 10) || 0), 0)
  )

  // 2) Site-wide sale (Memorial Day) — applied first so everything else stacks
  //    on the sale-discounted base.
  const saleActive = isMemorialDaySaleActive(now)
  const { discount: memorialDiscount, post: subtotalPostMemorial } = applyMemorialDiscount(subtotal, now)

  // 3) GLP-3 Buy-2-Get-1-Free — dollar discount off the subtotal, before affiliate %.
  const { discount: bogoDiscount, freeVials: bogoFreeVials } = calcGlp3Bogo(
    items.map((it) => ({ id: it.id, price: it.price, quantity: it.quantity })),
    now
  )

  // 3.5) Per-SKU volume/quantity-break discount (replaces the old kit SKUs).
  //      Dollar discount off the subtotal, taken BEFORE the affiliate % so the
  //      two STACK (affiliate % then applies to the volume-reduced subtotal).
  const { discount: volumeDiscount } = calcVolumeDiscount(items)

  const subtotalPostPromos = round2(subtotalPostMemorial - bogoDiscount - volumeDiscount)

  // 4+5) Affiliate % vs house retention % (recovery/replenishment email link).
  //    A recovery token marks a HOUSE ORDER — a reorder / abandoned-cart sale we
  //    recaptured via our OWN email. On a house order the customer gets the
  //    BETTER of their affiliate % or the house %, but the order carries NO
  //    affiliate commission (create.js strips the affiliate_code), so a retention
  //    conversion we drive costs a slightly bigger customer discount instead of a
  //    full commission. With NO recovery token the affiliate % applies normally
  //    and commission is paid as usual — affiliate links / new traffic untouched.
  const affiliatePctNum = Number(affiliatePct) || 0
  const recoveryPctNum = Number(recoveryPct) || 0
  const houseOrder = recoveryPctNum > 0
  const effectiveAffiliatePct = houseOrder ? 0 : affiliatePctNum
  const effectiveRecoveryPct = houseOrder ? Math.max(affiliatePctNum, recoveryPctNum) : 0

  // Affiliate % comes off the post-promo subtotal (mirrors create.js).
  const affiliateDiscount = round2(subtotalPostPromos * (effectiveAffiliatePct / 100))
  const subtotalPostAffiliate = round2(subtotalPostPromos - affiliateDiscount)

  // House retention % off the post-affiliate subtotal (non-zero only on a house
  // order; carries the larger of the affiliate/house % so the customer never
  // gets less than their code would have given).
  const recoveryDiscount = round2(subtotalPostAffiliate * (effectiveRecoveryPct / 100))
  const discountedSubtotal = round2(subtotalPostAffiliate - recoveryDiscount)

  // 6) Shipping — computed on the post-all-discount subtotal (free-ship
  //    threshold + cold-pack surcharge live in lib/shipping). Sale = free ship.
  //    Canada is a flat international rate immune to threshold/sale.
  const shipping = calcShipping({ items, discountedSubtotal, saleActive, country })

  // 7) Alt-pay (crypto/Zelle) discount — applied to the pre-shipping discounted
  //    subtotal. Computed unconditionally for DISPLAY (so the UI can show the
  //    savings on every rail), then only folded into `total` for alt-pay rails.
  const altPayDiscount = round2(discountedSubtotal * (ALT_PAY_DISCOUNT_PCT / 100))

  const standardTotal = round2(discountedSubtotal + shipping.total)
  const altPayTotal = round2(standardTotal - altPayDiscount)
  const total = isAltPayMethod(paymentMethod) ? altPayTotal : standardTotal

  return {
    subtotal,
    saleActive,
    memorialDiscount: round2(memorialDiscount),
    bogoDiscount: round2(bogoDiscount),
    bogoFreeVials,
    volumeDiscount: round2(volumeDiscount),
    affiliatePct: effectiveAffiliatePct,
    affiliateDiscount,
    recoveryPct: effectiveRecoveryPct,
    recoveryDiscount,
    discountedSubtotal,
    shipping, // { base, coldPack, total, hasColdPack, freeShipApplied, saleApplied }
    altPayDiscount,
    altPayPct: ALT_PAY_DISCOUNT_PCT,
    standardTotal,
    altPayTotal,
    total,
  }
}
