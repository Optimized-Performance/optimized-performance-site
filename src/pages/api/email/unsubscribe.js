// One-click unsubscribe. The footer of every marketing email links here with a
// signed token (?u=). GET so it works straight from an email client. Verifies
// the token, adds the address to email_suppressions, and renders a plain
// confirmation page. No auth needed — the token IS the authorization, and it
// only ever ADDS a suppression (fail-safe: worst case someone unsubscribes an
// address they hold the token for).

import { verifyUnsubscribeToken, suppressEmail } from '../../../lib/marketing-email'

function page(title, msg) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.25rem;color:#1a1a1a;line-height:1.5}h1{font-size:1.25rem}a{color:#0a7d5a}</style>
</head><body><h1>${title}</h1><p>${msg}</p>
<p><a href="https://syngyn.co">Return to Syngyn</a></p></body></html>`
}

export default async function handler(req, res) {
  const token = req.query?.u
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  const email = typeof token === 'string' ? verifyUnsubscribeToken(token) : null
  if (!email) {
    return res.status(400).send(page('Invalid link', 'This unsubscribe link is invalid or malformed. If you keep getting emails, reply to any of them and we&rsquo;ll remove you manually.'))
  }

  const ok = await suppressEmail(email, 'unsubscribe')
  if (!ok) {
    return res.status(500).send(page('Something went wrong', 'We couldn&rsquo;t process that just now. Please reply to any email and we&rsquo;ll remove you manually.'))
  }

  return res.status(200).send(page('You&rsquo;re unsubscribed', `<strong>${email}</strong> won&rsquo;t receive any more marketing emails from us. Order receipts and shipping updates for purchases you make will still come through.`))
}
