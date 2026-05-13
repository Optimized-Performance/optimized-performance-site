import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString, validateZip } from '../../../lib/security'
import { createCheckoutSession } from '../../../lib/payments/cardProcessor'
import { createCryptoCheckoutSession } from '../../../lib/payments/cryptoProcessor'
import { runVelocityChecks, extractClientIP } from '../../../lib/fraud-checks'
import { calcShipping } from '../../../lib/shipping'
import { sendZelleInstructions } from '../../../lib/alerts'

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
    const { name, email, address, city, state, zip, items, affiliateCode, researchUseAck, paymentMethod } = req.body

    if (!validateString(name) || !validateEmail(email) || !validateString(address) ||
        !validateString(city) || !validateString(state, { minLength: 1, maxLength: 50 }) || !validateZip(zip) ||
        !Array.isArray(items) || !items.length || items.length > 50) {
      return res.status(400).json({ error: 'Invalid or missing required fields' })
    }

    if (paymentMethod !== 'card' && paymentMethod !== 'crypto' && paymentMethod !== 'zelle') {
      return res.status(400).json({ error: 'Invalid paymentMethod (must be "card", "crypto", or "zelle")' })
    }

    // Research-use acknowledgment (RUO + 21+ + no-consumption) must be explicitly confirmed.
    // This is enforced server-side so the audit trail survives any client tampering —
    // required for high-risk payment processor underwriting. Checked before DB so the
    // server rejects bad requests without touching backend resources.
    if (researchUseAck !== true) {
      return res.status(400).json({ error: 'Research-use acknowledgment is required.' })
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

    const discountedTotal = subtotal - discount
    // Shipping math lives in lib/shipping.js — same helper drives the
    // client-side checkout summary so the totals match exactly.
    const shippingCalc = calcShipping({ items: validatedItems, discountedSubtotal: discountedTotal })
    const shipping = shippingCalc.total
    const total = Math.round((discountedTotal + shipping) * 100) / 100

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
      payment_status: 'pending',
      payment_method: paymentMethod,
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

    // Zelle path. Order sits in payment_status='pending' / payment_method='zelle'
    // until admin manually marks paid after seeing the Zelle deposit in
    // BoA-1990. Customer is redirected to an instructions page and emailed the
    // same details so they can complete from their bank app.
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
  } catch (err) {
    console.error('Order creation failed:', err)
    return res.status(500).json({ error: err.message })
  }
}
