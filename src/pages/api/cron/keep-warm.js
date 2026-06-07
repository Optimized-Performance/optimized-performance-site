// Keep-warm cron — pings the timeout-sensitive checkout function so it stays on
// a warm serverless instance.
//
// Why: in Next.js each API route is its own serverless bundle. At low/pre-July
// volume the /api/orders/create instance goes idle, so the next real checkout
// eats a 1-3s cold start (Node + Supabase client init). That blows PayPal Smart
// Buttons' createOrder window -> "pay screen timed out" -> the customer retries
// -> duplicate awaiting_payment orders (the Torin/Chance pattern).
//
// This pings create's `?warm=1` short-circuit (a no-op GET that creates no
// order) every few minutes so the instance + module init stay hot. It is a
// STOPGAP, not a cure: cron-warming is best-effort (Vercel may route a real
// request to a different instance, and instances can still spin down between
// pings). The durable fix is the createOrder slim-down, which makes that path
// ~1 PayPal call and cold-start-immune. Remove this cron once the slim-down ships.
//
// Auth shape matches the other crons: CRON_SECRET header for manual triggers,
// Vercel cron signature bypass for the scheduled run.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://optimizedperformancepeptides.com'

// Timeout-sensitive routes to keep hot. Each must support a no-op `?warm=1` GET.
const WARM_TARGETS = ['/api/orders/create?warm=1']

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET
  const provided = req.headers['x-cron-secret']
  if (cronSecret && provided !== cronSecret) {
    if (!req.headers['x-vercel-cron-signature']) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const warmed = await Promise.all(
    WARM_TARGETS.map(async (path) => {
      const started = Date.now()
      try {
        const r = await fetch(`${SITE_URL}${path}`, { method: 'GET', headers: { 'x-warm': '1' } })
        return { path, status: r.status, ms: Date.now() - started }
      } catch (err) {
        return { path, error: err.message, ms: Date.now() - started }
      }
    })
  )

  return res.status(200).json({ ok: true, warmed })
}
