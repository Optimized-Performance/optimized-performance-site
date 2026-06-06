import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString, validateZip } from '../../../lib/security'
import { createCheckoutSession } from '../../../lib/payments/cardProcessor'
import { createCryptoCheckoutSession } from '../../../lib/payments/cryptoProcessor'
import { createPaypalCheckoutSession } from '../../../lib/payments/paypalProcessor'
import { runVelocityChecks, extractClientIP } from '../../../lib/fraud-checks'
import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { calcShipping } from '../../../lib/shipping'
import { sendZelleInstructions, sendVenmoInstructions } from '../../../lib/alerts'
import { isRailAvailable } from '../../../lib/rail-utilization'
import { isMemorialDaySaleActive, applyMemorialDiscount, MEMORIAL_DAY_DISCOUNT_PCT, calcGlp3Bogo, calcAltPayDiscount } from '../../../lib/sale'
import { verifyRecoveryToken } from '../../../lib/recovery'

function generateOrderNumber() {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `OP-${y}${m}${d}-${rand}`
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://optimizedperformancepeptides.com'

// Stable fingerprint of a cart for duplicate-order detection: sorted sku:qty
// lines + the order total. Two checkouts of the same cart at the same price
// produce the same signature regardless of line ordering.
function orderSignature(items, total) {
  const lines = (Array.isArray(items) ? items : [])
    .map((i) => `${String(i.sku || i.id || '').toLowerCase()}:${i.quantity}`)
    .sort()
    .join('|')
  return `${lines}#${Number(total || 0).toFixed(2)}`
}

// How long an identical, already-PAID cart blocks a re-charge. Covers the
// "I thought it failed so I paid again" confusion window without blocking a
// genuine repeat purchase hours/days later. Tunable.
const DUPLICATE_GUARD_MINUTES = 30

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })

  try {
    const { name, email, address, city, state, zip, items, affiliateCode, recoveryToken, researchUseAck, researchField, paymentMethod } = req.body

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

    // Rail orchestration: reject if the chosen rail is over its volume cap, so
    // overflow routes to the uncapped durable rails. Crypto/Zelle are uncapped
    // and never trip this. Authoritative throttle (the checkout UI gating via
    // /api/rails/availability is convenience). See docs/rail-orchestration-spec.md.
    if (!(await isRailAvailable(supabaseAdmin, paymentMethod))) {
      return res.status(503).json({ error: 'This payment method is temporarily at capacity. Please pay with crypto or Zelle — 10% off.' })
    }

    // SERVER-SIDE CALCULATION: recalculate totals from cart items to prevent tampering
    const products = require('../../../data/products').default
    let subtotal = 0
    // Durable-rails-only: true if any cart item is an ancillary Rx SKU restricted
    // to Zelle/crypto (keeps the most-pharma items off the card rail).
    let cartDurableOnly = false
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
      if (product.durableRailsOnly === true) cartDurableOnly = true
    }

    // Durable-rails-only gating (ancillary Rx tablets/tinctures → Zelle/crypto
    // only) is a kill-switch, DEFAULT OFF (Matt 2026-06-06): self-restricting
    // these SKUs costs conversion and any processor we land will take the
    // volume — sell them through every rail until a compliance audit forces
    // otherwise. Flip NEXT_PUBLIC_DURABLE_RAILS_GATING=true to re-arm. Mirrors
    // the checkout.js gating. Server-authoritative when on.
    const durableRailsGating = process.env.NEXT_PUBLIC_DURABLE_RAILS_GATING === 'true'
    if (durableRailsGating && cartDurableOnly && paymentMethod !== 'zelle' && paymentMethod !== 'crypto') {
      return res.status(400).json({ error: 'One or more items in this order can only be paid via Zelle or crypto. Please choose Zelle or crypto at checkout.' })
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

    const subtotalPostAffiliate = subtotalPostPromos - discount
    // Payment-recovery incentive — extra % off authorized by a signed recovery
    // token (?recover link in the abandoned-checkout email). Re-verified here
    // (client total is advisory); pct is server-fixed in lib/recovery so a forged
    // token can't escalate it. Stacks on top of the affiliate discount, applied
    // pre-shipping (same tier as alt-pay). Mirrors the client calc in checkout.js.
    const recovery = recoveryToken ? verifyRecoveryToken(recoveryToken) : { valid: false, pct: 0 }
    const recoveryPct = recovery.valid ? recovery.pct : 0
    const recoveryDiscount = Math.round(subtotalPostAffiliate * (recoveryPct / 100) * 100) / 100
    const discountedTotal = subtotalPostAffiliate - recoveryDiscount
    // Shipping math lives in lib/shipping.js — same helper drives the
    // client-side checkout summary so the totals match exactly. saleActive
    // flag triggers the free-shipping override during the sale window.
    const shippingCalc = calcShipping({ items: validatedItems, discountedSubtotal: discountedTotal, saleActive })
    const shipping = shippingCalc.total
    // 10% off for crypto/Zelle — routes volume to un-freezable rails. Applied to
    // the post-all-discount subtotal (stacks with promos + affiliate + recovery),
    // pre-shipping. Server-authoritative; mirrors the client calc in checkout.js.
    const altPayDiscount = calcAltPayDiscount(discountedTotal, paymentMethod)
    const total = Math.round((discountedTotal - altPayDiscount + shipping) * 100) / 100

    if (total <= 0 || total > 50000) {
      return res.status(400).json({ error: 'Invalid order total' })
    }

    // Velocity / fraud checks — GATED OFF by default (Matt 2026-06-06).
    // Rationale: they false-positived on normal customers (flagging ordinary
    // emails) and never caught real fraud, while adding sequential DB-query
    // latency to the PayPal createOrder critical path — a contributor to the
    // "pay screen timed out" failures. If they're paying, we'd rather take the
    // order. Re-enable instantly by setting FRAUD_CHECKS_ENABLED=true in Vercel
    // (no code change) if chargebacks start appearing. When off we skip the DB
    // work entirely and default to 'unreviewed' (no block, no flag).
    const customerIp = extractClientIP(req)
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500)
    const fraudChecksEnabled = process.env.FRAUD_CHECKS_ENABLED === 'true'
    const velocity = fraudChecksEnabled
      ? await runVelocityChecks({ email, address, city, state, zip, ip: customerIp })
      : { status: 'unreviewed', reasons: [] }

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

    // Duplicate-order guard. Prevents the double-charge seen 2026-06-06 (Chance
    // Kaiser, two PayPal captures a minute apart): the first payment captured on
    // PayPal's side but the client-side capture call appeared to fail, the
    // retry banner prompted "try card again", and a second identical order was
    // created + charged. If an identical cart from the same email is ALREADY
    // 'completed' within the guard window, refuse to create another and point
    // the customer at the order they already paid for. Keyed on 'completed'
    // (the charged state) specifically so a legitimate retry of a genuinely
    // FAILED payment — which never reaches 'completed' — still goes through.
    if (isInstantRail) {
      const dupCutoff = new Date(Date.now() - DUPLICATE_GUARD_MINUTES * 60 * 1000).toISOString()
      const sig = orderSignature(items, total)
      const { data: recentPaid } = await supabaseAdmin
        .from('orders')
        .select('order_number, items, total, created_at')
        .eq('customer_email', email)
        .eq('payment_status', 'completed')
        .gte('created_at', dupCutoff)
        .order('created_at', { ascending: false })
        .limit(20)
      const dup = (recentPaid || []).find((o) => orderSignature(o.items, o.total) === sig)
      if (dup) {
        console.warn('[orders/create] duplicate-order guard blocked a re-charge:', { email, sig, existing: dup.order_number })
        return res.status(409).json({
          error: `It looks like you just completed this order (${dup.order_number}) — we did NOT charge you again. Check your email for the confirmation. If you truly meant to place a second order, reply to that email or call (831) 218-5147 and we'll set it up.`,
          duplicate: true,
          existing_order_number: dup.order_number,
          existing_status: 'completed',
        })
      }
    }

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

    // Recovery incentive — log for audit / recovery-conversion attribution.
    // total already nets it out; this records how much we gave back. Column
    // added in migration v23 (recovery_discount NUMERIC DEFAULT 0).
    if (recoveryDiscount > 0) {
      insertData.recovery_discount = recoveryDiscount
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
