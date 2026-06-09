// Cron auth — single source of truth for authorizing cron-route requests.
//
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` on scheduled runs (the
// documented convention; /api/inventory/check-stock already used it correctly).
// The other cron handlers historically checked `x-cron-secret` OR a NON-EXISTENT
// `x-vercel-cron-signature` header — so with CRON_SECRET set, Vercel's scheduled
// invocations 401'd EVERY time and those crons silently never ran (expire-
// awaiting-payment, payment-recovery, replenishment, keep-warm, affiliate-
// monthly). This accepts BOTH:
//   - `Authorization: Bearer <CRON_SECRET>`  (Vercel scheduled runs)
//   - `x-cron-secret: <CRON_SECRET>`         (manual triggers / curl)
// If CRON_SECRET is unset, allow (dev / intentionally unprotected).
export function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  // Fail CLOSED in production if the secret is missing (a misconfig must never
  // make crons world-callable). Allow in dev/test so local runs aren't blocked.
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers['x-cron-secret'] === secret) return true;
  return false;
}
