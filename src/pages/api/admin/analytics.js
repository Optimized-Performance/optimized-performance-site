// Operator analytics — aggregates first-party events + orders into an ecom
// dashboard: money KPIs (revenue/AOV/conversion/repeat) with prior-period
// deltas, revenue & funnel, acquisition-by-source (with revenue), product
// performance (by name + revenue), customers (new vs returning), refunds, and
// rail mix. v1 aggregates in JS over a capped fetch (fine to ~100k events);
// the scale-up path is a SQL rollup / daily aggregate table — the response
// contract stays identical, so that swap is internal-only.

import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'
import { getCatalog } from '../../../lib/catalog'

export const config = { maxDuration: 30 }

const EVENT_CAP = 100000
const ORDER_CAP = 50000

// product id OR sku -> display label ("MOTS-C 10mg")
function buildProductLabel(productsData) {
  const m = new Map()
  for (const p of productsData) {
    const label = p.dosage ? `${p.name} ${p.dosage}` : p.name
    if (p.id) m.set(p.id, label)
    if (p.sku) m.set(p.sku, label)
  }
  return m
}

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}
function addTo(map, key, n = 1) { map.set(key, (map.get(key) || 0) + n) }
function addSession(map, key, sid) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(sid)
}
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const isPaid = (o) => o.payment_status === 'completed'

// Scalar KPIs for one window (current or prior) — used for the headline cards
// + their period-over-period deltas.
function windowKpis(evs, ords) {
  const visitSessions = new Set()
  const payAttemptSessions = new Set()
  for (const e of evs) {
    if (!e.session_id) continue
    if (e.event_type === 'page_view') visitSessions.add(e.session_id)
    else if (e.event_type === 'payment_attempt') payAttemptSessions.add(e.session_id)
  }
  const paid = ords.filter(isPaid)
  const revenue = round2(paid.reduce((s, o) => s + Number(o.total || 0), 0))
  const visits = visitSessions.size
  const customers = new Set(paid.map((o) => (o.customer_email || '').toLowerCase()).filter(Boolean))
  // House orders = recaptured via our own email link (recovery/replenishment):
  // recovery_discount > 0 marks them, and they carry NO affiliate commission.
  // House share of revenue is the lever the margin model rides on.
  const houseOrders = paid.filter((o) => Number(o.recovery_discount) > 0)
  const houseRevenue = round2(houseOrders.reduce((s, o) => s + Number(o.total || 0), 0))
  return {
    revenue,
    orders: paid.length,
    aov: paid.length ? round2(revenue / paid.length) : 0,
    visits,
    houseOrders: houseOrders.length,
    houseRevenue,
    houseShare: revenue ? round2((houseRevenue / revenue) * 100) : 0,
    // On-site conversion = visitors who reached a payment attempt, EVENTS-ONLY.
    // Deliberately not paid-orders/visits: the orders table covers far more
    // history than the (new) events table, so mixing them yields nonsense ratios
    // (e.g. 27 paid / 33 tracked visits = 81.8%). Both sides here are sessions.
    conversion: visits ? round2((payAttemptSessions.size / visits) * 100) : 0,
    customers: customers.size,
  }
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const productsData = await getCatalog()
    const PRODUCT_LABEL = buildProductLabel(productsData)
    const labelFor = (pid) => PRODUCT_LABEL.get(pid) || pid

    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90)
    const now = Date.now()
    const curStart = new Date(now - days * 24 * 60 * 60 * 1000)
    const priorStart = new Date(now - 2 * days * 24 * 60 * 60 * 1000)
    const curStartIso = curStart.toISOString()
    const priorStartIso = priorStart.toISOString()

    // Fetch 2× the range so we can compute the prior-period deltas + detect
    // returning customers, then split locally at curStart.
    const [{ data: events }, { data: orders }] = await Promise.all([
      supabaseAdmin
        .from('events')
        .select('session_id, event_type, product_id, ref, created_at')
        .gte('created_at', priorStartIso)
        .limit(EVENT_CAP),
      supabaseAdmin
        .from('orders')
        .select('session_id, customer_email, affiliate_code, payment_status, payment_method, total, items, recovery_discount, created_at')
        .gte('created_at', priorStartIso)
        .limit(ORDER_CAP),
    ])

    const allEv = events || []
    const allOrd = orders || []
    const truncated = allEv.length >= EVENT_CAP || allOrd.length >= ORDER_CAP

    const curEv = allEv.filter((e) => e.created_at >= curStartIso)
    const priorEv = allEv.filter((e) => e.created_at < curStartIso)
    const curOrd = allOrd.filter((o) => o.created_at >= curStartIso)
    const priorOrd = allOrd.filter((o) => o.created_at < curStartIso)

    // ---- headline KPIs + prior-period deltas ----
    const cur = windowKpis(curEv, curOrd)
    const prev = windowKpis(priorEv, priorOrd)

    // repeat-purchase rate (within fetched data): of customers who bought in the
    // current window, how many have >=2 completed orders across the fetched span.
    const paidByEmail = new Map()
    for (const o of allOrd.filter(isPaid)) {
      const em = (o.customer_email || '').toLowerCase()
      if (!em) continue
      if (!paidByEmail.has(em)) paidByEmail.set(em, [])
      paidByEmail.get(em).push(o)
    }
    const curEmails = new Set(curOrd.filter(isPaid).map((o) => (o.customer_email || '').toLowerCase()).filter(Boolean))
    let repeatCustomers = 0
    for (const em of curEmails) if ((paidByEmail.get(em)?.length || 0) >= 2) repeatCustomers += 1
    const repeat_rate = curEmails.size ? round2((repeatCustomers / curEmails.size) * 100) : 0

    // new vs returning ORDERS in the current window (returning = email had an
    // earlier completed order anywhere in the fetched span).
    let newOrders = 0
    let returningOrders = 0
    let houseReturning = 0 // returning-customer orders we recaptured via our email
    for (const o of curOrd.filter(isPaid)) {
      const em = (o.customer_email || '').toLowerCase()
      const earlier = em && (paidByEmail.get(em) || []).some((x) => x.created_at < o.created_at)
      if (earlier) {
        returningOrders += 1
        if (Number(o.recovery_discount) > 0) houseReturning += 1
      } else {
        newOrders += 1
      }
    }
    // Reorder capture rate = of repeat (returning) orders, how many we won via our
    // own email link (vs the customer reordering organically on an affiliate code).
    // This is the single number the margin curve rides on — every captured reorder
    // is a ~70%-margin house sale instead of a ~37% commissioned one.
    const reorder_capture = returningOrders ? round2((houseReturning / returningOrders) * 100) : 0

    // refunds (current window)
    const refundedCount = curOrd.filter((o) => o.payment_status === 'refunded').length
    const refund_rate = cur.orders ? round2((refundedCount / (cur.orders + refundedCount)) * 100) : 0

    const kpis = {
      revenue: { value: cur.revenue, prev: prev.revenue },
      orders: { value: cur.orders, prev: prev.orders },
      aov: { value: cur.aov, prev: prev.aov },
      conversion: { value: cur.conversion, prev: prev.conversion },
      repeat_rate: { value: repeat_rate, prev: null },
      visits: { value: cur.visits, prev: prev.visits },
    }

    // ---- current-window detail aggregations ----
    const stageSessions = new Map()
    const refOfSession = new Map()
    const productViews = new Map()
    const productCarts = new Map()
    const dailyVisitSessions = new Map()
    for (const e of curEv) {
      const sid = e.session_id
      if (!sid) continue
      addSession(stageSessions, e.event_type, sid)
      if (e.ref && !refOfSession.has(sid)) refOfSession.set(sid, String(e.ref).toUpperCase())
      if (e.event_type === 'product_view' && e.product_id) addTo(productViews, e.product_id)
      if (e.event_type === 'add_to_cart' && e.product_id) addTo(productCarts, e.product_id)
      if (e.event_type === 'page_view') addSession(dailyVisitSessions, String(e.created_at).slice(0, 10), sid)
    }
    const sizeOf = (t) => stageSessions.get(t)?.size || 0
    const paidOrders = curOrd.filter(isPaid)

    // EVENTS-ONLY funnel (one consistent source). orders/paid are intentionally
    // NOT funnel stages — they come from the orders table (more history than the
    // events table) so mixing them breaks the funnel. Total orders/revenue live
    // in the KPIs; this funnel is on-site session behavior.
    const funnel = {
      visits: sizeOf('page_view'),
      product_viewers: sizeOf('product_view'),
      carts: sizeOf('add_to_cart'),
      checkouts: sizeOf('checkout_start'),
      payment_attempts: sizeOf('payment_attempt'),
    }

    // by source — now with revenue + AOV
    const visitsByRef = new Map()
    for (const [sid, ref] of refOfSession.entries()) {
      if (stageSessions.get('page_view')?.has(sid)) addTo(visitsByRef, ref || 'DIRECT')
    }
    const pvSessions = stageSessions.get('page_view') || new Set()
    let directVisits = 0
    for (const sid of pvSessions) if (!refOfSession.has(sid)) directVisits += 1
    if (directVisits) addTo(visitsByRef, 'DIRECT', directVisits)
    const paidByRef = new Map()
    const revByRef = new Map()
    for (const o of paidOrders) {
      const k = (o.affiliate_code || 'DIRECT').toUpperCase()
      addTo(paidByRef, k)
      addTo(revByRef, k, Number(o.total || 0))
    }
    const refKeys = new Set([...visitsByRef.keys(), ...paidByRef.keys()])
    const by_ref = [...refKeys]
      .map((ref) => {
        const visits = visitsByRef.get(ref) || 0
        const paid = paidByRef.get(ref) || 0
        const revenue = round2(revByRef.get(ref) || 0)
        return { ref, visits, paid, revenue, aov: paid ? round2(revenue / paid) : 0, conv: visits ? round2((paid / visits) * 100) : null }
      })
      .sort((a, b) => b.revenue - a.revenue || b.visits - a.visits)
      .slice(0, 20)

    // products — by name + revenue
    const purchasedUnits = new Map()
    const purchasedRev = new Map()
    for (const o of paidOrders) {
      for (const it of Array.isArray(o.items) ? o.items : []) {
        const pid = it.id || it.sku
        if (!pid) continue
        addTo(purchasedUnits, pid, Number(it.quantity) || 1)
        addTo(purchasedRev, pid, (Number(it.price) || 0) * (Number(it.quantity) || 1))
      }
    }
    const productKeys = new Set([...productViews.keys(), ...productCarts.keys(), ...purchasedUnits.keys()])
    const top_products = [...productKeys]
      .map((pid) => ({
        product_id: pid,
        name: labelFor(pid),
        views: productViews.get(pid) || 0,
        carts: productCarts.get(pid) || 0,
        purchases: purchasedUnits.get(pid) || 0,
        revenue: round2(purchasedRev.get(pid) || 0),
      }))
      .sort((a, b) => b.revenue - a.revenue || b.views - a.views)
      .slice(0, 20)

    // daily — visits, orders, revenue
    const ordersByDay = new Map()
    const revByDay = new Map()
    for (const o of curOrd) addTo(ordersByDay, String(o.created_at).slice(0, 10))
    for (const o of paidOrders) addTo(revByDay, String(o.created_at).slice(0, 10), Number(o.total || 0))
    const dayKeys = new Set([...dailyVisitSessions.keys(), ...ordersByDay.keys()])
    const daily = [...dayKeys].sort().map((d) => ({
      date: d,
      visits: dailyVisitSessions.get(d)?.size || 0,
      orders: ordersByDay.get(d) || 0,
      revenue: round2(revByDay.get(d) || 0),
    }))

    // rail mix — count + revenue
    const railCount = new Map()
    const railRev = new Map()
    for (const o of paidOrders) {
      addTo(railCount, o.payment_method || 'unknown')
      addTo(railRev, o.payment_method || 'unknown', Number(o.total || 0))
    }
    const rail_mix = [...railCount.keys()]
      .map((method) => ({ method, count: railCount.get(method) || 0, revenue: round2(railRev.get(method) || 0) }))
      .sort((a, b) => b.revenue - a.revenue)

    // top customers by spend (current window) — admin-only tool, email is fine
    const spendByEmail = new Map()
    for (const o of paidOrders) {
      const em = (o.customer_email || '').toLowerCase()
      if (em) addTo(spendByEmail, em, Number(o.total || 0))
    }
    const top_customers = [...spendByEmail.entries()]
      .map(([email, spend]) => ({ email, spend: round2(spend), orders: paidByEmail.get(email)?.length || 0 }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)

    const customers = {
      new_orders: newOrders,
      returning_orders: returningOrders,
      repeat_rate,
      top: top_customers,
    }

    return res.status(200).json({
      range: { days, start: curStartIso },
      kpis,
      funnel,
      by_ref,
      top_products,
      daily,
      rail_mix,
      customers,
      house: {
        orders: cur.houseOrders,
        revenue: cur.houseRevenue,
        share: cur.houseShare, // % of current-window revenue from house orders
        prev_share: prev.houseShare,
        reorder_capture, // % of returning-customer orders won via our email link
        returning_orders: returningOrders,
      },
      refunds: { count: refundedCount, rate: refund_rate },
      truncated,
    })
  } catch (err) {
    console.error('[admin/analytics] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
