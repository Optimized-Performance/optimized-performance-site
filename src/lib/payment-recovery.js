import { supabaseAdmin } from './supabase'
import { sendPaymentRecoveryNudge } from './alerts'
import { signRecoveryToken } from './recovery'
import { RECOVERY_QUERY_PARAM } from './recovery-config'

// Window: nudge an order once it's been stuck in 'awaiting_payment' for at least
// NUDGE_AFTER_HOURS (so we don't email someone who's mid-retry) but before the
// expire-awaiting-payment cron flips it to 'abandoned' at NUDGE_MAX_AGE_HOURS.
const NUDGE_AFTER_HOURS = 1
const NUDGE_MAX_AGE_HOURS = 48

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co'

// Send the 1-hour payment-recovery email for any instant-rail order stuck in
// 'awaiting_payment' that hasn't been nudged yet. Idempotent — nudge_sent_at is
// set after each send and filtered out at the query level, so a given order is
// only ever emailed once. Returns a structured run log (same shape as
// runDeliveryFollowups).
//
// Used by:
//   - /api/cron/payment-recovery (hourly Vercel cron + manual CRON_SECRET trigger)
export async function runPaymentRecoveryNudges() {
  const log = {
    started_at: new Date().toISOString(),
    eligible_orders: 0,
    nudges_sent: 0,
    errors: [],
  }

  if (!supabaseAdmin) {
    log.errors.push({ fatal: 'Database not configured' })
    log.finished_at = new Date().toISOString()
    return log
  }

  // Mint a probe token once: if no signing key is configured (RECOVERY_TOKEN_SECRET
  // / CRON_SECRET), every link would be worthless — bail without sending or
  // stamping so the run retries cleanly once the secret is set.
  if (!signRecoveryToken()) {
    log.errors.push({ fatal: 'No recovery signing key (set RECOVERY_TOKEN_SECRET or CRON_SECRET)' })
    log.finished_at = new Date().toISOString()
    return log
  }

  try {
    const now = Date.now()
    const olderThan = new Date(now - NUDGE_AFTER_HOURS * 60 * 60 * 1000).toISOString()
    const youngerThan = new Date(now - NUDGE_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString()

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, customer_email')
      .eq('payment_status', 'awaiting_payment')
      .is('nudge_sent_at', null)
      .not('customer_email', 'is', null)
      .lt('created_at', olderThan)
      .gt('created_at', youngerThan)
      .limit(200)
    if (error) throw error

    log.eligible_orders = (orders || []).length

    for (const order of orders || []) {
      try {
        // Fresh token per order so each link expires on its own 7-day clock.
        // Bound to the order so arrival rebuilds the exact abandoned cart
        // (items + quantities) via /api/recovery/cart.
        const token = signRecoveryToken({ orderNumber: order.order_number })
        const recoverUrl = `${SITE_URL}/?${RECOVERY_QUERY_PARAM}=${encodeURIComponent(token)}`
        await sendPaymentRecoveryNudge(order, recoverUrl)
        const { error: upErr } = await supabaseAdmin
          .from('orders')
          .update({ nudge_sent_at: new Date().toISOString() })
          .eq('id', order.id)
        if (upErr) throw upErr
        log.nudges_sent += 1
      } catch (perOrderErr) {
        log.errors.push({ order: order.order_number, error: perOrderErr.message })
      }
    }
  } catch (err) {
    console.error('[payment-recovery] fatal:', err)
    log.errors.push({ fatal: err.message })
  }

  log.finished_at = new Date().toISOString()
  return log
}
