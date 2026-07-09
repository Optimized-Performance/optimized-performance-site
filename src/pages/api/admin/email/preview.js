// Admin email preview — fire a test copy of every customer-facing automated
// email (branded Syngyn shell) to a chosen address, with representative sample
// data. Lets the operator QA the whole set in one inbox. Never logs / touches
// real orders. POST { toEmail } (admin-authed).

import { validateSessionToken } from '../../../../lib/session'
import { validateOrigin, rateLimit, validateEmail } from '../../../../lib/security'
import {
  sendOrderConfirmation,
  sendShipmentNotification,
  sendDeliveryFollowup,
  sendPaymentRecoveryNudge,
  sendRefundNotification,
  sendZelleInstructions,
  sendVenmoInstructions,
} from '../../../../lib/alerts'
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendBalanceDueEmail,
} from '../../../../lib/customer-emails'

export const config = { maxDuration: 60 }

function requireAuth(req) {
  return validateSessionToken(req.headers['x-admin-token'])
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!validateOrigin(req)) return res.status(403).json({ error: 'Forbidden' })
  if (!rateLimit(req, { maxRequests: 10, windowMs: 60000 })) return res.status(429).json({ error: 'Too many requests' })
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' })

  const toEmail = String(req.body?.toEmail || '').trim()
  if (!validateEmail(toEmail)) return res.status(400).json({ error: 'Enter a valid email address.' })

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co'

  // Sample order — customer_email = toEmail so every order-based send lands in
  // the preview inbox. Fields cover what the templates read.
  const order = {
    order_number: 'SYN-PREVIEW1',
    customer_name: 'Preview Customer',
    customer_email: toEmail,
    items: [
      { name: 'Retatrutide 20mg', sku: 'OP-GLP-RT3-20MG', quantity: 1, price: 109.95 },
      { name: 'HGH 191AA 10IU (Kit of 10)', sku: 'OP-HGH-10IU-KIT', quantity: 1, price: 239.95 },
    ],
    subtotal: 349.9,
    shipping: 0,
    total: 349.9,
    shipping_address: '20 Paso del Rio',
    city: 'Carmel Valley',
    state: 'CA',
    zip: '93924',
    tracking: '9400111899223817574712', // sample USPS
    payment_method: 'card',
    affiliate_code: null,
    created_at: new Date().toISOString(),
  }
  const customer = { email: toEmail, name: 'Preview Customer' }

  // Each entry: [label, thunk]. Run sequentially, capture per-email result so one
  // failure doesn't abort the rest.
  const jobs = [
    ['order_confirmation', () => sendOrderConfirmation(order)],
    ['shipment_notification', () => sendShipmentNotification(order)],
    ['delivery_followup', () => sendDeliveryFollowup(order)],
    ['payment_recovery_nudge', () => sendPaymentRecoveryNudge(order, `${SITE_URL}/?recover=preview`)],
    ['refund_notification', () => sendRefundNotification(order, { amount: 109.95, reason: 'Preview refund' })],
    ['zelle_instructions', () => sendZelleInstructions({ ...order, payment_method: 'zelle' })],
    ['venmo_instructions', () => sendVenmoInstructions({ ...order, payment_method: 'venmo' })],
    ['balance_due_invoice', () => sendBalanceDueEmail(order, { balance: 49.95, payUrl: `${SITE_URL}/ig` })],
    ['email_verification', () => sendVerificationEmail(customer, 'preview-token-not-real')],
    ['password_reset', () => sendPasswordResetEmail(customer, 'preview-token-not-real')],
  ]

  const sent = []
  const failed = []
  for (const [label, thunk] of jobs) {
    try {
      await thunk()
      sent.push(label)
    } catch (err) {
      failed.push({ label, error: err.message })
      console.error(`[email/preview] ${label} failed:`, err.message)
    }
  }

  return res.status(200).json({ ok: true, to: toEmail, count: sent.length, sent, failed })
}
