import { useEffect, useRef, useState } from 'react';
import { Icon } from './Primitives';

// On-site card checkout (CARD_EXPERIENCE=inline): mounts Stripe's Payment
// Element with the client fields returned by /api/orders/create (NoRamp
// /payment-intents under the platform's connected account). Card data lives
// entirely inside Stripe's iframes — it never touches our page's JS or our
// servers, so the PCI surface is unchanged from the redirect flow.
//
// Premium treatment ported from the coaching app's 7/10 native-feel pass:
// card-premium chrome + fade-rise entrance, shimmer skeleton while Stripe
// boots, glow CTA with press-down physics — and the Element itself is themed
// via Stripe's appearance API on the site's tokens (Inter Tight, gold focus
// ring). Link is suppressed and billing fields are hidden (we already
// collected them on the form; they're passed at confirm), so the form is
// just card number / expiry / CVC.
//
// The order is already created (awaiting_payment) before this mounts. Success
// lands on /checkout/success, whose reconcile finalizes the order even if the
// gateway callback is late. Cancel just unmounts — the order stays open and
// the idempotency/resume guards reuse it on retry.
//
// Props:
//   intent       { payment_intent_id, client_secret, publishable_key, connected_account_id }
//   orderNumber  string
//   amount       number — display only; the charge amount is baked into the
//                payment intent server-side
//   billing      { name, email, address:{ line1, city, state, postal_code, country } }
//                — passed to confirmPayment since the Element hides billing fields
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

// Syngyn theme for the Payment Element — mirrors the site tokens in
// globals.css (:root --accent/--surface/--ink family, Inter Tight).
const APPEARANCE = {
  theme: 'night',
  variables: {
    colorPrimary: '#F5A623',
    colorBackground: '#101014',
    colorText: '#EDEAE2',
    colorTextSecondary: '#9C9788',
    colorTextPlaceholder: '#5D594E',
    colorDanger: '#F87171',
    fontFamily: '"Inter Tight", ui-sans-serif, system-ui, sans-serif',
    fontSizeBase: '15px',
    borderRadius: '10px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      backgroundColor: '#0C0C0F',
      border: '1px solid #2B2A26',
      boxShadow: 'none',
      padding: '12px 14px',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    },
    '.Input:focus': {
      border: '1px solid #F5A623',
      boxShadow: '0 0 0 3px rgba(245, 166, 35, 0.15)',
      outline: 'none',
    },
    '.Input--invalid': { border: '1px solid #F87171', boxShadow: 'none' },
    '.Label': {
      color: '#9C9788',
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: '6px',
    },
    '.Tab': { backgroundColor: '#0C0C0F', border: '1px solid #2B2A26' },
    '.Tab:hover': { border: '1px solid #3A3830' },
    '.Tab--selected': {
      border: '1px solid #F5A623',
      boxShadow: '0 0 0 3px rgba(245, 166, 35, 0.12)',
    },
    '.Error': { fontSize: '13px' },
  },
};

// Loaded inside Stripe's iframes (their CSP, not ours) so the Element renders
// the same face as the site.
const ELEMENT_FONTS = [
  { cssSrc: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&display=swap' },
];

export default function CardPaymentPanel({ intent, orderNumber, amount, billing, onCancel }) {
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
          fonts: ELEMENT_FONTS,
        });
        // Billing fields hidden (collected on the form, passed at confirm);
        // card ToS microtext off; Link suppressed — its bundled saved-card UI
        // is what made the default render look off-brand. Older Stripe.js
        // rejects the link wallet key, so fall back without it.
        //
        // billingDetails must be GRANULAR, not the blanket 'never': the
        // blanket form makes confirmPayment demand EVERY billing field —
        // including phone, which checkout doesn't collect — and hard-fails
        // the confirm with an IntegrationError (live incident 7/11, caught by
        // Wes/Matt on a real card). phone:'auto' lets Stripe render a phone
        // field only for methods that require one instead of demanding it
        // from us.
        const baseOpts = {
          layout: { type: 'tabs' },
          fields: {
            billingDetails: {
              name: 'never',
              email: 'never',
              phone: 'auto',
              address: 'never',
            },
          },
          terms: { card: 'never' },
        };
        try {
          paymentElement = elements.create('payment', {
            ...baseOpts,
            wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' },
          });
        } catch {
          paymentElement = elements.create('payment', baseOpts);
        }
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
        confirmParams: {
          return_url: successUrl(),
          // The Element's billing fields are hidden — supply what the form
          // already collected.
          payment_method_data: {
            billing_details: {
              name: billing?.name || '',
              email: billing?.email || '',
              address: {
                line1: billing?.address?.line1 || '',
                city: billing?.address?.city || '',
                state: billing?.address?.state || '',
                postal_code: billing?.address?.postal_code || '',
                country: billing?.address?.country || 'US',
              },
            },
          },
        },
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
    <div className="card-premium p-5 fade-rise">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] font-semibold tracking-[0.16em] uppercase text-accent-strong">
          Secure card payment
        </span>
        <span className="opp-meta-mono text-ink-mute flex items-center gap-1">
          <Icon name="lock" size={11} /> Encrypted
        </span>
      </div>
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-mono text-2xl font-bold text-ink tabular-nums">
          ${Number(amount).toFixed(2)}
        </span>
        <span className="opp-meta-mono text-ink-mute">{orderNumber}</span>
      </div>

      <div className="border-t border-line mb-4" />

      {/* Stripe mounts its iframes here; the shimmer skeleton holds the form's
          shape until the Element reports ready. Height-collapse (not display:
          none / sr-only) so the iframe keeps full width to measure against. */}
      <div className={ready ? '' : 'invisible h-0 overflow-hidden'}>
        <div ref={mountRef} />
      </div>
      {!ready && !err && (
        <div aria-hidden="true">
          <div className="skel h-4 w-24 mb-2" />
          <div className="skel h-12 w-full mb-3" />
          <div className="flex gap-3">
            <div className="skel h-12 w-1/2" />
            <div className="skel h-12 w-1/2" />
          </div>
        </div>
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
        className="btn-primary btn-glow w-full py-4 text-base mt-4"
      >
        <Icon name="lock" size={16} />
        {paying ? 'Processing…' : `Pay $${Number(amount).toFixed(2)}`}
      </button>

      <p className="opp-meta-mono text-ink-mute text-center mt-3">
        Card details are encrypted end-to-end and never touch our servers.
      </p>

      <button
        type="button"
        onClick={onCancel}
        disabled={paying}
        className="w-full mt-1 py-2 text-[13px] text-ink-mute hover:text-ink underline underline-offset-2"
      >
        Choose a different payment method
      </button>
    </div>
  );
}
