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

import { createCheckoutSession, createCardPaymentIntent, cardCheckoutExperience } from './cardProcessor'
import { createCryptoCheckoutSession } from './cryptoProcessor'
import { createPaypalCheckoutSession } from './paypalProcessor'
import { sendZelleInstructions, sendVenmoInstructions, sendOrderReservedOwnerAlert } from '../alerts'

const cents = (total) => Math.round(Number(total) * 100)

const RAILS = {
  card: {
    kind: 'redirect',
    instant: true,
    failureError: 'Payment processor unavailable. Please try again or use crypto checkout.',
    async createSession({ orderNumber, total, customer, urls }) {
      const [firstName, ...lastParts] = String(customer.name || '').trim().split(/\s+/)
      const opts = {
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
          country: customer.country || 'US',
        },
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
      }

      // Inline experience (CARD_EXPERIENCE=inline): no redirect — return the
      // payment-intent client fields and the checkout page mounts the branded
      // Payment Element in place. The client keys off card_intent's presence,
      // so this env var alone switches (and rolls back) the whole experience.
      if (cardCheckoutExperience() === 'inline') {
        const intent = await createCardPaymentIntent(opts)
        // card_session_id doubles as the gateway payment ref for reconcile —
        // a pi_… id routes to the payment-intents reconcile endpoint.
        return {
          card_session_id: intent.paymentIntentId,
          card_intent: {
            payment_intent_id: intent.paymentIntentId,
            client_secret: intent.clientSecret,
            publishable_key: intent.publishableKey,
            connected_account_id: intent.connectedAccountId,
          },
        }
      }

      const { redirectUrl, sessionId } = await createCheckoutSession(opts)
      // card_session_id is stamped on the order by /api/orders/create (for
      // reconcile) and stripped from the client response there.
      return { redirect_url: redirectUrl, card_session_id: sessionId }
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
    async createSession({ orderNumber, total, customer, urls, paypalAccount }) {
      // Smart-Buttons flow: client submits the returned paypal_order_id back via
      // the SDK's createOrder hook. No redirect_url is used; return/cancel URLs
      // are passed for the rare popup-approval fallback. paypalAccount is the
      // resolved account this order routes to (multi-account split) — the order
      // MUST be created under the same account whose clientId rendered the
      // buttons and whose secret will capture it.
      const { paypalOrderId } = await createPaypalCheckoutSession({
        orderNumber,
        amountCents: cents(total),
        currency: 'USD',
        customer: { email: customer.email },
        returnUrl: urls.returnUrl,
        cancelUrl: urls.cancelUrl,
        account: paypalAccount,
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
        // Owner heads-up at creation — on manual rails nothing else emails the
        // operator until THEY mark the deposit received, so without this a new
        // sale is invisible (the post-card-rail "no order alerts" gap).
        try { await sendOrderReservedOwnerAlert(order) } catch (mailErr) {
          console.error('[rails/zelle] owner reserved alert failed:', mailErr.message)
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
        try { await sendOrderReservedOwnerAlert(order) } catch (mailErr) {
          console.error('[rails/venmo] owner reserved alert failed:', mailErr.message)
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
