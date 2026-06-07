// Funnel analytics — aggregates first-party events + orders into the visitor
// funnel, conversion-by-source, top products, daily traffic, and rail mix.
// v1 aggregates in JS over a capped fetch (fine at current/early-July volume);
// the scale-up path is a SQL rollup / daily aggregate table.

import { supabaseAdmin } from '../../../lib/supabase'
import { validateSessionToken } from '../../../lib/session'
import { validateOrigin, rateLimit } from '../../../lib/security'

export const config = { maxDuration: 30 }

const EVENT_CAP = 100000
const ORDER_CAP = 50000

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

function addTo(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n)
}
function addSession(map, key, sid) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(sid)
}

export default async function handler(req, res) {
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 60, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  try {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90)
    const startIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: events }, { data: orders }] = await Promise.all([
      supabaseAdmin
        .from('events')
        .select('session_id, event_type, product_id, ref, created_at')
        .gte('created_at', startIso)
        .limit(EVENT_CAP),
      supabaseAdmin
        .from('orders')
        .select('session_id, affiliate_code, payment_status, payment_method, total, items, created_at')
        .gte('created_at', startIso)
        .limit(ORDER_CAP),
    ])

    const ev = events || []
    const ord = orders || []
    const truncated = ev.length >= EVENT_CAP || ord.length >= ORDER_CAP

    // --- sessions per funnel stage ---
    const stageSessions = new Map() // event_type -> Set(session)
    const refOfSession = new Map() // session -> ref (first non-null seen)
    const productViews = new Map()
    const productCarts = new Map()
    const dailyVisitSessions = new Map() // date -> Set(session)

    for (const e of ev) {
      const sid = e.session_id
      if (!sid) continue
      addSession(stageSessions, e.event_type, sid)
      if (e.ref && !refOfSession.has(sid)) refOfSession.set(sid, String(e.ref).toUpperCase())
      if (e.event_type === 'product_view' && e.product_id) addTo(productViews, e.product_id)
      if (e.event_type === 'add_to_cart' && e.product_id) addTo(productCarts, e.product_id)
      if (e.event_type === 'page_view') {
        const d = String(e.created_at).slice(0, 10)
        addSession(dailyVisitSessions, d, sid)
      }
    }
    const sizeOf = (t) => (stageSessions.get(t)?.size || 0)

    const paidOrders = ord.filter((o) => o.payment_status === 'completed')

    // --- funnel ---
    const funnel = {
      visits: sizeOf('page_view'),
      product_viewers: sizeOf('product_view'),
      carts: sizeOf('add_to_cart'),
      checkouts: sizeOf('checkout_start'),
      orders: ord.length,
      paid: paidOrders.length,
    }

    // --- conversion by source (ref) ---
    const visitsByRef = new Map()
    for (const [sid, ref] of refOfSession.entries()) {
      // only count sessions that actually had a page_view (a real visit)
      if (stageSessions.get('page_view')?.has(sid)) addTo(visitsByRef, ref || 'DIRECT')
    }
    // sessions with NO ref attributed but that visited -> DIRECT
    const pvSessions = stageSessions.get('page_view') || new Set()
    let directVisits = 0
    for (const sid of pvSessions) if (!refOfSession.has(sid)) directVisits += 1
    if (directVisits) addTo(visitsByRef, 'DIRECT', directVisits)

    const paidByRef = new Map()
    for (const o of paidOrders) addTo(paidByRef, (o.affiliate_code || 'DIRECT').toUpperCase())

    const refKeys = new Set([...visitsByRef.keys(), ...paidByRef.keys()])
    const by_ref = [...refKeys]
      .map((ref) => {
        const visits = visitsByRef.get(ref) || 0
        const paid = paidByRef.get(ref) || 0
        return { ref, visits, paid, conv: visits ? Math.round((paid / visits) * 1000) / 10 : null }
      })
      .sort((a, b) => b.visits - a.visits || b.paid - a.paid)
      .slice(0, 20)

    // --- top products ---
    const purchasedUnits = new Map()
    for (const o of paidOrders) {
      for (const it of Array.isArray(o.items) ? o.items : []) {
        const pid = it.id || it.sku
        if (pid) addTo(purchasedUnits, pid, Number(it.quantity) || 1)
      }
    }
    const productKeys = new Set([...productViews.keys(), ...productCarts.keys(), ...purchasedUnits.keys()])
    const top_products = [...productKeys]
      .map((pid) => ({
        product_id: pid,
        views: productViews.get(pid) || 0,
        carts: productCarts.get(pid) || 0,
        purchases: purchasedUnits.get(pid) || 0,
      }))
      .sort((a, b) => b.views - a.views || b.purchases - a.purchases)
      .slice(0, 20)

    // --- daily ---
    const ordersByDay = new Map()
    for (const o of ord) addTo(ordersByDay, String(o.created_at).slice(0, 10))
    const dayKeys = new Set([...dailyVisitSessions.keys(), ...ordersByDay.keys()])
    const daily = [...dayKeys]
      .sort()
      .map((d) => ({ date: d, visits: dailyVisitSessions.get(d)?.size || 0, orders: ordersByDay.get(d) || 0 }))

    // --- rail mix (paid) ---
    const railMap = new Map()
    for (const o of paidOrders) addTo(railMap, o.payment_method || 'unknown')
    const rail_mix = [...railMap.entries()].map(([method, count]) => ({ method, count })).sort((a, b) => b.count - a.count)

    return res.status(200).json({
      range: { days, start: startIso },
      funnel,
      by_ref,
      top_products,
      daily,
      rail_mix,
      truncated,
    })
  } catch (err) {
    console.error('[admin/analytics] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
