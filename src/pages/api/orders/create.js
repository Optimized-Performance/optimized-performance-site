import { supabaseAdmin } from '../../../lib/supabase'
import { validateOrigin, rateLimit, validateEmail, validateString, validateZip } from '../../../lib/security'
import { getRail, isInstantRail as railIsInstant } from '../../../lib/payments/rails'
import { resolvePaypalAccount } from '../../../lib/payments/paypalAccounts'
import { isUsState, isCaProvince, isCaPostal } from '../../../lib/us-states'
import { getShippingTier } from '../../../lib/shipping'
import { runVelocityChecks, extractClientIP } from '../../../lib/fraud-checks'
import { getCustomerIdFromReq } from '../../../lib/customer-session'
import { hasGatedAccess } from '../../../lib/gated-access'
import { computeOrderTotals } from '../../../lib/pricing'
import { PAYMENT_STATUS } from '../../../lib/order-status'
import { logMetric, startTimer } from '../../../lib/metrics'
import { isRailAvailable } from '../../../lib/rail-utilization'
import { verifyRecoveryToken } from '../../../lib/recovery'
import { generateOrderNumber } from '../../../lib/order-number'
import { getCatalog } from '../../../lib/catalog'
import { estimateOrderCogs } from '../../../lib/takehome-config'
import { RESEARCH_MODE } from '../../../lib/brand'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co'

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

  // Time the full createOrder handler — this is the exact path PayPal Smart
  // Buttons' createOrder callback waits on, so its duration is the timeout
  // signal we need to watch (and the before/after for the P4 slim-down).
  const elapsed = startTimer()

  try {
    let { name, email, address, city, state, zip } = req.body
    const { items, affiliateCode, recoveryToken, sessionId, researchUseAck, researchField, paymentMethod, idempotencyKey, paypalAccount, customsAck, billing } = req.body
    // Destination country: 'US' (default) or 'CA' (Canada launch 2026-07-11).
    const country = req.body.country === 'CA' ? 'CA' : 'US'
    // Shipping tier (2026-07-14). US orders pick a speed tier; Canada is a
    // single flat intl rate. Validate against the config — never trust a
    // client-sent price. Unknown/absent → the default (2-Day).
    const shippingMethod = country === 'CA'
      ? 'canada'
      : (getShippingTier(req.body.shippingMethod).id)

    // Trim string fields before validating. Trailing/leading whitespace from
    // mobile autofill is common, and validateEmail is whitespace-intolerant and
    // does NOT trim — so " a@b.com " (field LOOKS filled, passes the client's
    // truthy check) 400'd here as a generic "Invalid or missing required
    // fields" with no clue which field. Trimming closes that class; the
    // normalized values flow downstream (storage + the .ilike lookups). Same
    // revenue-critical spirit as the validateEmail _/% and validateZip fixes.
    if (typeof name === 'string') name = name.trim()
    if (typeof email === 'string') email = email.trim()
    if (typeof address === 'string') address = address.trim()
    if (typeof city === 'string') city = city.trim()
    if (typeof state === 'string') state = state.trim()
    if (typeof zip === 'string') zip = zip.trim()

    // Per-field validation with a SPECIFIC error — the old single combined check
    // returned a generic blob, so a customer tripping one field was undiagnosable.
    if (!validateString(name)) return res.status(400).json({ error: 'Invalid or missing name' })
    if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid or missing email address' })
    if (!validateString(address)) return res.status(400).json({ error: 'Invalid or missing street address' })
    if (!validateString(city)) return res.status(400).json({ error: 'Invalid or missing city' })
    if (!validateString(state, { minLength: 1, maxLength: 50 })) return res.status(400).json({ error: 'Invalid or missing state' })
    if (!validateZip(zip)) return res.status(400).json({ error: 'Invalid or missing ZIP / postal code' })
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Your cart appears to be empty — please re-add your items.' })
    if (items.length > 50) return res.status(400).json({ error: 'Too many items in cart (max 50).' })

    // Destination gate (US + Canada). The State/Province field is a dropdown
    // client-side, but enforce it HERE too — a client gate can be bypassed,
    // and this is what actually stops an unshippable international order from
    // being created + charged (an AU order slipped through when State was
    // free-text). Gates on the destination address, NOT visitor IP, so
    // VPN'd/traveling customers shipping to a supported address are unaffected.
    if (country === 'CA') {
      if (!isCaProvince(state)) {
        return res.status(400).json({ error: 'Please select a valid Canadian province or territory.' })
      }
      if (!isCaPostal(zip)) {
        return res.status(400).json({ error: 'Please enter a valid Canadian postal code (A1A 1A1).' })
      }
      // The customs-risk waiver is the condition of selling cross-border:
      // the customer explicitly agreed to the $50 flat international fee and
      // waived refunds/replacements for customs delays or seizure. Enforced
      // server-side so the recorded ack survives client tampering — this is
      // the chargeback/audit evidence, stored on the order as customs_ack.
      if (customsAck !== true) {
        return res.status(400).json({ error: 'International orders require acknowledging the customs terms and the $50 shipping fee.' })
      }
    } else if (!isUsState(state)) {
      return res.status(400).json({ error: 'We currently ship within the United States and Canada only.' })
    }

    if (paymentMethod !== 'card' && paymentMethod !== 'crypto' && paymentMethod !== 'zelle' && paymentMethod !== 'venmo' && paymentMethod !== 'paypal') {
      return res.status(400).json({ error: 'Invalid paymentMethod (must be "card", "crypto", "zelle", "venmo", or "paypal")' })
    }

    // Zelle/Venmo are US-bank rails — a Canadian customer can't send either.
    // Card + crypto only for international orders (server-enforced; the tiles
    // are also hidden client-side).
    if (country === 'CA' && (paymentMethod === 'zelle' || paymentMethod === 'venmo' || paymentMethod === 'paypal')) {
      return res.status(400).json({ error: 'Canadian orders can be paid by card or crypto.' })
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

    // Research-use acknowledgment + field-of-research are enforced server-side
    // ONLY in research mode (gated research SKUs). In the clean lab-supply
    // posture (RESEARCH_MODE off, the default) the checkout UI hides these, so
    // requiring them here would 400 every order — the two MUST agree.
    if (RESEARCH_MODE) {
      // RUO + 21+ + no-consumption must be explicitly confirmed. Enforced
      // server-side so the audit trail survives client tampering.
      if (researchUseAck !== true) {
        return res.status(400).json({ error: 'Research-use acknowledgment is required.' })
      }
      // Allowed list mirrors RESEARCH_FIELDS in src/pages/checkout.js; keep in sync.
      const ALLOWED_RESEARCH_FIELDS = ['Pharmacology', 'Molecular Biology', 'Medicinal Chemistry', 'Biochemistry', 'Clinical Research', 'Other']
      if (!ALLOWED_RESEARCH_FIELDS.includes(researchField)) {
        return res.status(400).json({ error: 'A valid field of research is required.' })
      }
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // Rail orchestration: reject if the chosen rail is over its volume cap, so
    // overflow routes to the uncapped durable rails. Crypto/Zelle are uncapped
    // and never trip this. Authoritative throttle (the checkout UI gating via
    // /api/rails/availability is convenience). See docs/rail-orchestration-spec.md.
    if (!(await isRailAvailable(supabaseAdmin, paymentMethod))) {
      return res.status(503).json({ error: 'This payment method is temporarily at capacity. Please pay with crypto or Zelle — 5% off.' })
    }

    // SERVER-SIDE CALCULATION: validate the cart against the catalog (authoritative
    // prices + isKit, never client-supplied), then compute every total via the
    // single-source pricing module (lib/pricing.computeOrderTotals) — the SAME
    // function the client checkout calls, so the customer-visible total and the
    // charged total cannot drift (the class of bug behind the May sale mispricing).
    const products = await getCatalog()
    // Per-cart rail policy: collect each non-'all' item's rail_policy to enforce
    // the allowed payment rails below.
    const cartRailPolicies = new Set()
    // Purchase-approval gate: any item flagged purchaseApprovalRequired can only
    // be bought by an approved-researcher account (the genuine preventive
    // control — decoupled from listing so the SKU can still be openly crawlable).
    let cartNeedsApproval = false
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
      if (product.railPolicy && product.railPolicy !== 'all') cartRailPolicies.add(product.railPolicy)
      if (product.purchaseApprovalRequired) cartNeedsApproval = true
    }

    // Enforce the purchase-approval gate BEFORE any order is created. A cart
    // containing an approval-gated SKU requires a logged-in account whose email
    // is on the researcher allowlist (hasGatedAccess). Fails closed — a guest or
    // non-allowlisted account is refused. This is the server-authoritative
    // control; the storefront also hides the buy action, but this is what
    // actually prevents a non-research buyer from purchasing.
    if (cartNeedsApproval && !(await hasGatedAccess(req))) {
      return res.status(403).json({
        error: 'These items require an approved research account. Apply for access, and once approved you can complete this order.',
        requires_research_approval: true,
      })
    }

    // Rail-policy enforcement. p2p_crypto (account-gated line) is ALWAYS enforced
    // — off-card is the whole point of that line. zelle_crypto (legacy Rx
    // ancillary) stays behind the default-OFF kill-switch (no preemptive revenue
    // self-restriction, Matt 2026-06-06). Server-authoritative; checkout.js
    // mirrors the UI. Flip NEXT_PUBLIC_DURABLE_RAILS_GATING=true to arm zelle_crypto.
    const durableRailsGating = process.env.NEXT_PUBLIC_DURABLE_RAILS_GATING === 'true'
    let allowedRails = null // null = no rail restriction
    if (cartRailPolicies.has('p2p_crypto')) allowedRails = new Set(['zelle', 'venmo', 'crypto'])
    if (cartRailPolicies.has('zelle_crypto') && durableRailsGating) {
      const zc = new Set(['zelle', 'crypto'])
      allowedRails = allowedRails ? new Set([...allowedRails].filter((r) => zc.has(r))) : zc
    }
    if (allowedRails && !allowedRails.has(paymentMethod)) {
      return res.status(400).json({ error: `This order can only be paid via ${[...allowedRails].join(', ')}. Please choose one of those at checkout.` })
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

    // HOUSE ORDER: a valid recovery token means this sale was recaptured via our
    // OWN retention email (abandoned-cart nudge / replenishment reorder). Strip
    // the affiliate attribution so NO commission is paid — the customer still
    // gets the better house discount (lib/pricing takes max(affiliate, house %)).
    // Affiliate links / new traffic are untouched; this only zeroes commission on
    // conversions our email drove. (Matt's call 2026-06-08.)
    if (recovery.valid) {
      validatedAffiliateCode = null
      validatedCommissionPct = 0
    }

    // Per-account VIP discount (v32): a permanent discount tied to the customer's
    // VERIFIED, LOGGED-IN account — no code, so it can't be shared. Only fires for
    // an authenticated customer session, so a guest can't trigger it. It's the
    // store's own perk: best-of vs any affiliate code, and it pays NO commission /
    // carries no attribution (rides the affiliate-discount slot with the code
    // stripped). Skipped when a recovery token already made this a house order.
    if (!recovery.valid) {
      const customerId = getCustomerIdFromReq(req)
      if (customerId) {
        const { data: cust } = await supabaseAdmin
          .from('customers').select('discount_pct').eq('id', customerId).maybeSingle()
        const acctPct = Number(cust?.discount_pct || 0)
        if (acctPct > 0 && acctPct > validatedDiscountPct) {
          validatedDiscountPct = acctPct
          validatedAffiliateCode = null
          validatedCommissionPct = 0
        }
      }
    }

    // Single source of truth for the discount-stacking sequence (sale → BOGO →
    // affiliate → recovery → alt-pay), shipping, and the per-rail total. The
    // client checkout calls this SAME function, so totals cannot drift; server
    // authority comes from feeding catalog prices above.
    const totals = computeOrderTotals({
      lineItems,
      affiliatePct: validatedDiscountPct,
      recoveryPct,
      paymentMethod,
      country,
      shippingMethod,
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
    const isInstantRail = railIsInstant(paymentMethod)
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
    // Dedup / resume — two layers:
    //   PRIMARY (P3): idempotency key. The client sends a stable key per checkout
    //     attempt; every retry of that attempt carries the same key, so we resume
    //     the one order (or block a re-charge if it already completed). Precise +
    //     race-safe via the unique index on orders.idempotency_key.
    //   BACKSTOP: the cart-signature recent-orders scan, for keyless / older
    //     cached clients that don't send a key.
    let resumeOrder = null
    if (idempotencyKey && typeof idempotencyKey === 'string') {
      const { data: keyed } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, payment_status')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (keyed) {
        if (keyed.payment_status === PAYMENT_STATUS.COMPLETED) {
          return res.status(409).json({
            error: `It looks like you just completed this order (${keyed.order_number}) — we did NOT charge you again. Check your email for the confirmation.`,
            duplicate: true,
            existing_order_number: keyed.order_number,
            existing_status: 'completed',
          })
        }
        if (keyed.payment_status === PAYMENT_STATUS.AWAITING_PAYMENT || keyed.payment_status === PAYMENT_STATUS.PENDING) {
          resumeOrder = keyed
          console.warn('[orders/create] resuming by idempotency key:', { key: idempotencyKey, existing: keyed.order_number })
        }
      }
    }
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
      if (isInstantRail && !resumeOrder) {
        const dup = sameCart.find((o) => o.payment_status === PAYMENT_STATUS.COMPLETED)
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
      // Keyless backstop: resume an open identical-cart order on the same rail.
      if (!resumeOrder) {
        resumeOrder = sameCart.find(
          (o) => o.payment_method === paymentMethod &&
            (o.payment_status === PAYMENT_STATUS.AWAITING_PAYMENT || o.payment_status === PAYMENT_STATUS.PENDING)
        ) || null
        if (resumeOrder) {
          console.warn('[orders/create] resuming existing open order (cart-sig backstop):', { email, sig, existing: resumeOrder.order_number, rail: paymentMethod })
        }
      }
    }

    // PayPal multi-account routing. The client got {key, clientId} from
    // /api/payments/paypal-account (server-authoritative weighted pick) and
    // rendered the SDK with that clientId; it sends the key back so we create +
    // capture under the SAME account. Absent key (older client JS using the
    // baked default clientId) resolves to OPP, which matches that default — so
    // a deploy mid-checkout can't misroute. Only meaningful for the paypal rail.
    const resolvedPaypalAccount = paymentMethod === 'paypal' ? resolvePaypalAccount(paypalAccount) : null

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
      // Destination + customs waiver (v34). customs_ack is the recorded
      // agreement to the $50 intl fee + no-refund-on-seizure terms — the
      // chargeback/audit evidence for CA orders.
      country,
      customs_ack: country === 'CA' && customsAck === true,
      // Chosen shipping tier (v36) — drives the label service at fulfillment.
      shipping_method: shippingMethod,
      // COGS snapshot (v33): estimated vendor cost of this cart, frozen at
      // create time like affiliate_commission_pct — the commission basis is
      // total - shipping - cogs (lib/commission). Computed from the
      // server-validated lineItems (catalog id + price), not the client items.
      cogs: estimateOrderCogs(lineItems).cogs,
      payment_status: initialPaymentStatus,
      payment_method: paymentMethod,
      idempotency_key: idempotencyKey || null,
      research_field: researchField,
      customer_ip: customerIp,
      user_agent: userAgent,
      fraud_status: velocity.status === 'block' ? 'blocked' : velocity.status === 'flag' ? 'flagged' : 'unreviewed',
      fraud_reasons: velocity.reasons,
    }

    // Persist which PayPal account this order routes to so capture + the
    // webhook use the matching credentials. Column added in the multi-account
    // migration (orders.paypal_account TEXT, null = OPP legacy default).
    if (resolvedPaypalAccount) {
      insertData.paypal_account = resolvedPaypalAccount.key
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
      // A resumed PayPal order gets a BRAND-NEW paypal_order_id below, created
      // under THIS load's selected account (which the resuming client's SDK
      // rendered with). Re-point the stored account to match so capture/webhook
      // later use the right credentials — otherwise we'd try to capture the new
      // order id with the original account's secret and it would fail.
      if (resolvedPaypalAccount) {
        await supabaseAdmin
          .from('orders')
          .update({ paypal_account: resolvedPaypalAccount.key })
          .eq('id', resumeOrder.id)
      }
    } else {
      let { data: inserted, error } = await supabaseAdmin
        .from('orders')
        .insert(insertData)
        .select()
        .single()

      // Missing-column backstop: if migration v33 (orders.cogs), v34
      // (country/customs_ack), or v36 (shipping_method) hasn't been applied
      // yet, drop those fields and retry once — a lagging migration must never
      // take checkout down. The order then carries the pre-migration defaults.
      if (error && /cogs|country|customs_ack|shipping_method/i.test(error.message || '')) {
        console.warn('[orders/create] insert retry without v33/v34/v36 columns (migration not applied?):', error.message)
        delete insertData.cogs
        delete insertData.country
        delete insertData.customs_ack
        delete insertData.shipping_method
        ;({ data: inserted, error } = await supabaseAdmin
          .from('orders')
          .insert(insertData)
          .select()
          .single())
      }

      if (error) {
        // Idempotency-key race: a concurrent request with the same key won the
        // insert (unique-index violation, 23505). Re-query by key and resume that
        // order instead of erroring — exactly-once even under a double-submit race.
        if (error.code === '23505' && idempotencyKey) {
          const { data: raced } = await supabaseAdmin
            .from('orders')
            .select('id, order_number')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle()
          if (raced) {
            orderNumber = raced.order_number
            order = { id: raced.id }
          }
        }
        if (!order) {
          console.error('Order creation failed:', error)
          return res.status(500).json({ error: error.message })
        }
      } else {
        order = inserted
      }
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

    // Rail dispatch (lib/payments/rails). Each rail's createSession returns the
    // fields to merge into the 200 response — redirect_url for card/crypto and
    // the manual zelle/venmo instructions page, paypal_order_id for PayPal Smart
    // Buttons. Adding AllayPay / the NMI multi-MID router is a registry entry,
    // not another branch on this money path.
    const rail = getRail(paymentMethod)
    if (!rail) {
      return res.status(400).json({ error: `Unsupported payment method: ${paymentMethod}` })
    }
    const sessionTimer = startTimer()
    try {
      // Card AVS is checked against the BILLING address (what the bank has on
      // file), which can differ from the shipping address. checkout sends a
      // resolved `billing` object (= shipping when "same as shipping" is left
      // checked). Use it for the CARD rail's customer/billing block; every
      // other rail keeps the shipping address. Fall back to shipping if billing
      // is absent or missing an AVS-critical field, so a bad billing block can
      // never block an order — AVS just evaluates shipping, as it did before.
      const shippingCustomer = { name, email, address, city, state, zip, country }
      const railCustomer = (() => {
        if (paymentMethod !== 'card') return shippingCustomer
        const b = billing && typeof billing === 'object' ? billing : {}
        const bAddr = typeof b.address === 'string' ? b.address.trim() : ''
        const bCity = typeof b.city === 'string' ? b.city.trim() : ''
        const bState = typeof b.state === 'string' ? b.state.trim() : ''
        const bZip = typeof b.zip === 'string' ? b.zip.trim() : ''
        if (!bAddr || !bCity || !bState || !bZip) return shippingCustomer // degrade to shipping
        return {
          name: (typeof b.name === 'string' && b.name.trim()) || name,
          email,
          address: bAddr, city: bCity, state: bState, zip: bZip,
          country: b.country === 'CA' ? 'CA' : 'US',
        }
      })()

      const sessionFields = await rail.createSession({
        order,
        orderNumber,
        total,
        customer: railCustomer,
        urls: {
          returnUrl: `${SITE_URL}/checkout/success?order=${encodeURIComponent(orderNumber)}`,
          cancelUrl: `${SITE_URL}/checkout/cancel?order=${encodeURIComponent(orderNumber)}`,
          bankfulCallback: `${SITE_URL}/api/webhooks/bankful`,
          nowpaymentsCallback: `${SITE_URL}/api/webhooks/nowpayments`,
        },
        resumeOrder,
        siteUrl: SITE_URL,
        paypalAccount: resolvedPaypalAccount,
      })
      // ms_total = full handler; ms_session = the processor round-trip alone.
      // A large ms_total with small ms_session points at cold-start / pre-session
      // DB work (the P4 slim-down target); large ms_session is the processor.
      logMetric('order_create', { method: paymentMethod, ms_total: elapsed(), ms_session: sessionTimer(), resumed: !!resumeOrder, ok: true })

      // Pull the gateway session id out of the rail's fields — it's server-only
      // (used to reconcile a missed payment callback), never sent to the client.
      const { card_session_id, ...clientSessionFields } = sessionFields || {}
      // Best-effort stamp — SEPARATE non-fatal update so a missing column
      // (migration v30 not yet run) can never break order creation.
      if (card_session_id && order?.id) {
        supabaseAdmin
          .from('orders')
          .update({ card_session_id: String(card_session_id).slice(0, 128) })
          .eq('id', order.id)
          .then(({ error: cErr }) => { if (cErr) console.warn('[orders/create] card_session_id stamp skipped:', cErr.message) })
      }

      return res.status(200).json({
        order_number: orderNumber,
        order_id: order.id,
        total,
        shipping,
        discount,
        ...clientSessionFields,
      })
    } catch (sessionErr) {
      logMetric('order_create', { method: paymentMethod, ms_total: elapsed(), ms_session: sessionTimer(), ok: false, err: 'session_failed' })
      console.error(`[orders/create] ${paymentMethod} session failed:`, sessionErr.message)
      return res.status(502).json({ error: rail.failureError || 'Payment processor unavailable. Please try again.' })
    }
  } catch (err) {
    console.error('Order creation failed:', err)
    return res.status(500).json({ error: err.message })
  }
}
