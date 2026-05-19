import { supabaseAdmin } from '../../../lib/supabase'

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
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers['x-cron-secret']
  if (cronSecret && provided !== cronSecret) {
    if (!req.headers['x-vercel-cron-signature']) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' })

  const hours = Number(req.query.hours) > 0 ? Number(req.query.hours) : DEFAULT_HOURS
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('payment_status', 'awaiting_payment')
      .lt('created_at', cutoff)
      .select('order_number, payment_method, created_at')

    if (error) throw error

    return res.status(200).json({
      ok: true,
      hours,
      cutoff,
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
