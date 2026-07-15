// Admin order edit — change the items on an existing order (add/remove/qty),
// recompute the authoritative total server-side, adjust inventory + affiliate
// credit for the delta, and — if the new total exceeds what's been paid —
// invoice the difference (a NoRamp card pay-link for just the balance) and flip
// the order to balance_due until it's collected.
//
// Money model (v31): `total` = current authoritative total; `amount_paid` =
// what's actually been collected. balance = total - amount_paid. A per-line
// `comp` flag zeroes that line's price (the "add it for free" case) — the item
// still decrements inventory, it just doesn't cost anything.
//
// Inventory/affiliate side effects only apply to ALREADY-FINALIZED orders
// (completed / balance_due), which decremented + credited at their original
// finalize. A still-unpaid pending order just gets new items/total; finalize
// will handle inventory + commission on the new total when it's marked paid.

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit } from '../../../../lib/security'
import { computeOrderTotals } from '../../../../lib/pricing'
import { getCatalog } from '../../../../lib/catalog'
import { calcCommission } from '../../../../lib/commission'
import { estimateOrderCogs } from '../../../../lib/takehome-config'
import { PAYMENT_STATUS, assertPaymentTransition } from '../../../../lib/order-status'
import { createCheckoutSession } from '../../../../lib/payments/cardProcessor'
import { sendBalanceDueEmail } from '../../../../lib/customer-emails'
import { RECOVERY_DISCOUNT_PCT } from '../../../../lib/recovery-config'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const EDITABLE = new Set([PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.BALANCE_DUE, PAYMENT_STATUS.PENDING])
const BALANCE_METHODS = new Set(['card', 'zelle', 'venmo', 'crypto', 'cash', 'other'])

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

// Map an item list to per-inventory-SKU deduct quantities (kit-aware: a kit
// deducts vialCount units of its parent SKU). Mirrors finalizeOrder's logic so
// the edit delta lines up exactly with what the original finalize decremented.
function deductMap(items, products) {
  const m = new Map()
  for (const it of Array.isArray(items) ? items : []) {
    const product = products.find((p) => p.sku === it.sku || p.id === it.id)
    const isKit = product?.isKit
    const parent = isKit ? products.find((p) => p.id === product.parentId) : null
    const deductSku = isKit ? parent?.sku : (product?.sku || it.sku)
    const deductQty = (isKit ? (product?.vialCount || 1) : 1) * (Number(it.quantity) || 0)
    if (!deductSku || !deductQty) continue
    m.set(deductSku, (m.get(deductSku) || 0) + deductQty)
  }
  return m
}

// Positive delta = decrement (race-safe RPC, fallback read-modify-write).
// Negative delta = restore removed units (plain increment; adding stock back
// isn't subject to the oversell race a decrement is).
async function applyInventoryDelta(deductSku, delta) {
  if (!deductSku || !delta) return
  if (delta > 0) {
    try {
      const { error } = await supabaseAdmin.rpc('decrement_inventory', { p_sku: deductSku, p_qty: delta })
      if (error) throw error
    } catch {
      const { data: row } = await supabaseAdmin.from('inventory').select('stock').eq('sku', deductSku).single()
      if (row) await supabaseAdmin.from('inventory').update({ stock: Math.max(0, (row.stock || 0) - delta) }).eq('sku', deductSku)
    }
  } else {
    const { data: row } = await supabaseAdmin.from('inventory').select('stock').eq('sku', deductSku).single()
    if (row) await supabaseAdmin.from('inventory').update({ stock: (row.stock || 0) + (-delta) }).eq('sku', deductSku)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const { id, order_number, items, chargeMethod = 'card', sendInvoice = true } = req.body || {}
    if (!id && !order_number) return res.status(400).json({ error: 'Missing order id or order_number' })
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      return res.status(400).json({ error: 'items must be a non-empty array (max 50). To empty an order, refund/cancel it instead.' })
    }
    if (!BALANCE_METHODS.has(chargeMethod)) {
      return res.status(400).json({ error: `Invalid chargeMethod (one of: ${[...BALANCE_METHODS].join(', ')})` })
    }

    // Load the order.
    let q = supabaseAdmin.from('orders').select('*')
    q = id ? q.eq('id', id) : q.eq('order_number', String(order_number).trim().toUpperCase())
    const { data: order, error: fetchErr } = await q.maybeSingle()
    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' })

    if (!EDITABLE.has(order.payment_status)) {
      return res.status(409).json({
        error: `Order payment_status is "${order.payment_status}" — not editable. Editable: completed, balance_due, pending. ` +
          `(awaiting_payment is mid-capture; let it complete or abandon first. refunded/abandoned are terminal.)`,
      })
    }

    // Rebuild line items server-side from the catalog — never trust client
    // prices. A per-line `comp: true` forces price 0 (the "add it free" path);
    // otherwise the catalog price is authoritative.
    const products = await getCatalog()
    const newItems = []
    for (const raw of items) {
      const product = products.find((p) => p.id === raw.id || p.sku === raw.sku)
      if (!product) return res.status(400).json({ error: `Unknown SKU: ${raw.sku || raw.id}` })
      const qty = parseInt(raw.quantity, 10)
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
        return res.status(400).json({ error: `Invalid quantity for ${product.sku}` })
      }
      const comp = !!raw.comp
      newItems.push({
        id: product.id,
        sku: product.sku,
        name: product.dosage ? `${product.name} ${product.dosage}` : product.name,
        price: comp ? 0 : Number(product.price),
        quantity: qty,
        isKit: !!product.isKit,
        ...(comp ? { comp: true } : {}),
      })
    }

    // Recompute totals with the SAME discount context the order carried, so the
    // new total is consistent with how it was originally priced.
    let affiliatePct = 0
    let recoveryPct = 0
    if (Number(order.recovery_discount) > 0) {
      recoveryPct = RECOVERY_DISCOUNT_PCT
    } else if (order.affiliate_code) {
      const { data: aff } = await supabaseAdmin.from('affiliates').select('discount_pct').eq('code', order.affiliate_code).single()
      affiliatePct = Number(aff?.discount_pct || 0)
    }
    const totals = computeOrderTotals({
      lineItems: newItems,
      affiliatePct,
      recoveryPct,
      paymentMethod: order.payment_method,
      // Keep the destination's shipping rule — editing a Canadian order must
      // recompute with the $50 flat, not the US table (v34).
      country: order.country || 'US',
      // Preserve the order's chosen speed tier so an item edit doesn't silently
      // re-rate shipping to the default (v36; NULL → default handled in calc).
      shippingMethod: order.shipping_method || 'twoday',
    })
    const newTotal = totals.total
    const newShipping = totals.shipping.total
    // COGS snapshot follows the edited cart (v33) — but ONLY on orders that
    // already carry one. Pre-cutover orders (cogs NULL) stay NULL so their
    // commission basis remains the legacy total - shipping; an edit must not
    // retroactively move an order onto the new basis.
    const newCogs = order.cogs == null ? null : estimateOrderCogs(newItems).cogs

    // ── money + status ───────────────────────────────────────────────────────
    const finalized = order.payment_status === PAYMENT_STATUS.COMPLETED || order.payment_status === PAYMENT_STATUS.BALANCE_DUE
    // A finalized order is fully paid by definition; if amount_paid is somehow
    // unset (pre-v31 order the backfill missed), treat it as the total so an edit
    // never mistakes a paid order for unpaid and over-invoices. balance_due
    // orders always carry a real amount_paid written by the prior edit.
    const amountPaid = Number(order.amount_paid || 0) || (finalized ? Number(order.total || 0) : 0)
    let newStatus = order.payment_status
    let balance = 0
    let refundOwed = 0
    if (finalized) {
      if (newTotal > amountPaid + 0.01) {
        balance = round2(newTotal - amountPaid)
        newStatus = PAYMENT_STATUS.BALANCE_DUE
      } else if (newTotal + 0.01 < amountPaid) {
        refundOwed = round2(amountPaid - newTotal)
        newStatus = PAYMENT_STATUS.COMPLETED
      } else {
        newStatus = PAYMENT_STATUS.COMPLETED
      }
    }

    // ── inventory delta (finalized orders only — already decremented) ─────────
    if (finalized) {
      const oldMap = deductMap(order.items, products)
      const newMap = deductMap(newItems, products)
      for (const sku of new Set([...oldMap.keys(), ...newMap.keys()])) {
        const delta = (newMap.get(sku) || 0) - (oldMap.get(sku) || 0)
        if (delta !== 0) await applyInventoryDelta(sku, delta)
      }
    }

    // ── affiliate credit delta (finalized + attributed only) ──────────────────
    if (finalized && order.affiliate_code) {
      const pct = Number(order.affiliate_commission_pct || 0)
      const oldComm = calcCommission({ total: order.total, shipping: order.shipping, cogs: order.cogs, affiliate_commission_pct: pct })
      const newComm = calcCommission({ total: newTotal, shipping: newShipping, cogs: newCogs, affiliate_commission_pct: pct })
      const commDelta = round2(newComm - oldComm)
      const revDelta = round2(newTotal - Number(order.total || 0))
      if (commDelta !== 0 || revDelta !== 0) {
        const { data: aff } = await supabaseAdmin
          .from('affiliates').select('id, total_revenue, total_commission').eq('code', order.affiliate_code).single()
        if (aff) {
          await supabaseAdmin.from('affiliates').update({
            total_revenue: round2(Number(aff.total_revenue || 0) + revDelta),
            total_commission: round2(Number(aff.total_commission || 0) + commDelta),
            updated_at: new Date().toISOString(),
          }).eq('id', aff.id)
        }
      }
    }

    // ── build the order update ────────────────────────────────────────────────
    const historyEntry = {
      at: new Date().toISOString(),
      before: { items: order.items, total: Number(order.total || 0), amount_paid: amountPaid, payment_status: order.payment_status },
      after: { items: newItems, total: newTotal, payment_status: newStatus },
      balance,
      refund_owed: refundOwed,
    }
    const update = {
      items: newItems,
      subtotal: totals.subtotal,
      discount: totals.affiliateDiscount,
      recovery_discount: totals.recoveryDiscount,
      shipping: newShipping,
      total: newTotal,
      // Only written when the order already carries a snapshot (see newCogs
      // above) — also keeps this update column-safe before migration v33 runs.
      ...(newCogs == null ? {} : { cogs: newCogs }),
      edit_history: [...(Array.isArray(order.edit_history) ? order.edit_history : []), historyEntry],
      updated_at: new Date().toISOString(),
    }
    if (newStatus !== order.payment_status) {
      assertPaymentTransition(order.payment_status, newStatus)
      update.payment_status = newStatus
    }
    // Judgment call: a lower total after edit = refund owed → FLAG for manual
    // action (never auto-refund).
    if (refundOwed > 0) {
      const reasons = Array.isArray(order.fraud_reasons) ? order.fraud_reasons : []
      const reason = `Refund owed after edit: $${refundOwed.toFixed(2)}`
      update.fraud_reasons = reasons.includes(reason) ? reasons : [...reasons, reason]
      if (order.fraud_status !== 'blocked') update.fraud_status = 'flagged'
    }

    // ── balance invoice (card = a NoRamp pay-link for just the difference) ─────
    let invoiceUrl = null
    if (balance > 0 && chargeMethod === 'card') {
      const site = process.env.NEXT_PUBLIC_SITE_URL || ''
      const addr = order.shipping_address || {}
      const session = await createCheckoutSession({
        orderNumber: order.order_number,
        amountCents: Math.round(balance * 100),
        currency: 'USD',
        customer: {
          name: order.customer_name || '',
          email: order.customer_email || '',
          address: addr.address || addr.street || '',
          city: addr.city || '',
          state: addr.state || '',
          zip: addr.zip || addr.postcode || '',
        },
        returnUrl: `${site}/?balance_paid=${encodeURIComponent(order.order_number)}`,
        cancelUrl: `${site}/`,
      })
      invoiceUrl = session.redirectUrl
      if (session.sessionId) update.card_session_id = session.sessionId
    }

    const { error: upErr } = await supabaseAdmin.from('orders').update(update).eq('id', order.id)
    if (upErr) {
      console.error('[orders/edit] update failed:', upErr)
      return res.status(500).json({ error: upErr.message })
    }

    if (balance > 0 && chargeMethod === 'card' && invoiceUrl && sendInvoice) {
      await sendBalanceDueEmail({ ...order, ...update }, { balance, payUrl: invoiceUrl }).catch((e) => {
        console.error('[orders/edit] balance email failed:', e?.message)
      })
    }

    let message
    if (balance > 0) {
      message = chargeMethod === 'card'
        ? `Order updated. $${balance.toFixed(2)} balance invoice ${sendInvoice && invoiceUrl ? 'emailed to the customer' : 'created'}.`
        : `Order updated. $${balance.toFixed(2)} balance due — collect via ${chargeMethod}, then click "Mark balance paid".`
    } else if (refundOwed > 0) {
      message = `Order updated. $${refundOwed.toFixed(2)} refund owed — flagged for you to process on your processor.`
    } else {
      message = 'Order updated.'
    }

    return res.status(200).json({
      ok: true,
      order_number: order.order_number,
      newTotal,
      amountPaid,
      balance,
      refundOwed,
      payment_status: newStatus,
      invoiceUrl,
      message,
    })
  } catch (err) {
    console.error('[orders/edit] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
