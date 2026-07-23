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

// Invoice for an added balance after an admin edits an order upward (e.g. a
// customer calls to add an item). Sends the customer a card pay-link for just
// the difference. payUrl is a NoRamp hosted-checkout URL scoped to the balance.
export async function sendBalanceDueEmail(order, { balance, payUrl }) {
  const amt = `$${Number(balance || 0).toFixed(2)}`
  const num = order.order_number
  const text = [
    `We've updated order ${num} at your request.`,
    ``,
    `There's a remaining balance of ${amt} for the added item(s).`,
    ``,
    `Pay the balance securely here: ${payUrl}`,
    ``,
    `Your order ships once the balance is received.`,
    ``,
    `— Syngyn`,
  ].join('\n')
  const html = renderBrandedEmail({
    preheader: `Balance due on order ${num}: ${amt}.`,
    eyebrow: `Order ${num}`,
    heading: 'Balance due on your updated order',
    paragraphs: [
      `We've updated your order at your request. There's a remaining balance of <strong>${amt}</strong> for the added item(s).`,
      `Click below to pay it securely — your order ships once the balance is received.`,
    ],
    cta: { text: `Pay ${amt}`, url: payUrl },
    ctaSub: 'Secure checkout · charge appears as SYNGYN.',
    note: `Questions? Just reply to this email.`,
    footerLines: emailFooterLines(),
  })
  return send({ to: order.customer_email, subject: `Balance due on order ${num} — Syngyn`, text, html })
}

// Full-order card invoice (admin-initiated). For customers who can't use the
// on-site rails — the admin creates the order from the Orders tab and emails
// them a NoRamp hosted pay-link for the whole total. The order sits 'pending'
// until the gateway callback finalizes it (inventory/affiliate/confirmation).
export async function sendCardInvoiceEmail(order, { payUrl }) {
  const amt = `$${Number(order.total || 0).toFixed(2)}`
  const num = order.order_number
  const itemLines = (Array.isArray(order.items) ? order.items : []).map(
    (it) => `${it.quantity}× ${it.name} — $${(Number(it.price) * Number(it.quantity)).toFixed(2)}`
  )
  const text = [
    `Here's your invoice for order ${num}.`,
    ``,
    ...itemLines,
    ``,
    `Total: ${amt}`,
    ``,
    `Pay securely by card here: ${payUrl}`,
    ``,
    `Your order ships once payment is received.`,
    ``,
    `— Syngyn`,
  ].join('\n')
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = renderBrandedEmail({
    preheader: `Invoice for order ${num}: ${amt}.`,
    eyebrow: `Order ${num}`,
    heading: 'Your invoice is ready',
    paragraphs: [
      `Here's your invoice for order ${num}:`,
      itemLines.map(esc).join('<br/>'),
      `Total: <strong>${amt}</strong>`,
      `Click below to pay securely by card — your order ships once payment is received.`,
    ],
    cta: { text: `Pay ${amt}`, url: payUrl },
    ctaSub: 'Secure card checkout · charge appears as SYNGYN.',
    note: `Questions? Just reply to this email.`,
    footerLines: emailFooterLines(),
  })
  return send({ to: order.customer_email, subject: `Invoice for order ${num} — Syngyn`, text, html })
}

// Researcher-access approved — sent to the applicant when the operator taps
// Approve. Tells them the exact email to use and points them to sign in /
// create an account so purchasing unlocks.
export async function sendResearchAccessApproved(email) {
  const loginUrl = `${SITE_URL}/account/login?next=${encodeURIComponent('/shop')}`
  const text = [
    `Your researcher-access application is approved.`,
    ``,
    `Sign in (or create an account) with THIS email — ${email} — and you can`,
    `order restricted research items. Access is tied to this address, so use it`,
    `when you sign in or register.`,
    ``,
    `Sign in / create account: ${loginUrl}`,
    ``,
    `— Syngyn`,
  ].join('\n')
  const html = renderBrandedEmail({
    preheader: 'Your researcher access is approved.',
    eyebrow: 'Researcher access',
    heading: 'You’re approved',
    paragraphs: [
      `Your researcher-access application is approved.`,
      `Sign in — or create an account — with <strong>this email address</strong> (${email}), and purchasing unlocks for restricted research items. Access is tied to this address, so use it when you sign in or register.`,
    ],
    cta: { text: 'Sign in / create account', url: loginUrl },
    ctaSub: 'Use the email this was sent to.',
    note: `Questions? Just reply to this email.`,
    footerLines: emailFooterLines(),
  })
  return send({ to: email, subject: 'You’re approved — Syngyn researcher access', text, html })
}

// isNew = true → this address was a prior guest-checkout customer who never had
// a login account (grandfathered for purchase but account-less). The reset link
// SETS their first password rather than resetting one, so the copy is framed as
// "finish setting up your account."
export async function sendPasswordResetEmail(customer, token, { isNew = false } = {}) {
  const url = `${SITE_URL}/account/reset?token=${encodeURIComponent(token)}`
  const text = isNew
    ? [
        `You've ordered with us before, but accounts are new to Syngyn — so you`,
        `don't have a password set yet. Set one to sign in:`,
        ``,
        `Set your password: ${url}`,
        ``,
        `Your researcher access carries over to this email automatically, so once`,
        `you're signed in you can order right away. The link is valid for 1 hour.`,
        ``,
        `If this wasn't you, you can ignore it — nothing changes.`,
        ``,
        `— Syngyn`,
      ].join('\n')
    : [
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
    preheader: isNew ? 'Set your Syngyn password to sign in.' : 'Reset your Syngyn password.',
    eyebrow: 'Account',
    heading: isNew ? 'Set your password' : 'Reset your password',
    paragraphs: isNew
      ? [
          `You've ordered with us before, but accounts are new to Syngyn — so there's no password on this email yet. Set one below to sign in.`,
          `Your researcher access already applies to this email, so you can order as soon as you're signed in.`,
        ]
      : [
          `Someone (hopefully you) requested a password reset for this account. Click below to set a new one.`,
        ],
    cta: { text: isNew ? 'Set password' : 'Reset password', url },
    ctaSub: 'Valid for 1 hour.',
    note: isNew ? `Didn't order with us? Ignore this — nothing changes.` : `Didn't request this? Ignore it — your current password stays active.`,
    footerLines: emailFooterLines(),
  })
  return send({
    to: customer.email,
    subject: isNew ? 'Set your password to sign in — Syngyn' : 'Reset your password — Syngyn',
    text,
    html,
  })
}
