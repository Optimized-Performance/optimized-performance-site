import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import {
  PayPalScriptProvider,
  PayPalButtons,
  usePayPalScriptReducer,
} from '@paypal/react-paypal-js'

// PayPal Smart Buttons + Apple Pay. Replaces the redirect-style "Pay with
// PayPal" button. Renders the JS SDK inline so customers stay on the site
// and PayPal can surface PayPal account, Venmo, Pay Later, and Apple Pay as
// separate funding sources.
//
// Apple Pay specifically requires:
//   1. The merchant domain to be registered in PayPal Dashboard → Pay Later &
//      Apple Pay → Domain Registration (PayPal handles the Apple side).
//   2. NEXT_PUBLIC_PAYPAL_CLIENT_ID env var set (same value as the server-side
//      PAYPAL_CLIENT_ID — client IDs are safe to expose).
//   3. HTTPS (Vercel handles this).
//   4. Safari on an Apple device with a card in Wallet. The button auto-hides
//      otherwise so non-Apple users never see a broken button.

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

export default function PaypalCheckoutButtons({
  amount,
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
        components: 'buttons,applepay',
        // venmo + paylater are surfaced by the standard PayPalButtons. applepay
        // is rendered as its own native button below the PayPal stack.
        'enable-funding': 'venmo,paylater',
        'disable-funding': 'credit',
      }}
    >
      <PayPalStack
        disabled={disabled}
        validateBeforeCheckout={validateBeforeCheckout}
        createOrderOnServer={createOrderOnServer}
        onSuccess={onSuccess}
        onError={onError}
      />
      <ApplePayBlock
        amount={amount}
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

function ApplePayBlock({ amount, disabled, validateBeforeCheckout, createOrderOnServer, onSuccess, onError }) {
  const [{ isResolved }] = usePayPalScriptReducer()
  const [eligible, setEligible] = useState(false)
  const [appleSdkReady, setAppleSdkReady] = useState(false)

  useEffect(() => {
    if (!isResolved) return
    if (typeof window === 'undefined') return
    let cancelled = false
    const check = async () => {
      try {
        if (!window.paypal?.Applepay) return
        if (!window.ApplePaySession || !window.ApplePaySession.canMakePayments?.()) {
          if (!cancelled) setEligible(false)
          return
        }
        const config = await window.paypal.Applepay().config()
        if (!cancelled) setEligible(!!config?.isEligible)
      } catch {
        if (!cancelled) setEligible(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [isResolved])

  if (!eligible) return null

  const handleClick = async () => {
    if (!validateBeforeCheckout()) return
    let paypalOrderId
    let ourOrderNumber
    try {
      const created = await createOrderOnServer()
      paypalOrderId = created.paypal_order_id
      ourOrderNumber = created.order_number
    } catch (err) {
      onError(err)
      return
    }

    const session = new window.ApplePaySession(3, {
      countryCode: 'US',
      currencyCode: 'USD',
      merchantCapabilities: ['supports3DS'],
      supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
      total: { label: 'Optimized Performance', amount: amount.toFixed(2) },
    })

    session.onvalidatemerchant = async (event) => {
      try {
        const validation = await window.paypal.Applepay().validateMerchant({
          validationUrl: event.validationURL,
        })
        session.completeMerchantValidation(validation.merchantSession)
      } catch (err) {
        session.abort()
        onError(err)
      }
    }

    session.onpaymentauthorized = async (event) => {
      try {
        await window.paypal.Applepay().confirmOrder({
          orderId: paypalOrderId,
          token: event.payment.token,
          billingContact: event.payment.billingContact,
        })
        const res = await fetch('/api/orders/capture-paypal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paypal_order_id: paypalOrderId,
            order_number: ourOrderNumber,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Capture failed')
        }
        session.completePayment(window.ApplePaySession.STATUS_SUCCESS)
        onSuccess(ourOrderNumber)
      } catch (err) {
        session.completePayment(window.ApplePaySession.STATUS_FAILURE)
        onError(err)
      }
    }

    session.oncancel = () => {
      // Customer dismissed the Apple Pay sheet — no-op.
    }

    session.begin()
  }

  return (
    <>
      <Script
        src="https://applepay.cdn-apple.com/jsapi/v1/apple-pay-sdk.js"
        strategy="afterInteractive"
        onLoad={() => setAppleSdkReady(true)}
      />
      {appleSdkReady && (
        <div
          // The apple-pay-button web component takes its size from the
          // wrapping element. We give it the same height as the PayPal buttons.
          style={{
            '--apple-pay-button-width': '100%',
            '--apple-pay-button-height': '48px',
            '--apple-pay-button-border-radius': '4px',
            opacity: disabled ? 0.5 : 1,
            pointerEvents: disabled ? 'none' : 'auto',
          }}
          onClick={handleClick}
          dangerouslySetInnerHTML={{
            __html: `<apple-pay-button buttonstyle="black" type="pay" locale="en-US" style="display:block;width:100%;height:48px"></apple-pay-button>`,
          }}
        />
      )}
    </>
  )
}
