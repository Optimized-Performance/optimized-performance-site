import { runPaymentRecoveryNudges } from '../../../lib/payment-recovery'

// Hourly payment-recovery nudge — emails customers whose instant-rail order has
// sat in 'awaiting_payment' for >1h (and <48h) a one-click recovery link with an
// extra discount, to recapture the missed sale. Registered in vercel.json.
//
// Auth: matches /api/cron/expire-awaiting-payment — CRON_SECRET via x-cron-secret
// header for manual triggers, Vercel's cron signature header for the scheduled
// run. Idempotent (nudge_sent_at gates re-sends), so a double-fire is harmless.
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers['x-cron-secret']
  if (cronSecret && provided !== cronSecret) {
    if (!req.headers['x-vercel-cron-signature']) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const log = await runPaymentRecoveryNudges()
  return res.status(log.errors.find((e) => e.fatal) ? 500 : 200).json(log)
}
