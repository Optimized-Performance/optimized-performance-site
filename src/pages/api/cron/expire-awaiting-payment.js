import { supabaseAdmin } from '../../../lib/supabase'
import { PAYMENT_STATUS } from '../../../lib/order-status'
import { isAuthorizedCron } from '../../../lib/cron-auth'
import { reconcileCardOrder } from '../../../lib/payments/reconcile-card'

// Expire stale awaiting_payment orders.
//
// payment_status='awaiting_payment' is set by /api/orders/create for the
// instant rails (paypal/card/crypto) where a webhook is expected to capture
// the order within seconds. If 48h pass with no capture, the customer
// abandoned the cart. This cron flips those rows to 'abandoned' so they
// don't accumulate forever (Pending view is reserved for legit human-
// verification work like Zelle/Venmo deposits + fraud-flagged orders).
//
// Hours threshold is overridable via ?hours= for backfill / manual sweeps.
// Auth shape matches /api/cron/affiliate-monthly: CRON_SECRET header for
// manual triggers, Vercel cron header bypass for the scheduled run.
//
// Idempotent — re-running just won't find any newly-stale rows.

const DEFAULT_HOURS = 48

export default async function handler(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' })

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const hours = Number(req.query.hours) > 0 ? Number(req.query.hours) : DEFAULT_HOURS
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  // Before abandoning: reconcile awaiting CARD orders against the gateway. A
  // dropped/late callback must NOT let a *paid* order get wrongly abandoned —
  // reconcile finalizes paid ones (flipping them out of awaiting), so the bulk
  // update below only ever touches genuinely-unpaid rows. Degrades safely if the
  // card_session_id column doesn't exist yet (migration v30 not run).
  let reconciled = 0
  try {
    const { data: cardAwaiting } = await supabaseAdmin
      .from('orders')
      .select('order_number')
      .eq('payment_status', PAYMENT_STATUS.AWAITING_PAYMENT)
      .eq('payment_method', 'card')
      .lt('created_at', cutoff)
      .not('card_session_id', 'is', null)
    for (const o of cardAwaiting || []) {
      try {
        const r = await reconcileCardOrder(o.order_number)
        if (r?.finalized) reconciled += 1
      } catch (e) {
        console.warn('[cron/expire-awaiting-payment] reconcile failed', o.order_number, e.message)
      }
    }
  } catch (e) {
    console.warn('[cron/expire-awaiting-payment] card reconcile pass skipped:', e.message)
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ payment_status: PAYMENT_STATUS.ABANDONED, updated_at: new Date().toISOString() })
      .eq('payment_status', PAYMENT_STATUS.AWAITING_PAYMENT)
      .lt('created_at', cutoff)
      .select('order_number, payment_method, created_at')

    if (error) throw error

    return res.status(200).json({
      ok: true,
      hours,
      cutoff,
      reconciled_paid: reconciled,
      expired_count: (data || []).length,
      expired: (data || []).map((o) => ({
        order_number: o.order_number,
        payment_method: o.payment_method,
        created_at: o.created_at,
      })),
    })
  } catch (err) {
    console.error('[cron/expire-awaiting-payment] failed:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
