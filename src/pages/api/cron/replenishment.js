import { runReplenishmentNudges } from '../../../lib/replenishment'

// Daily "running low?" replenishment nudge. Emails customers who are about due
// to reorder a product a time-limited 5%-off reorder link. Idempotent
// (replenishment_nudges gates re-sends). Registered in vercel.json.
//
// Auth: matches the other crons — CRON_SECRET via x-cron-secret for manual
// triggers, Vercel's cron signature header for the scheduled run.
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers['x-cron-secret']
  if (cronSecret && provided !== cronSecret) {
    if (!req.headers['x-vercel-cron-signature']) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const log = await runReplenishmentNudges()
  return res.status(log.errors.find((e) => e.fatal) ? 500 : 200).json(log)
}
