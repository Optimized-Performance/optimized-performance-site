// Customer account emails — verification + password reset. SERVER ONLY.
// Branded multipart sends matching lib/alerts.js (same SendGrid pattern,
// same renderBrandedEmail shell, same footer). Both are TRANSACTIONAL:
// they do not check email_suppressions — an unsubscribed customer can
// still reset their password.

import { renderBrandedEmail } from './email-layout'
import { emailFooterLines } from './alerts'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co'

async function send({ to, subject, text, html }) {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey || !to) {
    console.log('[customer-emails] send skipped (not configured) —', subject)
    return false
  }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.FROM_EMAIL || 'orders@syngyn.co' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
        // Click tracking OFF: SendGrid rewrites links through url####.syngyn.co,
        // whose branded-link SSL isn't provisioned → ERR_CERT_COMMON_NAME_INVALID
        // on every link. Transactional mail needs no analytics; keep it off in
        // code so a dashboard toggle can never re-break the verify/reset path.
        tracking_settings: { click_tracking: { enable: false, enable_text: false } },
      }),
    })
    if (!res.ok) {
      console.error('[customer-emails] SendGrid error', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[customer-emails] send failed:', err.message)
    return false
  }
}

export async function sendVerificationEmail(customer, token) {
  const url = `${SITE_URL}/api/customers/verify-email?token=${encodeURIComponent(token)}`
  const text = [
    `Verify your email to unlock your order history.`,
    ``,
    `Click to verify: ${url}`,
    ``,
    `Once verified, your account at ${SITE_URL}/account shows every order placed`,
    `with this email — status, tracking, and one-click reorder.`,
    ``,
    `If you didn't create an account with us, you can ignore this email.`,
    ``,
    `— Syngyn`,
  ].join('\n')
  const html = renderBrandedEmail({
    preheader: 'One click to unlock your order history.',
    eyebrow: 'Account',
    heading: 'Verify your email',
    paragraphs: [
      `Click below to verify this email address. Once verified, your account shows every order placed with it — status, tracking, and one-click reorder.`,
    ],
    cta: { text: 'Verify email', url },
    ctaSub: 'Link valid for 7 days.',
    note: `If you didn't create an account with us, ignore this email — nothing happens without the click.`,
    footerLines: emailFooterLines(),
  })
  return send({ to: customer.email, subject: 'Verify your email — Syngyn', text, html })
}

export async function sendPasswordResetEmail(customer, token) {
  const url = `${SITE_URL}/account/reset?token=${encodeURIComponent(token)}`
  const text = [
    `Someone requested a password reset for this account.`,
    ``,
    `Reset your password: ${url}`,
    ``,
    `The link is valid for 1 hour and stops working as soon as the password`,
    `changes. If you didn't request this, you can ignore it — your current`,
    `password stays active.`,
    ``,
    `— Syngyn`,
  ].join('\n')
  const html = renderBrandedEmail({
    preheader: 'Reset your Syngyn password.',
    eyebrow: 'Account',
    heading: 'Reset your password',
    paragraphs: [
      `Someone (hopefully you) requested a password reset for this account. Click below to set a new one.`,
    ],
    cta: { text: 'Reset password', url },
    ctaSub: 'Valid for 1 hour · dies once the password changes.',
    note: `Didn't request this? Ignore it — your current password stays active.`,
    footerLines: emailFooterLines(),
  })
  return send({ to: customer.email, subject: 'Reset your password — Syngyn', text, html })
}
