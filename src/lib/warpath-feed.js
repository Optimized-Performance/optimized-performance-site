// Thin one-way push to the Warpath admin: report an attributed OPP sale so it
// shows in Warpath's operator analytics (who's selling / what's selling). Warpath
// does NOT integrate OPP — it just receives this feed. FIRE-AND-FORGET: a feed
// failure must never affect order finalization, so everything is wrapped and we
// never throw. No-ops unless WARPATH_INGEST_SECRET is set and the order carries an
// affiliate code (an unattributed order is not Warpath's concern).
//
// One row per line item (order_ref = "<order_number>#<sku>") so Warpath can break
// down what's selling; commission is prorated across lines by gross share.

const ENDPOINT = process.env.WARPATH_FEED_URL || 'https://warpath-admin.vercel.app/api/opp/sale'

export async function reportSaleToWarpath({ order, products = [], commission = 0 }) {
  try {
    const secret = process.env.WARPATH_INGEST_SECRET
    if (!secret || !order?.affiliate_code) return

    const items = Array.isArray(order.items) ? order.items : []
    if (!items.length) return
    const subtotal = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 0), 0) || 1

    const sales = items.map((it) => {
      const gross = Number(it.price || 0) * Number(it.quantity || 0)
      const name = (products.find((p) => p.sku === it.sku) || {}).name || it.sku
      return {
        order_ref: `${order.order_number}#${it.sku}`,
        affiliate_code: order.affiliate_code,
        product: name,
        quantity: Number(it.quantity || 0),
        amount_usd: Math.round(gross * 100) / 100,
        commission_usd: Math.round(Number(commission || 0) * (gross / subtotal) * 100) / 100,
        at: order.updated_at || new Date().toISOString(),
      }
    })

    // Hard 3s timeout: this runs on the order-finalization path, so it must never
    // stall fulfillment if the Warpath endpoint is slow/down. AbortController caps
    // the wait; any error (timeout, network, non-2xx) is swallowed below.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    try {
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-opp-secret': secret },
        body: JSON.stringify({ sales }),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    console.error('[warpath-feed] report failed (non-fatal):', e.message)
  }
}
