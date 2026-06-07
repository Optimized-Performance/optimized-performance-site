import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString, validateZip } from '../../../lib/security'
import { createCheckoutSession } from '../../../lib/payments/cardProcessor'
import { createCryptoCheckoutSession } from '../../../lib/payments/cryptoProcessor'
import { createPaypalCheckoutSession } from '../../../lib/payments/paypalProcessor'
import { runVelocityChecks, extractClientIP } from '../../../lib/fraud-checks'
import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { computeOrderTotals } from '../../../lib/pricing'
import { PAYMENT_STATUS } from '../../../lib/order-status'
import { sendZelleInstructions, sendVenmoInstructions } from '../../../lib/alerts'
import { isRailAvailable } from '../../../lib/rail-utilization'
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
  // Keep-warm ping (hit by /api/cron/keep-warm). Loading this module already
  // constructs the Supabase client + primes the bundle, so returning here keeps
  // THIS function's instance warm — the point being that at low volume the
  // instance goes idle and the next real checkout eats a 1-3s cold start, which
  // blows PayPal's createOrder window ("pay screen timed out") and spawns retry
  // duplicates. No-op: no DB write, no order created. STOPGAP — the durable fix
  // is the createOrder slim-down (makes this path ~1 PayPal call, cold-immune).
  if (req.method === 'GET' && req.query.warm) {
    return res.status(200).json({ warm: true, ready: !!supabaseAdmin })
  }
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })

  try {
    const { name, email, address, city, state, zip, items, affiliateCode, recoveryToken, sessionId, researchUseAck, researchField, paymentMethod } = req.body

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

    // SERVER-SIDE CALCULATION: validate the cart against the catalog (authoritative
    // prices + isKit, never client-supplied), then compute every total via the
    // single-source pricing module (lib/pricing.computeOrderTotals) — the SAME
    // function the client checkout calls, so the customer-visible total and the
    // charged total cannot drift (the class of bug behind the May sale mispricing).
    const products = require('../../../data/products').default
    // Durable-rails-only: true if any cart item is an ancillary Rx SKU restricted
    // to Zelle/crypto (keeps the most-pharma items off the card rail).
    let cartDurableOnly = false
    // Server-validated line items (catalog price + isKit) feed both the pricing
    // module and the order record — never the client-supplied price.
    const lineItems = []
    for (const item of items) {
      const product = products.find(p => p.sku === item.sku || p.id === item.id)
      if (!product) {
        return res.status(400).json({ error: `Unknown product: ${item.sku || item.id}` })
      }
      const qty = parseInt(item.quantity) || 0
      if (qty < 1 || qty > 100) {
        return res.status(400).json({ error: 'Invalid item quantity' })
      }
      lineItems.push({ id: product.id, sku: product.sku, price: product.price, quantity: qty, isKit: product.isKit === true })
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

    // Validate affiliate code server-side (cannot trust a client-supplied %).
    // Capture only the validated discount %; the pricing module applies it in
    // the correct stacking position below.
    let validatedAffiliateCode = null
    let validatedCommissionPct = 0
    let validatedDiscountPct = 0
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
        validatedDiscountPct = Number(aff.discount_pct)
      }
    }

    // Payment-recovery incentive — extra % off authorized by a signed recovery
    // token (?recover link in the abandoned-checkout email). Re-verified here;
    // pct is server-fixed in lib/recovery so a forged token can't escalate it.
    const recovery = recoveryToken ? verifyRecoveryToken(recoveryToken) : { valid: false, pct: 0 }
    const recoveryPct = recovery.valid ? recovery.pct : 0

    // Single source of truth for the discount-stacking sequence (sale → BOGO →
    // affiliate → recovery → alt-pay), shipping, and the per-rail total. The
    // client checkout calls this SAME function, so totals cannot drift; server
    // authority comes from feeding catalog prices above.
    const totals = computeOrderTotals({
      lineItems,
      affiliatePct: validatedDiscountPct,
      recoveryPct,
      paymentMethod,
    })
    const subtotal = totals.subtotal
    const discount = totals.affiliateDiscount
    const memorialDiscount = totals.memorialDiscount
    const recoveryDiscount = totals.recoveryDiscount
    const saleActive = totals.saleActive
    const shipping = totals.shipping.total
    const total = totals.total

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

    let orderNumber = generateOrderNumber()

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
    const initialPaymentStatus = (velocity.status === 'block' || !isInstantRail) ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.AWAITING_PAYMENT

    // Duplicate-order guard. Prevents the double-charge seen 2026-06-06 (Chance
    // Kaiser, two PayPal captures a minute apart): the first payment captured on
    // PayPal's side but the client-side capture call appeared to fail, the
    // retry banner prompted "try card again", and a second identical order was
    // created + charged. If an identical cart from the same email is ALREADY
    // 'completed' within the guard window, refuse to create another and point
    // the customer at the order they already paid for. Keyed on 'completed'
    // (the charged state) specifically so a legitimate retry of a genuinely
    // FAILED payment — which never reaches 'completed' — still goes through.
    // Duplicate / resume guard — one recent-orders lookup, two outcomes:
    //   (a) an identical cart from the same email is already 'completed' within
    //       the window -> block the re-charge (the 6/06 double-charge guard).
    //   (b) an identical cart on the SAME rail is still OPEN (awaiting_payment /
    //       pending) within the window -> RESUME that order instead of minting a
    //       duplicate. Collapses the pay-screen-timeout retry pile (Torin Kelly
    //       3x PayPal, 2026-06-07): each PayPal createOrder used to mint a new
    //       local order before capture, so abandoned popups left orphan Awaiting
    //       rows. Now the retries reuse one order — whichever attempt finally
    //       captures (custom_id = our order number) finalizes that single order.
    //       (a) blocks a re-CHARGE; (b) collapses re-ATTEMPTS. Works for every
    //       rail (PayPal/crypto popup-timeouts AND zelle/venmo back-button reloads).
    let resumeOrder = null
    {
      const guardCutoff = new Date(Date.now() - DUPLICATE_GUARD_MINUTES * 60 * 1000).toISOString()
      const sig = orderSignature(items, total)
      const { data: recent } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, items, total, payment_status, payment_method')
        .eq('customer_email', email)
        .gte('created_at', guardCutoff)
        .order('created_at', { ascending: false })
        .limit(30)
      const sameCart = (recent || []).filter((o) => orderSignature(o.items, o.total) === sig)
      if (isInstantRail) {
        const dup = sameCart.find((o) => o.payment_status === 'completed')
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
      // Resume an open identical-cart order on the same rail (newest first).
      resumeOrder = sameCart.find(
        (o) => o.payment_method === paymentMethod &&
          (o.payment_status === 'awaiting_payment' || o.payment_status === 'pending')
      ) || null
      if (resumeOrder) {
        console.warn('[orders/create] resuming existing open order instead of duplicating:', { email, sig, existing: resumeOrder.order_number, rail: paymentMethod })
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

    // Resume path: reuse the existing open order (skip the insert) so a retry
    // can't pile up duplicate rows. Override orderNumber with the existing one so
    // the processor session (PayPal custom_id / NOWPayments order_id / Zelle memo)
    // attaches to the order the customer is resuming. Otherwise insert the new one.
    let order
    if (resumeOrder) {
      orderNumber = resumeOrder.order_number
      order = { id: resumeOrder.id }
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from('orders')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        console.error('Order creation failed:', error)
        return res.status(500).json({ error: error.message })
      }
      order = inserted
    }

    // Stamp the funnel session id (links the buyer's pre-order events to this
    // order) as a SEPARATE best-effort update — NOT part of the insert above —
    // so that if migration v26 (orders.session_id) hasn't run yet, a missing
    // column can never break order creation. Fire-and-forget, fully non-fatal.
    if (sessionId && typeof sessionId === 'string' && order?.id) {
      supabaseAdmin
        .from('orders')
        .update({ session_id: sessionId.slice(0, 64) })
        .eq('id', order.id)
        .then(({ error: sErr }) => { if (sErr) console.warn('[orders/create] session_id stamp skipped:', sErr.message) })
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
      if (!resumeOrder) {
        try {
          await sendZelleInstructions(order)
        } catch (mailErr) {
          console.error('[orders/create] Zelle instructions email failed:', mailErr.message)
          // non-fatal — instructions are also on the panel/page; customer can still pay
        }
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
    if (!resumeOrder) {
      try {
        await sendVenmoInstructions(order)
      } catch (mailErr) {
        console.error('[orders/create] Venmo instructions email failed:', mailErr.message)
        // non-fatal — instructions are also on the panel/page; customer can still pay
      }
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
