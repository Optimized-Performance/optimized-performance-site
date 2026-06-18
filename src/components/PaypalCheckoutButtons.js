import { useEffect, useRef, useState } from 'react'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'

// PayPal Smart Buttons. Renders the JS SDK inline so customers stay on the site
// and PayPal can surface PayPal account, Pay Later, and Debit/Credit Card as
// separate funding sources. Venmo is explicitly disabled (see disable-funding).
//
// Multi-account split: instead of baking one clientId, we fetch the
// server-chosen account (weighted, server-authoritative) from
// /api/payments/paypal-account on mount and init the SDK with THAT account's
// clientId, then pass its `key` into createOrder so the order is created +
// captured under the same account. On a picker failure we RETRY, then surface
// "use another method" — we do NOT fall back to a baked clientId, because the
// only baked one is OPP's (NEXT_PUBLIC_PAYPAL_CLIENT_ID) and OPP was terminated
// 2026-06-17. Rendering its buttons would route the customer into a dead
// account, fail capture, and silently strand the order.
//
// Apple Pay was deliberately removed because the account doesn't have Advanced
// Credit and Debit Card Payments (ACDC) enabled. If ACDC is approved later,
// restore the ApplePayBlock (see git history) and add `applepay`.

export default function PaypalCheckoutButtons({
  disabled,
  validateBeforeCheckout,
  createOrderOnServer,
  onSuccess,
  onError,
}) {
  // { key, clientId } once resolved. null = still resolving.
  const [account, setAccount] = useState(null)
  // True once the picker has failed all retries — render a graceful message
  // instead of dead buttons.
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Retry transient picker hiccups (cold start / timeout). We deliberately
      // do NOT fall back to a baked clientId on failure: the only baked one is
      // OPP's and OPP was terminated 2026-06-17, so its buttons would route the
      // customer into a dead account, fail capture, and strand the order.
      // Surfacing "use another method" is correct — Zelle/crypto are on the page.
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const res = await fetch('/api/payments/paypal-account')
          if (!res.ok) throw new Error(`account fetch ${res.status}`)
          const data = await res.json()
          if (data?.clientId && data?.key) {
            if (!cancelled) setAccount({ key: data.key, clientId: data.clientId })
            return
          }
          throw new Error('no clientId/key in response')
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        }
      }
      if (!cancelled) setFailed(true)
    })()
    return () => { cancelled = true }
  }, [])

  if (!account?.clientId) {
    if (failed) {
      // Picker failed all retries — don't render dead OPP buttons; point the
      // customer at the other rails on the page.
      return (
        <p className="opp-meta-mono text-ink-soft m-0" aria-live="polite">
          PayPal is temporarily unavailable — please use another payment method below.
        </p>
      )
    }
    return (
      <p className="opp-meta-mono text-ink-soft m-0" aria-live="polite">
        Loading PayPal…
      </p>
    )
  }

  return (
    <PayPalScriptProvider
      // key forces a clean SDK mount once the clientId resolves (and if it ever
      // changes between loads, which it can with weighted routing).
      key={account.clientId}
      options={{
        clientId: account.clientId,
        currency: 'USD',
        intent: 'capture',
        // `card` shows the standalone "Debit or Credit Card" guest button —
        // does NOT require ACDC underwriting. `paylater` is surfaced based on
        // per-buyer eligibility; the SDK auto-hides it when ineligible.
        // `credit` (PayPal Credit financing) is disabled because we don't want
        // a third financing option alongside paylater. `venmo` is explicitly
        // disabled (not just un-enabled — the SDK can auto-surface it for
        // eligible buyers otherwise): Venmo-via-PayPal settles through the
        // same PayPal rail but adds P2P-style surface we don't want here.
        'enable-funding': 'paylater,card',
        'disable-funding': 'credit,venmo',
      }}
    >
      <PayPalStack
        accountKey={account.key}
        disabled={disabled}
        validateBeforeCheckout={validateBeforeCheckout}
        createOrderOnServer={createOrderOnServer}
        onSuccess={onSuccess}
        onError={onError}
      />
    </PayPalScriptProvider>
  )
}

function PayPalStack({ accountKey, disabled, validateBeforeCheckout, createOrderOnServer, onSuccess, onError }) {
  const ourOrderNumberRef = useRef(null)
  return (
    <PayPalButtons
      style={{ layout: 'vertical', shape: 'rect', label: 'pay', height: 48 }}
      disabled={disabled}
      onClick={(_data, actions) => {
        const ok = validateBeforeCheckout()
        return ok ? actions.resolve() : actions.reject()
      }}
      createOrder={async () => {
        // Pass the chosen account key so the server creates the PayPal order
        // under the SAME account whose clientId rendered these buttons.
        const { paypal_order_id, order_number } = await createOrderOnServer(accountKey)
        ourOrderNumberRef.current = order_number
        return paypal_order_id
      }}
      onApprove={async (data) => {
        try {
          const res = await fetch('/api/orders/capture-paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paypal_order_id: data.orderID,
              order_number: ourOrderNumberRef.current,
            }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || 'Capture failed')
          }
          onSuccess(ourOrderNumberRef.current)
        } catch (err) {
          onError(err)
        }
      }}
      onError={(err) => onError(err)}
    />
  )
}
