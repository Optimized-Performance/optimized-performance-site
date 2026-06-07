// ============================================================
// Payment rail registry — the single dispatch table for checkout rails.
// ============================================================
//
// Before this, /api/orders/create ended in a 5-way if/else (card / crypto /
// paypal / zelle / venmo), each branch hand-building its processor call + its
// 200-response shape. Adding a rail (AllayPay, the NMI multi-MID router) meant
// editing that money-path if/else. This registry makes a rail a DATA entry:
// declare its kind + a createSession() that returns the response-augmenting
// fields, and create.js dispatches generically.
//
// Three rail kinds today:
//   redirect — server creates a hosted-page session; client redirects to
//              redirect_url (card via Bankful/AllayPay/NMI, crypto via NOWPayments)
//   paypal   — Smart Buttons; server returns paypal_order_id, no redirect
//   manual   — push payment (Zelle/Venmo); no processor session — reserve the
//              order, email instructions, return the instructions-page URL
//
// `createSession(ctx)` receives:
//   { order, orderNumber, total, customer:{name,email,address,city,state,zip},
//     urls:{returnUrl,cancelUrl,bankfulCallback,nowpaymentsCallback},
//     resumeOrder, siteUrl }
// and returns the fields to merge into the 200 JSON (e.g. { redirect_url } or
// { paypal_order_id }). It may throw on processor failure — create.js maps that
// to a 502 using the rail's `failureError`.
//
// NOTE: webhook parsing/capture still lives in each processor module and is
// imported directly by each /api/webhooks/* endpoint (one endpoint per
// processor URL), so it's intentionally not part of this create-side registry.

import { createCheckoutSession } from './cardProcessor'
import { createCryptoCheckoutSession } from './cryptoProcessor'
import { createPaypalCheckoutSession } from './paypalProcessor'
import { sendZelleInstructions, sendVenmoInstructions } from '../alerts'

const cents = (total) => Math.round(Number(total) * 100)

const RAILS = {
  card: {
    kind: 'redirect',
    instant: true,
    failureError: 'Payment processor unavailable. Please try again or use crypto checkout.',
    async createSession({ orderNumber, total, customer, urls }) {
      const [firstName, ...lastParts] = String(customer.name || '').trim().split(/\s+/)
      const { redirectUrl } = await createCheckoutSession({
        orderNumber,
        amountCents: cents(total),
        currency: 'USD',
        customer: {
          email: customer.email,
          firstName,
          lastName: lastParts.join(' '),
          address: customer.address,
          city: customer.city,
          state: customer.state,
          zip: customer.zip,
          country: 'US',
        },
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
        callbackUrl: urls.bankfulCallback,
      })
      return { redirect_url: redirectUrl }
    },
  },

  crypto: {
    kind: 'redirect',
    instant: true,
    failureError: 'Crypto payment processor unavailable. Please try again.',
    async createSession({ orderNumber, total, urls }) {
      const { redirectUrl } = await createCryptoCheckoutSession({
        orderNumber,
        amountCents: cents(total),
        currency: 'USD',
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
        callbackUrl: urls.nowpaymentsCallback,
      })
      return { redirect_url: redirectUrl }
    },
  },

  paypal: {
    kind: 'paypal',
    instant: true,
    failureError: 'PayPal payment processor unavailable. Please try again.',
    async createSession({ orderNumber, total, customer, urls }) {
      // Smart-Buttons flow: client submits the returned paypal_order_id back via
      // the SDK's createOrder hook. No redirect_url is used; return/cancel URLs
      // are passed for the rare popup-approval fallback.
      const { paypalOrderId } = await createPaypalCheckoutSession({
        orderNumber,
        amountCents: cents(total),
        currency: 'USD',
        customer: { email: customer.email },
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
      })
      return { paypal_order_id: paypalOrderId }
    },
  },

  zelle: {
    kind: 'manual',
    instant: false,
    async createSession({ order, orderNumber, total, resumeOrder, siteUrl }) {
      // Reserve + email the details (skipped on resume so a retry doesn't
      // re-spam). The inline pay panel reads order_number/total directly; the
      // instructions page is the email-link/desktop fallback.
      if (!resumeOrder) {
        try { await sendZelleInstructions(order) } catch (mailErr) {
          console.error('[rails/zelle] instructions email failed:', mailErr.message)
        }
      }
      return { redirect_url: `${siteUrl}/checkout/zelle-instructions?order=${encodeURIComponent(orderNumber)}&amount=${total.toFixed(2)}` }
    },
  },

  venmo: {
    kind: 'manual',
    instant: false,
    async createSession({ order, orderNumber, total, resumeOrder, siteUrl }) {
      if (!resumeOrder) {
        try { await sendVenmoInstructions(order) } catch (mailErr) {
          console.error('[rails/venmo] instructions email failed:', mailErr.message)
        }
      }
      return { redirect_url: `${siteUrl}/checkout/venmo-instructions?order=${encodeURIComponent(orderNumber)}&amount=${total.toFixed(2)}` }
    },
  },
}

export function getRail(method) {
  return RAILS[method] || null
}

// Instant rails (paypal/card/crypto) capture asynchronously via webhook →
// payment_status starts 'awaiting_payment'. Manual rails (zelle/venmo) await a
// human-confirmed deposit → start 'pending'.
export function isInstantRail(method) {
  return !!RAILS[method]?.instant
}

export function isSupportedRail(method) {
  return !!RAILS[method]
}
