import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useCart } from '../context/CartContext';
import SEO from '../components/SEO';
import { Vial, Icon } from '../components/Primitives';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_TIERS, DEFAULT_SHIPPING_METHOD } from '../lib/shipping';
import { MEMORIAL_DAY_DISCOUNT_PCT, ALT_PAY_DISCOUNT_PCT } from '../lib/sale';
import { computeOrderTotals } from '../lib/pricing';
import { RECOVERY_COOKIE, RECOVERY_QUERY_PARAM } from '../lib/recovery-config';
import { track, getSessionId } from '../lib/track';
import PaypalCheckoutButtons from '../components/PaypalCheckoutButtons';
import AltRailPanel, { VENMO_HANDLE } from '../components/AltRailPanel';
import AltPaySaveBanner from '../components/AltPaySaveBanner';
import CardPaymentPanel from '../components/CardPaymentPanel';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { useCohortUi } from '../lib/cohort-ui';
import PaymentMethodTiles from '../components/PaymentMethodTiles';
import { US_STATES, CA_PROVINCES } from '../lib/us-states';
import { CANADA_SHIPPING_FLAT } from '../lib/shipping';

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
  // Billing address — card AVS checks the address the BANK has on file, which
  // can differ from where the order ships. Default "same as shipping"; when
  // unchecked, these hold the separate billing address. Only the card rail
  // uses billing (AVS); everything ships to the shipping address above.
  const [billingSame, setBillingSame] = useState(true);
  const [billingName, setBillingName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [billingCountry, setBillingCountry] = useState('US');

  // Google Places pick handlers — fill the real fields from a selected address.
  // Memoized (and declared with the other hooks, before any early return) so
  // AddressAutocomplete doesn't rebuild the Google element on every render.
  // The autocomplete is country-restricted to the selected country, so a pick
  // is always in-country — no need to touch the country field here.
  const fillShipping = useCallback((a) => {
    if (a.line1) setAddress(a.line1);
    if (a.city) setCity(a.city);
    if (a.state) setState(a.state);
    if (a.zip) setZip(a.zip);
  }, []);
  const fillBilling = useCallback((a) => {
    if (a.line1) setBillingAddress(a.line1);
    if (a.city) setBillingCity(a.city);
    if (a.state) setBillingState(a.state);
    if (a.zip) setBillingZip(a.zip);
    if (a.country === 'US' || a.country === 'CA') setBillingCountry(a.country);
  }, []);
  // Destination country (Canada launch 2026-07-11). CA switches the province
  // list, the $50 flat shipping, the card/crypto-only rails, and requires the
  // customs-risk acknowledgment below.
  const [country, setCountry] = useState('US');
  // Selected US shipping speed tier (Canada has no selector — flat $50).
  const [shippingMethod, setShippingMethod] = useState(DEFAULT_SHIPPING_METHOD);
  const [customsAck, setCustomsAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingMethod, setSubmittingMethod] = useState(null);
  // Inline card experience: the create response's payment-intent client fields
  // (+ order number/total). Non-null = the branded Payment Element panel is up.
  const [cardIntent, setCardIntent] = useState(null);
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

  // If the cart OR destination country changes while the inline card panel is
  // up, its payment intent amount is stale — drop the panel; the next "Pay
  // with card" creates a fresh order + intent.
  //
  // HOOK ORDER: this MUST stay above the early returns below (auth gate /
  // empty-cart). The cart provider hydrates from localStorage AFTER first
  // paint, so a direct load of /checkout renders empty-cart first and then
  // re-renders with items — a hook below the early return flips the hook
  // count between those renders and React #310-crashes the whole page
  // (2026-07-11 prod incident: direct loads/refreshes of checkout died for
  // ~3.5h while client-side navigation worked).
  const cartSig = cartItems.map((i) => `${i.sku || i.id}:${i.quantity}`).sort().join('|');
  useEffect(() => { setCardIntent(null); }, [cartSig, country]);

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
    flashActive,
    flashDiscount,
    flashPct,
    bogoDiscount,
    bogoFreeVials,
    volumeDiscount,
    affiliateDiscount: discountAmount,
    recoveryDiscount,
    discountedSubtotal,
    shipping: shippingBreakdown,
    altPayDiscount,
    standardTotal: discountedTotal,
    altPayTotal,
  } = computeOrderTotals({ lineItems: cartItems, affiliatePct: discountPct, recoveryPct, country, shippingMethod });
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
    if (!cartItems.length) {
      alert('Your cart is empty — please add items before checking out.');
      return false;
    }
    if (!email.trim() || !name.trim() || !address.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      alert('Please fill in all shipping fields.');
      return false;
    }
    if (!billingSame && (!billingAddress.trim() || !billingCity.trim() || !billingState.trim() || !billingZip.trim())) {
      alert('Please complete the billing address, or check "Billing same as shipping".');
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
    if (country === 'CA' && !customsAck) {
      alert('International orders require agreeing to the $50 shipping fee and the customs terms to proceed.');
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

  // Country switch: the state/province lists don't overlap, the customs ack is
  // CA-specific, and Zelle/Venmo/PayPal are US-bank rails — reset all three so
  // a stale selection can't survive the switch.
  const onCountryChange = (next) => {
    setCountry(next);
    setState('');
    setCustomsAck(false);
    if (next === 'CA' && ['zelle', 'venmo', 'paypal'].includes(selectedMethod)) {
      setSelectedMethod(null);
    }
  };

  // Resolved billing address sent to the server for card AVS. When "same as
  // shipping" is checked it mirrors the shipping fields; otherwise the separate
  // billing fields. Name falls back to the shipping name (AVS ignores name).
  const resolvedBilling = () => (billingSame
    ? { name: name.trim(), address: address.trim(), city: city.trim(), state: state.trim(), zip: zip.trim(), country }
    : {
        name: billingName.trim() || name.trim(),
        address: billingAddress.trim(), city: billingCity.trim(),
        state: billingState.trim(), zip: billingZip.trim(), country: billingCountry,
      });

  const buildOrderPayload = (paymentMethod) => ({
    name: name.trim(), email: email.trim(), address: address.trim(),
    city: city.trim(), state: state.trim(), zip: zip.trim(),
    billing: resolvedBilling(),
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
    country,
    shippingMethod: country === 'CA' ? undefined : shippingMethod,
    customsAck: country === 'CA' ? customsAck : undefined,
  });

  const handleCheckout = async (paymentMethod) => {
    if (!validateCheckoutForm()) return;
    // Inline card panel already up for this cart (e.g. Enter re-submits the
    // form behind it) — the intent is live; don't create another.
    if (paymentMethod === 'card' && cardIntent) return;
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
      // Inline card experience (CARD_EXPERIENCE=inline server-side): the
      // response carries payment-intent client fields instead of a redirect
      // URL — mount the on-site branded Payment Element and stay on the page.
      if (data.card_intent) {
        setCardIntent({
          ...data.card_intent,
          orderNumber: data.order_number,
          total: Number(data.total),
        });
        setSubmitting(false);
        setSubmittingMethod(null);
        return;
      }
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
  const createPaypalOrderOnServer = async (paypalAccount) => {
    track('payment_attempt', { value: Number(discountedTotal) || null, meta: { method: 'paypal' } });
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // paypalAccount = the server-chosen account key the Smart Buttons rendered
      // with; create.js creates the PayPal order under that same account.
      body: JSON.stringify({ ...buildOrderPayload('paypal'), paypalAccount }),
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
  // p2p_crypto (account-gated line) is always off card/PayPal (Venmo+Zelle+crypto
  // ok). zelle_crypto (legacy Rx) is off card/PayPal/Venmo, behind the kill-switch.
  // (Legacy carts persisted durableRailsOnly w/o railPolicy → treat as zelle_crypto.)
  const cartHasZelleCrypto = durableRailsGating && cartItems.some((item) => item.railPolicy === 'zelle_crypto' || (item.durableRailsOnly && item.railPolicy == null));
  const cartOffCard = cartItems.some((item) => item.railPolicy === 'p2p_crypto') || cartHasZelleCrypto;
  const cartOffVenmo = cartHasZelleCrypto;
  const cardUp = cardEnabled && railUp('card') && !cartOffCard;
  const cryptoUp = cryptoEnabled && railUp('crypto');
  const zelleUp = zelleEnabled && railUp('zelle');
  const venmoUp = venmoEnabled && railUp('venmo') && !cartOffVenmo;
  const paypalUp = paypalEnabled && railUp('paypal') && !cartOffCard;

  // Unified payment-method selector. Every available rail is presented as an
  // equal, card-grade tile (no primary-card-button vs. demoted-outline-alt
  // hierarchy, which signaled the alt rails as a sketchy side-door). Crypto and
  // Zelle show the alt-pay discount as a cheaper price + a SAVE badge — a perk, not a caveat.
  // Zelle/Venmo/PayPal are US-bank rails — Canadian destinations get card +
  // crypto only (server enforces the same in /api/orders/create).
  const intl = country === 'CA';
  const paymentMethods = [
    cardUp && { key: 'card', label: 'Card', price: discountedTotal },
    paypalUp && !intl && { key: 'paypal', label: 'PayPal', price: discountedTotal, sub: 'Pay Later & card too' },
    cryptoUp && { key: 'crypto', label: 'Crypto', price: altPayTotal, perk: cohort ? `SAVE ${ALT_PAY_DISCOUNT_PCT}%` : undefined },
    zelleUp && !intl && { key: 'zelle', label: 'Zelle', price: altPayTotal, perk: cohort ? `SAVE ${ALT_PAY_DISCOUNT_PCT}%` : undefined },
    venmoUp && !intl && { key: 'venmo', label: 'Venmo', price: discountedTotal },
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
                    className={`w-7 h-7 rounded-full flex items-center justify-center border opp-meta-mono text-[12px] ${
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
            We use your email for order updates. Payments are processed by our secure payment partners.
          </p>

          <form onSubmit={(e) => { e.preventDefault(); if (activeMethod === 'card' && cardUp) handleCheckout('card'); }}>
            <Field label="Email">
              <input
                className="input-field" type="email" required
                placeholder="researcher@lab.edu"
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Full Name">
              <input className="input-field" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <AddressAutocomplete country={country} onPick={fillShipping} label="Find your address (autofill)" />
            <Field label="Address">
              <input className="input-field" required placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="shipping street-address" />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 mb-4">
              <Field label="Country"><select className="input-field" required value={country} onChange={(e) => onCountryChange(e.target.value)} autoComplete="shipping country">
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select></Field>
              <Field label="City"><input className="input-field" required value={city} onChange={(e) => setCity(e.target.value)} autoComplete="shipping address-level2" /></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Field label={country === 'CA' ? 'Province / Territory' : 'State'}><select className="input-field" required value={state} onChange={(e) => setState(e.target.value)} autoComplete="shipping address-level1">
                <option value="" disabled>{country === 'CA' ? 'Province…' : 'State…'}</option>
                {(country === 'CA' ? CA_PROVINCES : US_STATES).map((s) => (<option key={s.code} value={s.code}>{s.name}</option>))}
              </select></Field>
              <Field label={country === 'CA' ? 'Postal code' : 'ZIP'}><input className="input-field" required value={zip} onChange={(e) => setZip(e.target.value)} placeholder={country === 'CA' ? 'A1A 1A1' : ''} autoComplete="shipping postal-code" /></Field>
            </div>

            {/* Billing address — card AVS uses the bank's address on file. Default
                same-as-shipping; uncheck to enter a separate billing address. */}
            <div className="mb-4 border-t border-line pt-4">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={billingSame}
                  onChange={(e) => setBillingSame(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-[13px] text-ink">Billing address same as shipping</span>
              </label>
              {!billingSame && (
                <div className="mt-4">
                  <p className="opp-meta-mono text-ink-soft mb-3 m-0">
                    Enter the address on file with your card&apos;s bank — a mismatch here is the #1 reason cards get declined.
                  </p>
                  <AddressAutocomplete country={billingCountry} onPick={fillBilling} label="Find your billing address (autofill)" />
                  <Field label="Cardholder Name">
                    <input className="input-field" value={billingName} onChange={(e) => setBillingName(e.target.value)} placeholder="(defaults to your name)" autoComplete="billing name" />
                  </Field>
                  <Field label="Billing Address">
                    <input className="input-field" placeholder="Street address" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} autoComplete="billing street-address" />
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 mb-4">
                    <Field label="Country"><select className="input-field" value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)} autoComplete="billing country">
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                    </select></Field>
                    <Field label="City"><input className="input-field" value={billingCity} onChange={(e) => setBillingCity(e.target.value)} autoComplete="billing address-level2" /></Field>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={billingCountry === 'CA' ? 'Province / Territory' : 'State'}><select className="input-field" value={billingState} onChange={(e) => setBillingState(e.target.value)} autoComplete="billing address-level1">
                      <option value="" disabled>{billingCountry === 'CA' ? 'Province…' : 'State…'}</option>
                      {(billingCountry === 'CA' ? CA_PROVINCES : US_STATES).map((s) => (<option key={s.code} value={s.code}>{s.name}</option>))}
                    </select></Field>
                    <Field label={billingCountry === 'CA' ? 'Postal code' : 'ZIP'}><input className="input-field" value={billingZip} onChange={(e) => setBillingZip(e.target.value)} placeholder={billingCountry === 'CA' ? 'A1A 1A1' : ''} autoComplete="billing postal-code" /></Field>
                  </div>
                </div>
              )}
            </div>
            <p className="opp-meta-mono text-ink-soft -mt-2 mb-4 m-0">
              {country === 'CA'
                ? `Canadian orders ship at a flat $${CANADA_SHIPPING_FLAT} international rate — card or crypto payment.`
                : 'We ship within the United States and Canada.'}
            </p>

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
                I am 21 years of age or older. I confirm that I am purchasing these materials exclusively for
                qualified laboratory research or analytical use. I will not use these materials for human or
                animal consumption, therapeutic use, clinical use, diagnostic use, dietary supplementation,
                dosing, injection, ingestion, or administration.
              </span>
            </label>

            {country === 'CA' && (
              <label className="flex items-start gap-3 mb-4 p-4 rounded-opp-lg border border-accent-strong bg-accent-soft text-[13px] leading-relaxed text-ink-soft cursor-pointer fade-rise">
                <input
                  type="checkbox"
                  required
                  className="mt-0.5"
                  checked={customsAck}
                  onChange={(e) => setCustomsAck(e.target.checked)}
                />
                <span>
                  <span className="font-semibold text-ink">International order acknowledgment.</span>{' '}
                  I agree to the ${CANADA_SHIPPING_FLAT} flat international shipping fee. I understand that
                  cross-border shipments are made entirely at my own risk: Syngyn is not responsible for
                  shipments that are delayed, held, inspected, or seized by customs or any border authority,
                  and no refund, replacement, or credit will be issued for orders that do not clear customs.
                  By checking this box I expressly waive any right to a refund or replacement for
                  customs-related loss.
                </span>
              </label>
            )}

            {cartOffCard && (
              <div className="mb-4 p-4 rounded-opp-lg border border-accent-strong bg-accent-soft text-center">
                <div className="opp-meta-mono text-accent-strong font-semibold">Zelle or crypto only for this order</div>
                <div className="text-[13px] text-ink-soft mt-1">An item in your cart is fulfilled via direct payment (Zelle or crypto) — and you save {ALT_PAY_DISCOUNT_PCT}%.</div>
              </div>
            )}
            {activeMethod ? (
              <>
                <div className="flex items-baseline justify-between mb-2.5">
                  <span className="font-mono text-[12px] font-medium tracking-[0.14em] uppercase text-ink-mute">Payment method</span>
                  <span className="opp-meta-mono text-ink-mute flex items-center gap-1"><Icon name="lock" size={11} /> Secure</span>
                </div>
                <PaymentMethodTiles
                  methods={paymentMethods}
                  activeMethod={activeMethod}
                  onSelect={(key) => { setSelectedMethod(key); setPaypalFailed(false); }}
                />

                <div>
                  {activeMethod === 'card' && cardUp && (
                    cardIntent ? (
                      <CardPaymentPanel
                        intent={cardIntent}
                        orderNumber={cardIntent.orderNumber}
                        amount={cardIntent.total}
                        billing={(() => {
                          const b = resolvedBilling();
                          return {
                            name: b.name,
                            email: email.trim(),
                            address: {
                              line1: b.address,
                              city: b.city,
                              state: b.state,
                              postal_code: b.zip,
                              country: b.country || 'US',
                            },
                          };
                        })()}
                        onCancel={() => setCardIntent(null)}
                      />
                    ) : (
                      <button
                        type="submit"
                        className="btn-primary btn-glow w-full py-4 text-base"
                        disabled={submitting || !researchAck || !researchField}
                      >
                        <Icon name="card" size={18} />
                        {submitting && submittingMethod === 'card'
                          ? 'Processing…'
                          : `Pay $${discountedTotal.toFixed(2)} with card`}
                      </button>
                    )
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
                <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">support@syngyn.co</a> to complete your order.
              </div>
            )}
            <p className="opp-meta-mono text-center mt-4 leading-relaxed m-0">
              {[
                cardUp && 'Cards processed securely by our payments partner',
                paypalUp && 'PayPal, Pay Later & card via PayPal',
                cryptoUp && `Crypto (BTC, ETH, USDC, USDT) — ${ALT_PAY_DISCOUNT_PCT}% off`,
                zelleUp && `Zelle direct — ${ALT_PAY_DISCOUNT_PCT}% off`,
                venmoUp && 'Venmo to @optimizedperformance',
              ].filter(Boolean).join(' · ') + '.'}
            </p>
          </form>
        </div>

        <aside className="card-premium p-6 self-start md:sticky md:top-28">
          <h3 className="font-mono text-[12px] font-semibold tracking-[0.14em] uppercase text-ink-mute m-0 mb-4">
            Order summary
          </h3>
          <div className="flex flex-col gap-3 pb-4 border-b border-line">
            {cartItems.map((item) => (
              <div key={item.id} className="flex gap-3 items-center">
                <div className="w-11 h-15 bg-surfaceAlt border border-line rounded-opp flex items-center justify-center shrink-0">
                  <Vial label={item.name} dosage={item.dosage} size={40} kit={item.isKit} sku={item.sku} image={item.imageUrl} format={item.format} />
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
            {flashActive && flashDiscount > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-accent-strong font-semibold">
                  24HR Flash ({flashPct}% off Reta / MT-2 / HGH)
                </span>
                <span className="text-accent-strong font-semibold">-${flashDiscount.toFixed(2)}</span>
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
            {volumeDiscount > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-accent-strong font-semibold">Volume discount</span>
                <span className="text-accent-strong font-semibold">-${volumeDiscount.toFixed(2)}</span>
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
            {/* Shipping method selector — US only; every tier ships insulated
                + ice pack, they differ by speed. Canada = flat $50, no choice. */}
            {country === 'US' && (
              <div className="flex flex-col gap-1.5 py-1">
                <span className="opp-meta-mono uppercase text-ink-mute">Shipping speed</span>
                {SHIPPING_TIERS.map((t) => {
                  const isFree = t.freeEligible && discountedSubtotal >= FREE_SHIPPING_THRESHOLD;
                  const selected = shippingMethod === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setShippingMethod(t.id)}
                      className={`flex items-center justify-between gap-3 rounded-opp border px-3 py-2 text-left transition-colors ${selected ? 'border-accent-strong bg-accent-soft' : 'border-line hover:border-ink-soft'}`}
                    >
                      <span>
                        <span className="text-[13px] text-ink font-semibold">{t.label}</span>
                        <span className="opp-meta-mono text-ink-mute ml-2">{t.eta}</span>
                      </span>
                      <span className={`text-[13px] font-semibold ${isFree ? 'text-success' : 'text-ink'}`}>
                        {isFree ? 'FREE' : `$${t.price.toFixed(2)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between text-[13px]">
              <span className="text-ink-soft">Shipping{shippingBreakdown.international ? ' (Canada)' : ''}</span>
              {shippingBreakdown.freeShipApplied ? (
                <span className="text-success font-semibold">FREE</span>
              ) : (
                <span className="text-ink">${shippingBreakdown.total.toFixed(2)}</span>
              )}
            </div>
            {country === 'US' && shippingMethod === 'ground' && !shippingBreakdown.freeShipApplied && (
              <p className="opp-meta-mono text-ink-mute m-0">
                Free Ground shipping on orders ${FREE_SHIPPING_THRESHOLD}+ — add ${(FREE_SHIPPING_THRESHOLD - discountedSubtotal).toFixed(2)} to qualify.
              </p>
            )}
            {country === 'US' && (
              <p className="opp-meta-mono text-ink-mute m-0">Every order ships insulated with an ice pack.</p>
            )}
            <div className="flex justify-between pt-3 border-t border-line text-base font-bold text-ink">
              <span>Total</span>
              <span>${discountedTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-4 border-t border-line font-mono text-[12px] text-ink-soft">
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
      <span className="font-mono text-[12px] font-medium tracking-[0.14em] uppercase text-ink-mute">
        {label}
      </span>
      {children}
    </label>
  );
}


