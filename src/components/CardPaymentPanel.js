import { useEffect, useRef, useState } from 'react';
import { Icon } from './Primitives';

// On-site card checkout (CARD_EXPERIENCE=inline): mounts Stripe's Payment
// Element with the client fields returned by /api/orders/create (NoRamp
// /payment-intents under the platform's connected account). Card data lives
// entirely inside Stripe's iframes — it never touches our page's JS or our
// servers, so the PCI surface is unchanged from the redirect flow.
//
// The order is already created (awaiting_payment) before this mounts. Success
// lands on /checkout/success, whose reconcile finalizes the order even if the
// gateway callback is late. Cancel just unmounts — the order stays open and
// the idempotency/resume guards reuse it on retry, exactly like an abandoned
// hosted-page redirect today.
//
// Props:
//   intent       { payment_intent_id, client_secret, publishable_key, connected_account_id }
//   orderNumber  string
//   amount       number — server-authoritative total (display only; the charge
//                amount is baked into the payment intent server-side)
//   onCancel     () => void — back to payment-method selection

// Stripe.js is loaded once per page, on demand — only inline-card checkouts
// ever pay the script cost.
let stripeJsPromise = null;
function loadStripeJs() {
  if (typeof window !== 'undefined' && window.Stripe) return Promise.resolve(window.Stripe);
  if (!stripeJsPromise) {
    stripeJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.async = true;
      s.onload = () => resolve(window.Stripe);
      s.onerror = () => {
        stripeJsPromise = null;
        reject(new Error('The payment form could not load. Check your connection and try again.'));
      };
      document.head.appendChild(s);
    });
  }
  return stripeJsPromise;
}

// Syngyn black/gold theme for the Payment Element.
const APPEARANCE = {
  theme: 'night',
  variables: {
    colorPrimary: '#F5A623',
    colorBackground: '#101113',
    colorText: '#E8E6E1',
    colorTextSecondary: '#A6A296',
    colorDanger: '#F87171',
    borderRadius: '10px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    spacingUnit: '4px',
  },
};

export default function CardPaymentPanel({ intent, orderNumber, amount, onCancel }) {
  const mountRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [paying, setPaying] = useState(false);

  const successUrl = () =>
    `${window.location.origin}/checkout/success?order=${encodeURIComponent(orderNumber)}`;

  useEffect(() => {
    let cancelled = false;
    let paymentElement = null;
    setReady(false);
    setErr('');
    (async () => {
      try {
        const Stripe = await loadStripeJs();
        if (cancelled || !mountRef.current) return;
        const stripe = Stripe(
          intent.publishable_key,
          intent.connected_account_id ? { stripeAccount: intent.connected_account_id } : {}
        );
        const elements = stripe.elements({
          clientSecret: intent.client_secret,
          appearance: APPEARANCE,
        });
        paymentElement = elements.create('payment', { layout: 'tabs' });
        paymentElement.on('ready', () => { if (!cancelled) setReady(true); });
        paymentElement.on('loaderror', (e) => {
          if (!cancelled) setErr(e?.error?.message || 'The payment form could not load. Please try again.');
        });
        paymentElement.mount(mountRef.current);
        stripeRef.current = stripe;
        elementsRef.current = elements;
      } catch (e) {
        if (!cancelled) setErr(e.message || 'The payment form could not load. Please try again.');
      }
    })();
    return () => {
      cancelled = true;
      try { paymentElement?.destroy(); } catch { /* already gone */ }
      stripeRef.current = null;
      elementsRef.current = null;
    };
  }, [intent.client_secret, intent.publishable_key, intent.connected_account_id]);

  async function pay() {
    if (!stripeRef.current || !elementsRef.current || paying) return;
    setPaying(true);
    setErr('');
    try {
      const submitRes = await elementsRef.current.submit();
      if (submitRes.error) {
        setErr(submitRes.error.message || 'Please check your card details.');
        setPaying(false);
        return;
      }
      // redirect: 'if_required' — plain card charges confirm in place; 3DS or
      // wallet flows may bounce through the issuer and land on return_url
      // themselves. Either way we end on /checkout/success, which reconciles
      // the intent server-side (so a late callback can't strand the order).
      const result = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: successUrl() },
        redirect: 'if_required',
      });
      if (result.error) {
        setErr(result.error.message || 'Payment failed. Please try again.');
        setPaying(false);
        return;
      }
      window.location.href = successUrl();
    } catch (e) {
      setErr(e.message || 'Payment failed. Please try again.');
      setPaying(false);
    }
  }

  return (
    <div className="rounded-opp-lg border border-line p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="opp-meta-mono text-ink-mute">Order {orderNumber}</span>
        <span className="opp-meta-mono text-ink-mute flex items-center gap-1">
          <Icon name="lock" size={11} /> Encrypted card form
        </span>
      </div>

      {/* Stripe mounts its iframe here; skeleton holds the space until ready */}
      <div ref={mountRef} />
      {!ready && !err && (
        <div className="py-8 text-center text-[13px] text-ink-mute">Loading secure payment form…</div>
      )}

      {err && (
        <div className="mt-3 p-3 rounded-opp-lg border border-red-500/40 bg-red-500/10 text-[13px] text-red-300">
          {err}
        </div>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={!ready || paying}
        className="btn-primary w-full py-4 text-base mt-4"
      >
        <Icon name="card" size={18} />
        {paying ? 'Processing…' : `Pay $${Number(amount).toFixed(2)}`}
      </button>

      <button
        type="button"
        onClick={onCancel}
        disabled={paying}
        className="w-full mt-2 py-2 text-[13px] text-ink-mute hover:text-ink underline underline-offset-2"
      >
        Choose a different payment method
      </button>
    </div>
  );
}
