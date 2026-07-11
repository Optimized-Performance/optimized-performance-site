// Admin-created manual order. For off-platform payments (a customer paid via
// Zelle/Venmo/crypto/cash directly, outside site checkout). Creates a proper
// order row and finalizes it — so the sale is recorded, inventory decrements,
// the affiliate gets credited, and (optionally) the customer gets a
// confirmation email. This is the correct alternative to hand-editing the
// inventory table, which would lose all of that.
//
// Pricing: totals compute from catalog price × qty + affiliate discount + the
// standard shipping calc, EXACTLY like the customer checkout (server-side, so
// the recorded numbers are trustworthy). An optional `priceOverride` lets the
// admin record an arbitrary all-in total (negotiated / comped orders); when
// set it becomes subtotal AND total with shipping/discount zeroed, and
// affiliate commission computes off that override.

import { supabaseAdmin } from '../../../../lib/supabase'
import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit, validateEmail, validateString, validateZip } from '../../../../lib/security'
import { calcShipping } from '../../../../lib/shipping'
import { finalizePaidOrder } from '../../../../lib/payments/finalizeOrder'
import { PAYMENT_STATUS } from '../../../../lib/order-status'
import { generateOrderNumber } from '../../../../lib/order-number'
import { getCatalog } from '../../../../lib/catalog'
import { estimateOrderCogs } from '../../../../lib/takehome-config'

const VALID_METHODS = new Set(['zelle', 'venmo', 'crypto', 'card', 'paypal', 'cash', 'other'])

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 30, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const {
      name, email, address, city, state, zip,
      items, affiliateCode, paymentMethod,
      priceOverride, sendConfirmation = true,
    } = req.body || {}

    if (!validateString(name) || !validateEmail(email) || !validateString(address) ||
        !validateString(city) || !validateString(state, { minLength: 1, maxLength: 50 }) || !validateZip(zip) ||
        !Array.isArray(items) || !items.length || items.length > 50) {
      return res.status(400).json({ error: 'Invalid or missing required fields' })
    }
    if (!VALID_METHODS.has(paymentMethod)) {
      return res.status(400).json({ error: `Invalid paymentMethod (one of: ${[...VALID_METHODS].join(', ')})` })
    }

    // Recompute everything server-side from the catalog — never trust
    // client-supplied prices. Build the full item shape the confirmation
    // email + admin view expect: { id, sku, name, price, quantity, isKit }.
    const products = await getCatalog()
    let subtotal = 0
    const lineItems = []
    const validatedItems = []
    for (const item of items) {
      const product = products.find(p => p.sku === item.sku || p.id === item.id)
      if (!product) {
        return res.status(400).json({ error: `Unknown product: ${item.sku || item.id}` })
      }
      const qty = parseInt(item.quantity) || 0
      if (qty < 1 || qty > 100) {
        return res.status(400).json({ error: `Invalid quantity for ${product.sku}` })
      }
      subtotal += product.price * qty
      lineItems.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        quantity: qty,
        isKit: product.isKit === true,
      })
      validatedItems.push({ isKit: product.isKit === true })
    }

    // Affiliate validation (server-side — drives both customer discount and
    // commission). Manual orders honor the affiliate's standard discount %
    // unless a priceOverride wipes it out.
    let discount = 0
    let validatedAffiliateCode = null
    let validatedCommissionPct = 0
    if (affiliateCode && typeof affiliateCode === 'string') {
      const { data: aff } = await supabaseAdmin
        .from('affiliates')
        .select('code, discount_pct, commission_pct, active')
        .eq('code', affiliateCode.toUpperCase().trim())
        .eq('active', true)
        .maybeSingle()
      if (aff) {
        validatedAffiliateCode = aff.code
        validatedCommissionPct = Number(aff.commission_pct)
        discount = subtotal * (Number(aff.discount_pct) / 100)
      } else {
        return res.status(400).json({ error: `Affiliate code not found or inactive: ${affiliateCode}` })
      }
    }

    // Price model:
    //   override set  → total = override, subtotal = override, shipping 0,
    //                   discount 0 (the override is the all-in amount actually
    //                   paid; affiliate commission computes off it).
    //   no override   → catalog subtotal − affiliate discount + shipping,
    //                   same math as the customer checkout.
    let finalSubtotal, shipping, discountedTotal, total
    const override = priceOverride !== undefined && priceOverride !== null && priceOverride !== ''
      ? Number(priceOverride)
      : null

    if (override !== null) {
      if (!Number.isFinite(override) || override <= 0 || override > 50000) {
        return res.status(400).json({ error: 'Invalid price override' })
      }
      finalSubtotal = override
      shipping = 0
      discount = 0
      total = Math.round(override * 100) / 100
    } else {
      finalSubtotal = subtotal
      discountedTotal = subtotal - discount
      const shippingCalc = calcShipping({ items: validatedItems, discountedSubtotal: discountedTotal, saleActive: false })
      shipping = shippingCalc.total
      total = Math.round((discountedTotal + shipping) * 100) / 100
    }

    if (!Number.isFinite(total) || total <= 0 || total > 50000) {
      return res.status(400).json({ error: 'Invalid order total' })
    }

    const orderNumber = generateOrderNumber()

    // Insert as 'pending' so finalizePaidOrder can transition it (its guard
    // accepts pending/awaiting_payment). Admin-created → trusted, so
    // fraud_status is 'unreviewed' with no velocity check.
    const insertData = {
      order_number: orderNumber,
      customer_name: name,
      customer_email: email,
      shipping_address: address,
      city,
      state,
      zip,
      items: lineItems,
      subtotal: finalSubtotal,
      shipping,
      total,
      // COGS snapshot (v33) — same rule as customer checkout: commission basis
      // is total - shipping - cogs (lib/commission). Vendor cost doesn't change
      // under a priceOverride, so the estimate stays item-based either way.
      cogs: estimateOrderCogs(lineItems).cogs,
      payment_status: PAYMENT_STATUS.PENDING,
      payment_method: paymentMethod,
      fraud_status: 'unreviewed',
      notes: 'Manual order entered by admin',
    }
    if (validatedAffiliateCode) {
      insertData.affiliate_code = validatedAffiliateCode
      insertData.discount = discount
      insertData.affiliate_commission_pct = validatedCommissionPct
    }

    let { error: insertErr } = await supabaseAdmin
      .from('orders')
      .insert(insertData)
    // Missing-column backstop (migration v33 not applied yet): retry once
    // without the COGS snapshot rather than failing the order.
    if (insertErr && /cogs/i.test(insertErr.message || '')) {
      console.warn('[create-manual] insert retry without cogs (migration v33 not applied?):', insertErr.message)
      delete insertData.cogs
      ;({ error: insertErr } = await supabaseAdmin.from('orders').insert(insertData))
    }
    if (insertErr) {
      console.error('[create-manual] insert failed:', insertErr.message)
      return res.status(500).json({ error: insertErr.message })
    }

    // Finalize: marks completed, decrements inventory (kit-aware), credits the
    // affiliate, optionally emails the customer, fires low-stock alerts.
    const result = await finalizePaidOrder({ orderNumber, sendConfirmation: sendConfirmation !== false })
    if (!result.ok) {
      console.error('[create-manual] finalize failed:', result.reason)
      return res.status(500).json({ error: `Order created but finalize failed: ${result.reason}. Check inventory/affiliate manually.`, order_number: orderNumber })
    }

    return res.status(200).json({
      ok: true,
      order_number: orderNumber,
      total,
      affiliate_code: validatedAffiliateCode,
      emailed: sendConfirmation !== false,
    })
  } catch (err) {
    console.error('[create-manual] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
