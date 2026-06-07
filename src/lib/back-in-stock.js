import { supabaseAdmin } from './supabase'
import { sendMarketingEmail } from './marketing-email'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://optimizedperformancepeptides.com'

// Notify customers who asked to be told when a product comes back. For every
// product_notify_requests row not yet notified whose SKU now has stock, send a
// "back in stock" email and stamp notified_at (idempotent — each waiting
// customer is emailed once per restock). Solicited, so it goes through the
// marketing rail (suppression + unsubscribe footer) but is genuinely wanted.
//
// Called from /api/inventory/check-stock (daily cron) alongside the other
// inventory pipelines. Returns a structured run log.
export async function runBackInStockNotifications() {
  const log = { started_at: new Date().toISOString(), pending: 0, in_stock_skus: 0, sent: 0, errors: [] }

  if (!supabaseAdmin) {
    log.errors.push({ fatal: 'Database not configured' })
    log.finished_at = new Date().toISOString()
    return log
  }

  try {
    const { data: pending, error } = await supabaseAdmin
      .from('product_notify_requests')
      .select('id, email, product_sku, product_id')
      .is('notified_at', null)
      .limit(5000)
    if (error) throw error
    log.pending = (pending || []).length
    if (!pending || pending.length === 0) {
      log.finished_at = new Date().toISOString()
      return log
    }

    const skus = [...new Set(pending.map((p) => p.product_sku).filter(Boolean))]
    const { data: inv } = await supabaseAdmin
      .from('inventory')
      .select('sku, product, stock')
      .in('sku', skus)

    const inStock = new Map() // sku -> product name
    for (const i of inv || []) {
      if (Number(i.stock) > 0) inStock.set(i.sku, i.product || i.sku)
    }
    log.in_stock_skus = inStock.size

    for (const p of pending) {
      if (!inStock.has(p.product_sku)) continue
      try {
        const name = inStock.get(p.product_sku)
        const url = p.product_id ? `${SITE_URL}/products/${encodeURIComponent(p.product_id)}` : `${SITE_URL}/shop`
        const result = await sendMarketingEmail({
          toEmail: p.email,
          subject: `Back in stock: ${name}`,
          bodyLines: [
            `Good news — ${name} is back in stock.`,
            ``,
            `You asked us to let you know, so here you go. Stock on these moves`,
            `fast, so grab it while it's here:`,
            ``,
            `${url}`,
          ],
        })
        // Stamp regardless of suppressed/sent so we don't retry a suppressed
        // address every day; only a hard send error leaves it for next run.
        if (result.ok || result.reason === 'suppressed') {
          await supabaseAdmin.from('product_notify_requests').update({ notified_at: new Date().toISOString() }).eq('id', p.id)
          if (result.ok) log.sent += 1
        } else {
          log.errors.push({ email: p.email, sku: p.product_sku, reason: result.reason })
        }
      } catch (perErr) {
        log.errors.push({ email: p.email, error: perErr.message })
      }
    }
  } catch (err) {
    console.error('[back-in-stock] fatal:', err)
    log.errors.push({ fatal: err.message })
  }

  log.finished_at = new Date().toISOString()
  return log
}
