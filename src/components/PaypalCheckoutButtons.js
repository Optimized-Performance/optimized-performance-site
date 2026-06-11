import { useRef } from 'react'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'

// PayPal Smart Buttons. Replaces the redirect-style "Pay with PayPal" button.
// Renders the JS SDK inline so customers stay on the site and PayPal can
// surface PayPal account, Pay Later, and Debit/Credit Card as separate
// funding sources. Venmo is explicitly disabled (see disable-funding below).
//
// Apple Pay was deliberately removed because this account doesn't have
// Advanced Credit and Debit Card Payments (ACDC) enabled — Apple Pay is
// gated behind ACDC underwriting. If ACDC is approved later, restore the
// ApplePayBlock (see git history for the prior implementation) and add
// `applepay` to components + enable-funding.

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

export default function PaypalCheckoutButtons({
  disabled,
  validateBeforeCheckout,
  createOrderOnServer,
  onSuccess,
  onError,
}) {
  if (!PAYPAL_CLIENT_ID) {
    return (
      <p className="opp-meta-mono text-danger m-0">
        PayPal is misconfigured (missing NEXT_PUBLIC_PAYPAL_CLIENT_ID).
      </p>
    )
  }
  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID,
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
        disabled={disabled}
        validateBeforeCheckout={validateBeforeCheckout}
        createOrderOnServer={createOrderOnServer}
        onSuccess={onSuccess}
        onError={onError}
      />
    </PayPalScriptProvider>
  )
}

function PayPalStack({ disabled, validateBeforeCheckout, createOrderOnServer, onSuccess, onError }) {
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
        const { paypal_order_id, order_number } = await createOrderOnServer()
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
