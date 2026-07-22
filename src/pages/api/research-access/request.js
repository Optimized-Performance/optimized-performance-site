import { validateOrigin, rateLimit, validateEmail, validateString } from '../../../lib/security'
import { sendResearchAccessRequest } from '../../../lib/alerts'

// Researcher-access application intake. Emails the operator so they can vet the
// applicant and (manually) add the email to the gated-emails allowlist, which
// unlocks purchasing of restricted (research) SKUs. No auto-approval — manual
// review is what makes the purchase gate genuine.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 5, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Too many requests — please try again shortly.' })
  }

  try {
    const { name, email, institution, role, intendedUse } = req.body || {}
    if (!validateString(name)) return res.status(400).json({ error: 'Please enter your name.' })
    if (!validateEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' })
    if (!validateString(institution)) return res.status(400).json({ error: 'Please enter your institution or affiliation.' })
    if (!validateString(intendedUse, { minLength: 10, maxLength: 2000 })) {
      return res.status(400).json({ error: 'Please describe your intended research use (a sentence or two).' })
    }

    const sent = await sendResearchAccessRequest({
      name: String(name).trim(),
      email: String(email).trim(),
      institution: String(institution).trim(),
      role: typeof role === 'string' ? role.trim() : '',
      intendedUse: String(intendedUse).trim(),
    })

    // Don't leak configuration state to the client — always acknowledge receipt.
    if (!sent) console.warn('[research-access] application not emailed (SendGrid/ALERT_EMAIL not configured)')
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[research-access] error:', err)
    return res.status(500).json({ error: 'Something went wrong — please try again.' })
  }
}
