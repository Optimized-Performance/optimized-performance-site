import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString, validateZip } from '../../../lib/security'
import { createCheckoutSession } from '../../../lib/payments/cardProcessor'
import { createCryptoCheckoutSession } from '../../../lib/payments/cryptoProcessor'
import { createPaypalCheckoutSession } from '../../../lib/payments/paypalProcessor'
import { runVelocityChecks, extractClientIP } from '../../../lib/fraud-checks'
import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { calcShipping } from '../../../lib/shipping'
import { sendZelleInstructions, sendVenmoInstructions } from '../../../lib/alerts'
import { isMemorialDaySaleActive, applyMemorialDiscount, MEMORIAL_DAY_DISCOUNT_PCT, calcGlp3Bogo, calcAltPayDiscount } from '../../../lib/sale'

function generateOrderNumber() {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `OP-${y}${m}${d}-${rand}`
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://optimizedperformancepeptides.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })

  try {
    const { name, email, address, city, state, zip, items, affiliateCode, researchUseAck, researchField, paymentMethod } = req.body

    if (!validateString(name) || !validateEmail(email) || !validateString(address) ||
        !validateString(city) || !validateString(state, { minLength: 1, maxLength: 50 }) || !validateZip(zip) ||
        !Array.isArray(items) || !items.length || items.length > 50) {
      return res.status(400).json({ error: 'Invalid or missing required fields' })
    }

    if (paymentMethod !== 'card' && paymentMethod !== 'crypto' && paymentMethod !== 'zelle' && paymentMethod !== 'venmo' && paymentMethod !== 'paypal') {
      return res.status(400).json({ error: 'Invalid paymentMethod (must be "card", "crypto", "zelle", "venmo", or "paypal")' })
    }

    // Card rail is gated behind NEXT_PUBLIC_CARD_ENABLED so it can be flipped
    // off the moment a processor terminates (Bankful 2026-05-12) and back on
    // when a new card rail closes. Server-side check defends against direct
    // API hits even when the UI button is hidden.
    if (paymentMethod === 'card' && process.env.NEXT_PUBLIC_CARD_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Card payments are temporarily unavailable. Please use crypto, Zelle, or Venmo.' })
    }

    if (paymentMethod === 'paypal' && process.env.NEXT_PUBLIC_PAYPAL_ENABLED !== 'true') {
      return res.status(503).json({ error: 'PayPal payments are temporarily unavailable.' })
    }

    // Account-required-to-purchase (NEXT_PUBLIC_REQUIRE_ACCOUNT). When on, a
    // valid customer session cookie is required server-side — defends the gate
    // against direct API hits even if the UI is bypassed.
    if (process.env.NEXT_PUBLIC_REQUIRE_ACCOUNT === 'true' && !getCustomerIdFromReq(req)) {
      return res.status(401).json({ error: 'Please sign in to complete your purchase.' })
    }

    // Research-use acknowledgment (RUO + 21+ + no-consumption) must be explicitly confirmed.
    // This is enforced server-side so the audit trail survives any client tampering —
    // required for high-risk payment processor underwriting. Checked before DB so the
    // server rejects bad requests without touching backend resources.
    if (researchUseAck !== true) {
      return res.status(400).json({ error: 'Research-use acknowledgment is required.' })
    }

    // Research-field declaration (parity with the ack — survives client tampering
    // for the underwriting audit trail). Allowed list mirrors RESEARCH_FIELDS in
    // src/pages/checkout.js; keep the two in sync.
    const ALLOWED_RESEARCH_FIELDS = ['Pharmacology', 'Molecular Biology', 'Medicinal Chemistry', 'Biochemistry', 'Clinical Research', 'Other']
    if (!ALLOWED_RESEARCH_FIELDS.includes(researchField)) {
      return res.status(400).json({ error: 'A valid field of research is required.' })
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // SERVER-SIDE CALCULATION: recalculate totals from cart items to prevent tampering
    const products = require('../../../data/products').default
    let subtotal = 0
    // Track isKit per line so the shipping calc can detect cold-pack carts
    // server-side without trusting the client-supplied flag.
    const validatedItems = []
    // Server-validated line list for the GLP-3 B2G1 calc — uses PRODUCT price
    // (not the client-supplied price) so the promo can't be tampered with.
    const bogoItems = []
    for (const item of items) {
      const product = products.find(p => p.sku === item.sku || p.id === item.id)
      if (!product) {
        return res.status(400).json({ error: `Unknown product: ${item.sku || item.id}` })
      }
      const qty = parseInt(item.quantity) || 0
      if (qty < 1 || qty > 100) {
        return res.status(400).json({ error: 'Invalid item quantity' })
      }
      subtotal += product.price * qty
      validatedItems.push({ isKit: product.isKit === true })
      bogoItems.push({ id: product.id, price: product.price, quantity: qty })
    }

    // Validate affiliate code server-side (cannot trust client-supplied discount/commission)
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
      }
    }

    // Memorial Day sale (or any future site-wide sale): apply BEFORE affiliate
    // discount so the affiliate stacks multiplicatively (their % comes off the
    // sale-discounted price, not original retail). Affiliate commission is
    // calculated on amount-actually-paid downstream, which is the standard
    // commission model and stays consistent here.
    const saleActive = isMemorialDaySaleActive()
    const { discount: memorialDiscount, post: subtotalPostMemorial } = applyMemorialDiscount(subtotal)
    // GLP-3 Buy 2 Get 1 Free — dollar discount off subtotal, before affiliate %.
    // Mirrors the client calc in checkout.js exactly (same lib/sale helper).
    const { discount: bogoDiscount } = calcGlp3Bogo(bogoItems)
    const subtotalPostPromos = subtotalPostMemorial - bogoDiscount

    // Recompute affiliate discount against the promo-discounted subtotal (was
    // computed earlier against raw subtotal — overwrite for correctness when a
    // promo is active).
    if (validatedAffiliateCode && discount > 0) {
      const affiliateDiscountPct = (discount / subtotal) * 100
      discount = subtotalPostPromos * (affiliateDiscountPct / 100)
    }

    const discountedTotal = subtotalPostPromos - discount
    // Shipping math lives in lib/shipping.js — same helper drives the
    // client-side checkout summary so the totals match exactly. saleActive
    // flag triggers the free-shipping override during the sale window.
    const shippingCalc = calcShipping({ items: validatedItems, discountedSubtotal: discountedTotal, saleActive })
    const shipping = shippingCalc.total
    // 10% off for crypto/Zelle — routes volume to un-freezable rails. Applied to
    // the post-all-discount subtotal (stacks with promos + affiliate codes),
    // pre-shipping. Server-authoritative; mirrors the client calc in checkout.js.
    const altPayDiscount = calcAltPayDiscount(discountedTotal, paymentMethod)
    const total = Math.round((discountedTotal - altPayDiscount + shipping) * 100) / 100

    if (total <= 0 || total > 50000) {
      return res.status(400).json({ error: 'Invalid order total' })
    }

    // Velocity / fraud checks. Same residential address from multiple identities
    // within 24h is the strongest fraud signal — block hard. 30-day window flags
    // for admin review without blocking. See src/lib/fraud-checks.js.
    const customerIp = extractClientIP(req)
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)
    const velocity = await runVelocityChecks({
      email,
      address,
      city,
      state,
      zip,
      ip: customerIp,
    })

    const orderNumber = generateOrderNumber()

    // payment_status taxonomy (v17):
    //   'awaiting_payment' — instant rail (paypal/card/crypto) not yet captured.
    //                        Webhook flips to 'completed', or cron flips to
    //                        'abandoned' after 48h. NOT in the admin Pending
    //                        view — those abandoned carts shouldn't drown the
    //                        legitimate verification queue.
    //   'pending'          — needs human review: zelle/venmo awaiting bank
    //                        deposit confirmation, OR fraud-blocked at any
    //                        rail. This IS the admin Pending view.
    const isInstantRail = paymentMethod === 'paypal' || paymentMethod === 'card' || paymentMethod === 'crypto'
    const initialPaymentStatus = (velocity.status === 'block' || !isInstantRail) ? 'pending' : 'awaiting_payment'

    const insertData = {
      order_number: orderNumber,
      customer_name: name,
      customer_email: email,
      shipping_address: address,
      city,
      state,
      zip,
      items,
      subtotal,
      shipping,
      total,
      payment_status: initialPaymentStatus,
      payment_method: paymentMethod,
      research_field: researchField,
      customer_ip: customerIp,
      user_agent: userAgent,
      fraud_status: velocity.status === 'block' ? 'blocked' : velocity.status === 'flag' ? 'flagged' : 'unreviewed',
      fraud_reasons: velocity.reasons,
    }

    if (validatedAffiliateCode) {
      insertData.affiliate_code = validatedAffiliateCode
      insertData.discount = discount
      insertData.affiliate_commission_pct = validatedCommissionPct
    }

    // Memorial Day (or any other site-wide sale) — log discount for audit
    // trail + future revenue attribution. memorial_day_discount column is
    // additive to the existing affiliate `discount` field above. If the
    // orders table doesn't have the column yet, the insert will fail noisily
    // — needs a migration to add: `memorial_day_discount NUMERIC DEFAULT 0`.
    if (saleActive && memorialDiscount > 0) {
      insertData.memorial_day_discount = Math.round(memorialDiscount * 100) / 100
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('Order creation failed:', error)
      return res.status(500).json({ error: error.message })
    }

    // Hard-blocked orders are recorded for the audit trail but never reach the
    // payment processor. Client sees a generic verification message — never
    // disclose the block reason (gives fraud actors a feedback loop). Admin
    // reviews via the Orders tab and can clear+reprocess if it was a false
    // positive.
    if (velocity.status === 'block') {
      console.warn('[orders/create] Blocked by velocity check:', orderNumber, velocity.reasons)
      return res.status(202).json({
        order_number: orderNumber,
        verification_required: true,
        message: 'Your order requires manual verification. Our team will contact you within one business day. No payment has been collected.',
      })
    }

    if (paymentMethod === 'card') {
      const [firstName, ...lastParts] = String(name).trim().split(/\s+/)
      const lastName = lastParts.join(' ')
      try {
        const { redirectUrl } = await createCheckoutSession({
          orderNumber,
          amountCents: Math.round(total * 100),
          currency: 'USD',
          customer: {
            email,
            firstName,
            lastName,
            address,
            city,
            state,
            zip,
            country: 'US',
          },
          returnUrl: `${SITE_URL}/checkout/success?order=${encodeURIComponent(orderNumber)}`,
          cancelUrl: `${SITE_URL}/checkout/cancel?order=${encodeURIComponent(orderNumber)}`,
          callbackUrl: `${SITE_URL}/api/webhooks/bankful`,
        })
        return res.status(200).json({
          order_number: orderNumber,
          order_id: order.id,
          total,
          shipping,
          discount,
          redirect_url: redirectUrl,
        })
      } catch (sessionErr) {
        console.error('[orders/create] Card checkout session failed:', sessionErr.message)
        return res.status(502).json({ error: 'Payment processor unavailable. Please try again or use crypto checkout.' })
      }
    }

    if (paymentMethod === 'crypto') {
      try {
        const { redirectUrl } = await createCryptoCheckoutSession({
          orderNumber,
          amountCents: Math.round(total * 100),
          currency: 'USD',
          returnUrl: `${SITE_URL}/checkout/success?order=${encodeURIComponent(orderNumber)}`,
          cancelUrl: `${SITE_URL}/checkout/cancel?order=${encodeURIComponent(orderNumber)}`,
          callbackUrl: `${SITE_URL}/api/webhooks/nowpayments`,
        })
        return res.status(200).json({
          order_number: orderNumber,
          order_id: order.id,
          total,
          shipping,
          discount,
          redirect_url: redirectUrl,
        })
      } catch (sessionErr) {
        console.error('[orders/create] Crypto checkout session failed:', sessionErr.message)
        return res.status(502).json({ error: 'Crypto payment processor unavailable. Please try again.' })
      }
    }

    if (paymentMethod === 'paypal') {
      try {
        // Smart-Buttons flow: client renders PayPal/Venmo/Apple Pay inline via
        // the JS SDK and submits the returned paypal_order_id back through the
        // SDK's createOrder hook. No redirect_url is used. return_url/cancel_url
        // are still passed for the rare fallback where PayPal opens a popup
        // approval flow that needs them.
        const { paypalOrderId } = await createPaypalCheckoutSession({
          orderNumber,
          amountCents: Math.round(total * 100),
          currency: 'USD',
          customer: { email },
          returnUrl: `${SITE_URL}/checkout/success?order=${encodeURIComponent(orderNumber)}`,
          cancelUrl: `${SITE_URL}/checkout/cancel?order=${encodeURIComponent(orderNumber)}`,
        })
        return res.status(200).json({
          order_number: orderNumber,
          order_id: order.id,
          total,
          shipping,
          discount,
          paypal_order_id: paypalOrderId,
        })
      } catch (sessionErr) {
        console.error('[orders/create] PayPal checkout session failed:', sessionErr.message)
        return res.status(502).json({ error: 'PayPal payment processor unavailable. Please try again.' })
      }
    }

    if (paymentMethod === 'zelle') {
      // Order sits in payment_status='pending' / payment_method='zelle' until
      // admin manually marks paid after seeing the Zelle deposit in BoA-1990.
      // Customer is redirected to an instructions page and emailed the same
      // details so they can complete from their bank app.
      try {
        await sendZelleInstructions(order)
      } catch (mailErr) {
        console.error('[orders/create] Zelle instructions email failed:', mailErr.message)
        // non-fatal — instructions are also on the redirect page; customer can still pay
      }
      return res.status(200).json({
        order_number: orderNumber,
        order_id: order.id,
        total,
        shipping,
        discount,
        redirect_url: `${SITE_URL}/checkout/zelle-instructions?order=${encodeURIComponent(orderNumber)}&amount=${total.toFixed(2)}`,
      })
    }

    // Venmo path. Same shape as Zelle — order pends in payment_method='venmo'
    // until admin sees the Venmo Business deposit + marks paid in the admin
    // Orders tab. Instructions page provides a venmo:// deep-link for mobile
    // app handoff plus copyable fields for desktop / fallback.
    try {
      await sendVenmoInstructions(order)
    } catch (mailErr) {
      console.error('[orders/create] Venmo instructions email failed:', mailErr.message)
      // non-fatal — instructions are also on the redirect page; customer can still pay
    }
    return res.status(200).json({
      order_number: orderNumber,
      order_id: order.id,
      total,
      shipping,
      discount,
      redirect_url: `${SITE_URL}/checkout/venmo-instructions?order=${encodeURIComponent(orderNumber)}&amount=${total.toFixed(2)}`,
    })
  } catch (err) {
    console.error('Order creation failed:', err)
    return res.status(500).json({ error: err.message })
  }
}
