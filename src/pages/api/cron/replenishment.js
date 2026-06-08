import { runReplenishmentNudges } from '../../../lib/replenishment'
import { isAuthorizedCron } from '../../../lib/cron-auth'

// Daily "running low?" replenishment nudge. Emails customers who are about due
// to reorder a product a time-limited 5%-off reorder link. Idempotent
// (replenishment_nudges gates re-sends). Registered in vercel.json.
//
// Auth: matches the other crons — CRON_SECRET via x-cron-secret for manual
// triggers, Vercel's cron signature header for the scheduled run.
export default async function handler(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' })

  // ?preview=1 (manual trigger only) returns the would-send list without sending
  // or stamping — bypasses the enable gate so you can inspect before going live.
  const preview = req.query?.preview === '1'
  const log = await runReplenishmentNudges({ preview })
  return res.status(log.errors.find((e) => e.fatal) ? 500 : 200).json(log)
}
