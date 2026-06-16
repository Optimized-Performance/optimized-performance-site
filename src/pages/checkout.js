import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useCart } from '../context/CartContext';
import SEO from '../components/SEO';
import { Vial, Icon } from '../components/Primitives';
import { FREE_SHIPPING_THRESHOLD } from '../lib/shipping';
import { MEMORIAL_DAY_DISCOUNT_PCT, ALT_PAY_DISCOUNT_PCT } from '../lib/sale';
import { computeOrderTotals } from '../lib/pricing';
import { RECOVERY_COOKIE, RECOVERY_QUERY_PARAM } from '../lib/recovery-config';
import { track, getSessionId } from '../lib/track';
import PaypalCheckoutButtons from '../components/PaypalCheckoutButtons';
import AltRailPanel, { VENMO_HANDLE } from '../components/AltRailPanel';
import AltPaySaveBanner from '../components/AltPaySaveBanner';
import { useCohortUi } from '../lib/cohort-ui';
import PaymentMethodTiles from '../components/PaymentMethodTiles';

// Read the opp_ref cookie set by lib/cohort-session when a visitor arrives
// via a valid ?ref=CODE link. Used to pre-fill + auto-apply the affiliate
// code so customers from referral links get attribution without typing the
// code manually. Falls back to empty string if cookie absent / disabled.
function readRefCookie() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)opp_ref=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// Read the opp_recover cookie (set by lib/cohort-session when a visitor arrives
// via a ?recover=TOKEN payment-recovery link). Carries the signed token so the
// extra recovery discount follows them from the landing page to checkout. The
// token is re-verified server-side; this is only for showing the right total.
function readRecoverCookie() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${RECOVERY_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

// Card rail is gated behind an env var so it can be flipped off the moment a
// processor terminates (e.g. Bankful 2026-05-12) and back on when a new card
// rail closes — without code changes. Same pattern as the other rails below.
const cardEnabled = process.env.NEXT_PUBLIC_CARD_ENABLED === 'true';
const cryptoEnabled = process.env.NEXT_PUBLIC_CRYPTO_ENABLED === 'true';
const zelleEnabled = process.env.NEXT_PUBLIC_ZELLE_ENABLED === 'true';
const venmoEnabled = process.env.NEXT_PUBLIC_VENMO_ENABLED === 'true';
const paypalEnabled = process.env.NEXT_PUBLIC_PAYPAL_ENABLED === 'true';
// Account-required-to-purchase gate. Ships off; flip on when a processor
// (e.g. AllayPay) requires account-gated checkout. Enforced server-side too.
const requireAccount = process.env.NEXT_PUBLIC_REQUIRE_ACCOUNT === 'true';

// Idempotency key generator (P3). UUID where available; a timestamp+random
// fallback for older browsers. Makes server-side order creation exactly-once
// across retries of the same checkout attempt.
function genIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Inline alt-rail config — used by the Zelle/Venmo pay panels so the customer
// completes payment ON the checkout instead of being bounced to a separate
// instructions page (which read as a sketchy side-door and cost conversion).
// Recipient + handle mirror the server (lib/alerts.js) and the legacy
// instructions pages so a missing env var never breaks the flow.
const ZELLE_RECIPIENT = process.env.NEXT_PUBLIC_ZELLE_RECIPIENT || 'admin@optimizedperformancepeptides.com';
// Optional scannable Zelle QR exported from the bank's Zelle (BoA → Receive →
// Share QR code). Drop it at /public/zelle-qr.png or set NEXT_PUBLIC_ZELLE_QR_URL.
// A generic email QR is NOT scannable by bank Zelle apps, so we only render a
// real one and hide the slot gracefully if the asset is missing/fails to load.
const ZELLE_QR_SRC = process.env.NEXT_PUBLIC_ZELLE_QR_URL || '/zelle-qr.png';
// VENMO_HANDLE + buildVenmoUrl now live in components/AltRailPanel (VENMO_HANDLE
// re-exported and imported above for the Venmo tile's recipient prop).

// Research-field declaration required at checkout — high-risk card underwriting
// (AllayPay et al.) requires the buyer to affirm a research purpose. Kept in
// sync with the allowed list validated server-side in /api/orders/create.js.
const RESEARCH_FIELDS = [
  'Pharmacology',
  'Molecular Biology',
  'Medicinal Chemistry',
  'Biochemistry',
  'Clinical Research',
  'Other',
];

export default function Checkout() {
  const { cartItems, cartTotal } = useCart();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittingMethod, setSubmittingMethod] = useState(null);
  const [affiliateCode, setAffiliateCode] = useState('');
  const [affiliateApplied, setAffiliateApplied] = useState(null);
  const [affiliateError, setAffiliateError] = useState('');
  // Payment-recovery incentive: extra % off granted by a ?recover=TOKEN link
  // (from the abandoned-checkout email), stacks on top of any affiliate code.
  const [recoveryToken, setRecoveryToken] = useState(null);
  const [recoveryPct, setRecoveryPct] = useState(0);
  const [researchAck, setResearchAck] = useState(false);
  // Cohort-only merchandising: alt-pay SAVE badge + banner show for cohort
  // (?ref=) visitors; public/cold checkout stays free of savings-urgency copy.
  const cohort = useCohortUi();
  const [researchField, setResearchField] = useState('');
  const [customer, setCustomer] = useState(null);
  const [authChecked, setAuthChecked] = useState(!requireAccount);
  const [railAvail, setRailAvail] = useState(null);
  const [paypalFailed, setPaypalFailed] = useState(false);
  // Which payment-method tile is selected. null = fall back to the first
  // available rail (so the action area is never empty), like a card portal
  // landing with a method pre-chosen.
  const [selectedMethod, setSelectedMethod] = useState(null);
  const autoAppliedRef = useRef(false);
  const idempotencyRef = useRef({ sig: null, key: null });
  const altPayRef = useRef(null);
  const paypalRef = useRef(null);
  const router = useRouter();

  async function applyAffiliateCode(codeOverride) {
    const raw = codeOverride ?? affiliateCode;
    if (!raw || !raw.trim()) {
      setAffiliateApplied(null);
      setAffiliateError('');
      return;
    }
    const code = raw.toUpperCase().trim();
    try {
      const res = await fetch('/api/affiliates/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        setAffiliateApplied(await res.json());
        setAffiliateError('');
      } else if (res.status === 404) {
        setAffiliateApplied(null);
        setAffiliateError('Invalid or inactive code.');
      } else {
        setAffiliateApplied(null);
        setAffiliateError('Unable to validate code.');
      }
    } catch {
      setAffiliateApplied(null);
      setAffiliateError('Unable to validate code.');
    }
  }

  // On mount, read the opp_ref cookie (set by the cohort gate when the
  // visitor arrived via ?ref=CODE) and auto-fill + auto-apply the code so
  // referral attribution works without the customer typing the code. Guard
  // against re-applying on re-renders with autoAppliedRef.
  useEffect(() => {
    if (autoAppliedRef.current) return;
    const cookieCode = readRefCookie();
    if (cookieCode && !affiliateCode) {
      autoAppliedRef.current = true;
      const upper = cookieCode.toUpperCase().trim();
      setAffiliateCode(upper);
      applyAffiliateCode(upper);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Payment-recovery link: read the token from ?recover= or the opp_recover
  // cookie, validate it server-side, and arm the extra discount so the summary
  // total reflects it. Server re-verifies at order create, so a failed/forged
  // token just shows no discount here. Runs once on mount.
  // Funnel: fire checkout_start once when the checkout mounts.
  const checkoutStartRef = useRef(false);
  useEffect(() => {
    if (checkoutStartRef.current) return;
    checkoutStartRef.current = true;
    track('checkout_start', { value: Number(cartTotal) || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recoverCheckedRef = useRef(false);
  useEffect(() => {
    if (recoverCheckedRef.current) return;
    if (!router.isReady) return; // wait until router.query is populated
    recoverCheckedRef.current = true;
    const fromQuery = typeof router.query?.[RECOVERY_QUERY_PARAM] === 'string' ? router.query[RECOVERY_QUERY_PARAM] : '';
    const token = (fromQuery || readRecoverCookie() || '').trim();
    if (!token) return;
    fetch('/api/recovery/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.valid && d.pct > 0) {
          setRecoveryToken(token);
          setRecoveryPct(Number(d.pct));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Account-gating: when NEXT_PUBLIC_REQUIRE_ACCOUNT is on, check the customer
  // session on mount so the gate below renders sign-in vs. the order form.
  // No-op (authChecked starts true) when the flag is off.
  useEffect(() => {
    if (!requireAccount) return;
    let cancelled = false;
    fetch('/api/customers/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setCustomer(data?.customer || null);
        if (data?.customer?.email) setEmail((prev) => prev || data.customer.email);
        setAuthChecked(true);
      })
      .catch(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rail orchestration: fetch which payment rails are currently under their
  // volume cap so we render only available ones. Fail-open — if this errors or
  // hasn't loaded, all env-enabled rails show and the server (api/orders/create)
  // is the authoritative cap enforcer. See docs/rail-orchestration-spec.md.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/rails/availability')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setRailAvail(d?.availability || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Single source of truth for the order total + discount stacking. The server
  // (/api/orders/create) calls this SAME computeOrderTotals(), so the customer-
  // visible total and the charged total cannot drift — the class of bug behind
  // the May 2026 timezone sale-mispricing. The tiles render BOTH the standard
  // and the alt-pay (crypto/Zelle) discounted price from this one breakdown.
  // cartItems carry isKit (spread in CartContext.addToCart) for the cold-pack
  // shipping calc. Promo windows are pinned to UTC in lib/sale so client and
  // server evaluate the same instant.
  const discountPct = affiliateApplied ? affiliateApplied.discountPct : 0;
  const {
    saleActive,
    memorialDiscount,
    bogoDiscount,
    bogoFreeVials,
    affiliateDiscount: discountAmount,
    recoveryDiscount,
    discountedSubtotal,
    shipping: shippingBreakdown,
    altPayDiscount,
    standardTotal: discountedTotal,
    altPayTotal,
  } = computeOrderTotals({ lineItems: cartItems, affiliatePct: discountPct, recoveryPct });
  const altPayEnabled = cryptoEnabled || zelleEnabled;
  const altPayLabel = [cryptoEnabled && 'Crypto', zelleEnabled && 'Zelle'].filter(Boolean).join(' or ');

  // Preorder summary — derive from cart line metadata persisted by addToCart
  const preorderItems = cartItems.filter((item) => item.isPreorder);
  const hasPreorders = preorderItems.length > 0;
  const latestPreorderShipDate = (() => {
    const dates = preorderItems
      .map((item) => item.preorderShipDate)
      .filter(Boolean);
    if (dates.length === 0) return null;
    const latest = dates.sort()[dates.length - 1];
    try {
      const [y, m, d] = latest.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  })();

  if (cartItems.length === 0) {
    return (
      <div className="max-w-container mx-auto px-8 py-24 text-center">
        <span className="opp-eyebrow">Checkout</span>
        <h1 className="font-display font-semibold tracking-display text-4xl mt-3 mb-3 text-ink">
          Nothing to check out.
        </h1>
        <p className="text-ink-soft mb-6">Your cart is empty. Add a product before proceeding.</p>
        <button className="btn-primary" onClick={() => router.push('/shop')}>
          Browse catalog
        </button>
      </div>
    );
  }

  // Account-required-to-purchase gate. When NEXT_PUBLIC_REQUIRE_ACCOUNT is on
  // and the visitor isn't signed in, show a sign-in / create-account prompt
  // instead of the order form. Server-side enforced in /api/orders/create too.
  if (requireAccount && !authChecked) {
    return (
      <div className="max-w-container mx-auto px-8 py-24 text-center text-ink-soft">
        Loading…
      </div>
    );
  }
  if (requireAccount && !customer) {
    return (
      <div className="max-w-container mx-auto px-8 py-24 text-center">
        <span className="opp-eyebrow">Checkout</span>
        <h1 className="font-display font-semibold tracking-display text-4xl mt-3 mb-3 text-ink">
          Sign in to complete your order.
        </h1>
        <p className="text-ink-soft mb-6 max-w-md mx-auto">
          An account is required to purchase research compounds. Sign in or create one — it only takes a moment.
        </p>
        <button className="btn-primary" onClick={() => router.push('/account/login?next=/checkout')}>
          Sign in / Create account
        </button>
      </div>
    );
  }

  // Shared validation for all rails. PayPal Smart Buttons call this from the
  // SDK's onClick hook so they can reject() the flow if the form is incomplete.
  const validateCheckoutForm = () => {
    if (!email || !name || !address || !city || !state || !zip) {
      alert('Please fill in all shipping fields.');
      return false;
    }
    if (!researchField) {
      alert('Please select your field of research to proceed.');
      return false;
    }
    if (!researchAck) {
      alert('You must acknowledge the research-use terms (21+ and non-consumption) to proceed.');
      return false;
    }
    return true;
  };

  // Stable idempotency key per checkout attempt — regenerates only when the
  // cart changes, so retries of the same cart (pay-screen timeout, double-submit)
  // carry the same key and resume the one order server-side instead of duplicating.
  const currentIdempotencyKey = () => {
    const sig = cartItems.map((i) => `${i.sku || i.id}:${i.quantity}`).sort().join('|');
    if (idempotencyRef.current.sig !== sig || !idempotencyRef.current.key) {
      idempotencyRef.current = { sig, key: genIdempotencyKey() };
    }
    return idempotencyRef.current.key;
  };

  const buildOrderPayload = (paymentMethod) => ({
    name, email, address, city, state, zip,
    items: cartItems.map((item) => ({
      id: item.id, sku: item.sku, name: item.name,
      dosage: item.dosage, price: item.price, quantity: item.quantity,
      isPreorder: !!item.isPreorder,
      preorderShipDate: item.isPreorder ? item.preorderShipDate || null : null,
    })),
    affiliateCode: affiliateApplied?.code || null,
    recoveryToken: recoveryToken || null,
    sessionId: getSessionId(),
    idempotencyKey: currentIdempotencyKey(),
    researchUseAck: researchAck,
    researchField,
    paymentMethod,
  });

  const handleCheckout = async (paymentMethod) => {
    if (!validateCheckoutForm()) return;
    track('payment_attempt', { value: Number(discountedTotal) || null, meta: { method: paymentMethod } });
    setSubmitting(true);
    setSubmittingMethod(paymentMethod);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOrderPayload(paymentMethod)),
      });
      const data = await res.json();
      // Duplicate-order guard tripped: this exact cart was already paid for
      // moments ago. Send them to that order's confirmation instead of erroring
      // — no second charge.
      if (res.status === 409 && data.duplicate && data.existing_order_number) {
        window.location.href = `/checkout/success?order=${encodeURIComponent(data.existing_order_number)}`;
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to create order');
      if (!data.redirect_url) throw new Error('Payment processor returned no redirect URL');
      window.location.href = data.redirect_url;
      return;
    } catch (err) {
      alert(err.message || 'Something went wrong creating your order. Please try again.');
      console.error(err);
    }
    setSubmitting(false);
    setSubmittingMethod(null);
  };

  // Inline Zelle/Venmo: create + reserve the order WITHOUT redirecting, so the
  // pay panel can show the exact amount, recipient, memo/note (and the Venmo
  // deep-link) right on the checkout. Returns the order number + the
  // server-authoritative total (the alt-pay discount for zelle is applied server-side,
  // so `total` is the exact amount to send). The server also emails the same
  // details as a backup. Cart is NOT cleared here — it clears on /checkout/success
  // (where "I've sent it" lands), so the empty-cart guard can't unmount the panel.
  const createInlineOrder = async (paymentMethod) => {
    if (!validateCheckoutForm()) return { ok: false };
    track('payment_attempt', { value: Number(altPayTotal) || null, meta: { method: paymentMethod } });
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOrderPayload(paymentMethod)),
      });
      const data = await res.json();
      // Duplicate-order guard tripped — bounce to the existing order's confirmation.
      if (res.status === 409 && data.duplicate && data.existing_order_number) {
        window.location.href = `/checkout/success?order=${encodeURIComponent(data.existing_order_number)}`;
        return { ok: false };
      }
      if (!res.ok) throw new Error(data.error || 'Failed to create order');
      return { ok: true, orderNumber: data.order_number, total: Number(data.total) };
    } catch (err) {
      console.error('[checkout] inline order create failed:', err);
      return { ok: false, error: err.message || 'Something went wrong. Please try again.' };
    }
  };

  // Smart-Buttons createOrder hook: server validates + creates our local order
  // + a PayPal order, returns { paypal_order_id, order_number }. The SDK then
  // hands paypal_order_id back to PayPal so the customer can approve.
  const createPaypalOrderOnServer = async () => {
    track('payment_attempt', { value: Number(discountedTotal) || null, meta: { method: 'paypal' } });
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildOrderPayload('paypal')),
    });
    const data = await res.json();
    // Duplicate-order guard tripped (identical cart already paid moments ago):
    // bounce to that order's confirmation rather than opening a PayPal popup
    // that would double-charge. Navigation wins; the throw just halts the SDK.
    if (res.status === 409 && data.duplicate && data.existing_order_number) {
      window.location.href = `/checkout/success?order=${encodeURIComponent(data.existing_order_number)}`;
      throw new Error('This order was already completed.');
    }
    if (!res.ok || !data.paypal_order_id) {
      throw new Error(data.error || 'Failed to create PayPal order');
    }
    return { paypal_order_id: data.paypal_order_id, order_number: data.order_number };
  };

  const handlePaypalSuccess = (orderNumber) => {
    window.location.href = `/checkout/success?order=${encodeURIComponent(orderNumber)}`;
  };

  const handlePaypalError = (err) => {
    console.error('[paypal] checkout failed:', err);
    // PayPal failed — decline, popup error, or the window timing out (the
    // "pay screen timed out" case). A timeout is NOT a decline, so lead with a
    // card retry (scroll target is the failure banner, whose primary CTA jumps
    // back to the PayPal button) and offer Zelle/crypto as the fallback — don't
    // shove a good card off to Zelle. Always show the banner rather than a
    // dead-end alert.
    setPaypalFailed(true);
    setTimeout(() => altPayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  // Effective rail availability = env-enabled AND under volume cap. Fail-open:
  // null railAvail (loading/error) treats every rail as available. Crypto/Zelle
  // are uncapped server-side, so in practice only card/PayPal/Venmo hide here.
  const railUp = (rail) => !railAvail || railAvail[rail] !== false;
  // Durable-rails-only gating (Rx ancillaries → Zelle/crypto only) is a
  // kill-switch, DEFAULT OFF (Matt 2026-06-06): preemptively self-restricting
  // these SKUs to Zelle/crypto costs conversion, and any processor we land will
  // take the volume. Sell them through every rail until a compliance audit
  // forces otherwise — flip NEXT_PUBLIC_DURABLE_RAILS_GATING=true to re-arm
  // without a code change. The per-SKU durableRailsOnly flag stays as data
  // (which SKUs would be gated). Server mirrors this in /api/orders/create.js.
  const durableRailsGating = process.env.NEXT_PUBLIC_DURABLE_RAILS_GATING === 'true';
  const cartDurableOnly = durableRailsGating && cartItems.some((item) => item.durableRailsOnly);
  const cardUp = cardEnabled && railUp('card') && !cartDurableOnly;
  const cryptoUp = cryptoEnabled && railUp('crypto');
  const zelleUp = zelleEnabled && railUp('zelle');
  const venmoUp = venmoEnabled && railUp('venmo') && !cartDurableOnly;
  const paypalUp = paypalEnabled && railUp('paypal') && !cartDurableOnly;

  // Unified payment-method selector. Every available rail is presented as an
  // equal, card-grade tile (no primary-card-button vs. demoted-outline-alt
  // hierarchy, which signaled the alt rails as a sketchy side-door). Crypto and
  // Zelle show the alt-pay discount as a cheaper price + a SAVE badge — a perk, not a caveat.
  const paymentMethods = [
    cardUp && { key: 'card', label: 'Card', price: discountedTotal },
    paypalUp && { key: 'paypal', label: 'PayPal', price: discountedTotal, sub: 'Pay Later & card too' },
    cryptoUp && { key: 'crypto', label: 'Crypto', price: altPayTotal, perk: cohort ? `SAVE ${ALT_PAY_DISCOUNT_PCT}%` : undefined },
    zelleUp && { key: 'zelle', label: 'Zelle', price: altPayTotal, perk: cohort ? `SAVE ${ALT_PAY_DISCOUNT_PCT}%` : undefined },
    venmoUp && { key: 'venmo', label: 'Venmo', price: discountedTotal },
  ].filter(Boolean);
  // Pre-select the first available rail so the action area is never empty.
  const activeMethod = selectedMethod && paymentMethods.some((m) => m.key === selectedMethod)
    ? selectedMethod
    : (paymentMethods[0]?.key || null);

  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO title="Checkout" description="Complete your order — secure card or crypto payment." path="/checkout" />

      <div className="pb-8 border-b border-line flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="opp-eyebrow">Checkout</span>
          <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
            Secure order
          </h1>
          <ol className="flex gap-8 list-none p-0 mt-6">
            {['Details', 'Payment', 'Confirmation'].map((s, i) => {
              const step = submitting ? 2 : 1;
              const isActive = step === i + 1;
              return (
                <li key={s} className={`flex items-center gap-2.5 text-sm ${isActive ? 'text-ink font-semibold' : 'text-ink-mute'}`}>
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center border opp-meta-mono text-[11px] ${
                      isActive ? 'bg-ink text-paper border-ink' : 'border-line'
                    }`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{s}</span>
                </li>
              );
            })}
          </ol>
        </div>
        {cohort && altPayEnabled && (
          <AltPaySaveBanner pct={ALT_PAY_DISCOUNT_PCT} amount={altPayDiscount} label={altPayLabel} className="md:max-w-sm md:shrink-0" />
        )}
      </div>

      {hasPreorders && (
        <div className="mt-8 p-5 bg-surfaceAlt border border-line rounded-opp-lg flex items-start gap-4">
          <span className="opp-meta-mono text-accent-strong shrink-0 mt-0.5">PREORDER</span>
          <div className="text-sm text-ink-soft leading-relaxed">
            <strong className="text-ink">
              This order contains {preorderItems.length === 1 ? '1 preorder item' : `${preorderItems.length} preorder items`}.
            </strong>{' '}
            {latestPreorderShipDate
              ? `Preorder items will ship on or around ${latestPreorderShipDate}. Any in-stock items in this order ship within 1 business day; preorder items follow when inventory arrives.`
              : 'Preorder items will ship when inventory arrives — we will email you with an updated estimated ship date. Any in-stock items in this order ship within 1 business day.'}{' '}
            Your card is charged in full at checkout.
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-[1.6fr_1fr] gap-12 mt-10">
        <div className="card-premium p-8 md:p-10">
          <h2 className="font-display font-semibold tracking-display text-[28px] m-0 mb-2 text-ink">
            Contact &amp; shipping
          </h2>
          <p className="text-ink-soft m-0 mb-7">
            We use your email for order updates. Payments are processed securely off-site.
          </p>

          <form onSubmit={(e) => { e.preventDefault(); if (activeMethod === 'card' && cardUp) handleCheckout('card'); }}>
            <Field label="Email">
              <input
                className="input-field" type="email" required
                placeholder="researcher@lab.edu"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Full Name">
              <input className="input-field" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Address">
              <input className="input-field" required placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4 mb-4">
              <Field label="City"><input className="input-field" required value={city} onChange={(e) => setCity(e.target.value)} /></Field>
              <Field label="State"><input className="input-field" required value={state} onChange={(e) => setState(e.target.value)} /></Field>
              <Field label="ZIP"><input className="input-field" required value={zip} onChange={(e) => setZip(e.target.value)} /></Field>
            </div>

            <Field label="Affiliate / Promo Code (optional)">
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 uppercase font-mono font-semibold"
                  type="text" value={affiliateCode}
                  onChange={(e) => {
                    setAffiliateCode(e.target.value);
                    setAffiliateApplied(null);
                    setAffiliateError('');
                  }}
                  placeholder="Enter code"
                />
                <button type="button" onClick={() => applyAffiliateCode()} className="btn-primary px-5 whitespace-nowrap">
                  Apply
                </button>
              </div>
              {affiliateApplied && (
                <p className="opp-meta-mono text-success mt-1.5 m-0">
                  Code &ldquo;{affiliateApplied.code}&rdquo; applied — {affiliateApplied.discountPct}% off!
                </p>
              )}
              {affiliateError && <p className="opp-meta-mono text-danger mt-1.5 m-0">{affiliateError}</p>}
            </Field>

            <Field label="Field of Research">
              <select
                className="input-field"
                required
                value={researchField}
                onChange={(e) => setResearchField(e.target.value)}
              >
                <option value="" disabled>Select your field of research…</option>
                {RESEARCH_FIELDS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>

            <label className="flex items-start gap-2.5 p-4 bg-surfaceAlt rounded-opp text-[13px] text-ink-soft leading-snug mt-4 mb-6">
              <input
                type="checkbox"
                required
                className="mt-0.5"
                checked={researchAck}
                onChange={(e) => setResearchAck(e.target.checked)}
              />
              <span>
                I confirm I am a qualified researcher or institutional buyer acquiring these analytical
                reference materials strictly for in-vitro laboratory research. I am 21+ and am not purchasing
                for human or animal consumption, administration, or any therapeutic, clinical, or diagnostic use.
              </span>
            </label>

            {cartDurableOnly && (
              <div className="mb-4 p-4 rounded-opp-lg border border-accent-strong bg-accent-soft text-center">
                <div className="opp-meta-mono text-accent-strong font-semibold">Zelle or crypto only for this order</div>
                <div className="text-[13px] text-ink-soft mt-1">An item in your cart is fulfilled via direct payment (Zelle or crypto) — and you save {ALT_PAY_DISCOUNT_PCT}%.</div>
              </div>
            )}
            {activeMethod ? (
              <>
                <div className="flex items-baseline justify-between mb-2.5">
                  <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Payment method</span>
                  <span className="opp-meta-mono text-ink-mute flex items-center gap-1"><Icon name="lock" size={11} /> Secure</span>
                </div>
                <PaymentMethodTiles
                  methods={paymentMethods}
                  activeMethod={activeMethod}
                  onSelect={(key) => { setSelectedMethod(key); setPaypalFailed(false); }}
                />

                <div>
                  {activeMethod === 'card' && cardUp && (
                    <button
                      type="submit"
                      className="btn-primary w-full py-4 text-base"
                      disabled={submitting || !researchAck || !researchField}
                    >
                      <Icon name="card" size={18} />
                      {submitting && submittingMethod === 'card'
                        ? 'Processing…'
                        : `Pay $${discountedTotal.toFixed(2)} with card`}
                    </button>
                  )}
                  {activeMethod === 'crypto' && cryptoUp && (
                    <button
                      type="button"
                      onClick={() => handleCheckout('crypto')}
                      className="btn-primary w-full py-4 text-base"
                      disabled={submitting || !researchAck || !researchField}
                    >
                      {submitting && submittingMethod === 'crypto'
                        ? 'Processing…'
                        : `Pay $${altPayTotal.toFixed(2)} with crypto`}
                    </button>
                  )}
                  {activeMethod === 'zelle' && zelleUp && (
                    <AltRailPanel
                      method="zelle"
                      previewAmount={altPayTotal}
                      recipient={ZELLE_RECIPIENT}
                      qrSrc={ZELLE_QR_SRC}
                      disabled={!researchAck || !researchField}
                      onCreateOrder={() => createInlineOrder('zelle')}
                      onDone={(orderNumber) => { window.location.href = `/checkout/success?order=${encodeURIComponent(orderNumber)}`; }}
                    />
                  )}
                  {activeMethod === 'venmo' && venmoUp && (
                    <AltRailPanel
                      method="venmo"
                      previewAmount={discountedTotal}
                      recipient={`@${VENMO_HANDLE}`}
                      disabled={!researchAck || !researchField}
                      onCreateOrder={() => createInlineOrder('venmo')}
                      onDone={(orderNumber) => { window.location.href = `/checkout/success?order=${encodeURIComponent(orderNumber)}`; }}
                    />
                  )}
                  {activeMethod === 'paypal' && paypalUp && (
                    <div ref={paypalRef}>
                      {paypalFailed && (
                        <div ref={altPayRef} className="rounded-opp border border-warning bg-warning/10 p-4 mb-3">
                          <div className="opp-meta-mono uppercase text-warning font-semibold">Payment didn&apos;t go through</div>
                          <div className="text-[13px] text-ink-soft mt-1">
                            That&apos;s usually a momentary timeout, not your card — give it another try below.
                            {(cryptoUp || zelleUp) && <> Or switch to <strong>{altPayLabel}</strong> above and <strong>save {ALT_PAY_DISCOUNT_PCT}%</strong>.</>}
                          </div>
                        </div>
                      )}
                      <PaypalCheckoutButtons
                        disabled={!researchAck || !researchField || submitting}
                        validateBeforeCheckout={validateCheckoutForm}
                        createOrderOnServer={createPaypalOrderOnServer}
                        onSuccess={handlePaypalSuccess}
                        onError={handlePaypalError}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4 rounded-opp-lg border border-line bg-surfaceAlt text-center text-ink-soft text-sm">
                No payment methods are currently available. Please email{' '}
                <a href="mailto:admin@optimizedperformancepeptides.com" className="text-accent-strong hover:underline">admin@optimizedperformancepeptides.com</a> to complete your order.
              </div>
            )}
            <p className="opp-meta-mono text-center mt-4 leading-relaxed m-0">
              {[
                cardUp && 'Card processed securely off-site',
                paypalUp && 'PayPal, Pay Later & card via PayPal',
                cryptoUp && `Crypto (BTC, ETH, USDC, USDT) — ${ALT_PAY_DISCOUNT_PCT}% off`,
                zelleUp && `Zelle direct — ${ALT_PAY_DISCOUNT_PCT}% off`,
                venmoUp && 'Venmo to @optimizedperformance',
              ].filter(Boolean).join(' · ') + '.'}
            </p>
          </form>
        </div>

        <aside className="card-premium p-6 self-start md:sticky md:top-28">
          <h3 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-mute m-0 mb-4">
            Order summary
          </h3>
          <div className="flex flex-col gap-3 pb-4 border-b border-line">
            {cartItems.map((item) => (
              <div key={item.id} className="flex gap-3 items-center">
                <div className="w-11 h-15 bg-surfaceAlt border border-line rounded-opp flex items-center justify-center shrink-0">
                  <Vial label={item.name} dosage={item.dosage} size={40} kit={item.isKit} sku={item.sku} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold leading-snug text-ink">
                    {item.name} · {item.dosage}
                  </div>
                  <div className="opp-meta-mono">
                    {item.sku} × {item.quantity}
                  </div>
                </div>
                <div className="text-[13px] font-semibold text-ink">
                  ${(item.price * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 py-4">
            <div className="flex justify-between text-[13px]">
              <span className="text-ink-soft">Subtotal</span>
              <span className="text-ink">${cartTotal.toFixed(2)}</span>
            </div>
            {saleActive && memorialDiscount > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-accent-strong font-semibold">
                  Memorial Day Sale ({MEMORIAL_DAY_DISCOUNT_PCT}% off)
                </span>
                <span className="text-accent-strong font-semibold">-${memorialDiscount.toFixed(2)}</span>
              </div>
            )}
            {bogoDiscount > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-accent-strong font-semibold">
                  GLP-3 Buy 2 Get 1 Free ({bogoFreeVials} free)
                </span>
                <span className="text-accent-strong font-semibold">-${bogoDiscount.toFixed(2)}</span>
              </div>
            )}
            {affiliateApplied && (
              <div className="flex justify-between text-[13px]">
                <span className="text-success font-semibold">
                  Discount ({affiliateApplied.discountPct}% — {affiliateApplied.code})
                </span>
                <span className="text-success font-semibold">-${discountAmount.toFixed(2)}</span>
              </div>
            )}
            {recoveryPct > 0 && recoveryDiscount > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-success font-semibold">
                  Welcome-back discount ({recoveryPct}% off)
                </span>
                <span className="text-success font-semibold">-${recoveryDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-[13px]">
              <span className="text-ink-soft">Shipping</span>
              {shippingBreakdown.freeShipApplied ? (
                <span className="text-success font-semibold">FREE</span>
              ) : (
                <span className="text-ink">${shippingBreakdown.base.toFixed(2)}</span>
              )}
            </div>
            {shippingBreakdown.hasColdPack && (
              <>
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-soft">Cold-pack handling</span>
                  <span className="text-ink">${shippingBreakdown.coldPack.toFixed(2)}</span>
                </div>
                <p className="opp-meta-mono text-ink-mute m-0">
                  Kits ship in a larger thermal-insulated mailer via USPS Priority Mail. Surcharge covers the larger mailer + faster transit.
                </p>
              </>
            )}
            {!shippingBreakdown.hasColdPack && !shippingBreakdown.freeShipApplied && (
              <p className="opp-meta-mono text-ink-mute m-0">
                Free standard shipping on vial-only orders ${FREE_SHIPPING_THRESHOLD}+ — add ${(FREE_SHIPPING_THRESHOLD - discountedSubtotal).toFixed(2)} to qualify.
              </p>
            )}
            {shippingBreakdown.hasColdPack && (
              <p className="opp-meta-mono text-ink-mute m-0">
                Cold-pack shipping applies to all kit orders — free-shipping threshold does not apply.
              </p>
            )}
            <div className="flex justify-between pt-3 border-t border-line text-base font-bold text-ink">
              <span>Total</span>
              <span>${discountedTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-4 border-t border-line font-mono text-[10px] text-ink-soft">
            <div className="flex items-center gap-2">
              <span className="text-accent-strong"><Icon name="lock" size={12} /></span>
              <span>Encrypted checkout</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-accent-strong"><Icon name="doc" size={12} /></span>
              <span>RUO research compounds</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-accent-strong"><Icon name="truck" size={12} /></span>
              <span>Ships within 1 business day</span>
            </div>
          </div>

          {cohort && altPayEnabled && (
            <AltPaySaveBanner pct={ALT_PAY_DISCOUNT_PCT} amount={altPayDiscount} label={altPayLabel} className="mt-5" />
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5 mb-4">
      <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">
        {label}
      </span>
      {children}
    </label>
  );
}


