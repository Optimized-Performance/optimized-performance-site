import { runDeliveryFollowups } from '../../../lib/delivery-followup'

// Manual / external trigger entry point for the delivery-followup logic.
// The same logic runs daily inside /api/inventory/check-stock (keeps total
// cron count within Vercel Hobby tier's 2-cron limit). This endpoint is for
// ad-hoc runs / debugging.
//
// Auth: x-cron-secret header must match CRON_SECRET. (No Vercel cron header
// fallback here — this isn't registered in vercel.json's crons array.)
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers['x-cron-secret']
  if (!cronSecret || provided !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const log = await runDeliveryFollowups()
  return res.status(log.errors.find((e) => e.fatal) ? 500 : 200).json(log)
}
