import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useCart } from '../context/CartContext';
import SEO from '../components/SEO';
import { Vial, Icon } from '../components/Primitives';
import { calcShipping, FREE_SHIPPING_THRESHOLD } from '../lib/shipping';
import { isMemorialDaySaleActive, applyMemorialDiscount, MEMORIAL_DAY_DISCOUNT_PCT, calcGlp3Bogo } from '../lib/sale';
import PaypalCheckoutButtons from '../components/PaypalCheckoutButtons';

// Read the opp_ref cookie set by lib/cohort-session when a visitor arrives
// via a valid ?ref=CODE link. Used to pre-fill + auto-apply the affiliate
// code so customers from referral links get attribution without typing the
// code manually. Falls back to empty string if cookie absent / disabled.
function readRefCookie() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)opp_ref=([^;]+)/);
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
  const [researchAck, setResearchAck] = useState(false);
  const [researchField, setResearchField] = useState('');
  const [customer, setCustomer] = useState(null);
  const [authChecked, setAuthChecked] = useState(!requireAccount);
  const autoAppliedRef = useRef(false);
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

  // Memorial Day sale: applied BEFORE the affiliate discount so the affiliate
  // % stacks multiplicatively (their discount comes off the sale-discounted
  // price). Mirrors the server-side calc in /api/orders/create.js exactly so
  // the customer-visible total matches what gets charged.
  const saleActive = isMemorialDaySaleActive();
  const { discount: memorialDiscount, post: cartTotalPostMemorial } = applyMemorialDiscount(cartTotal);
  // GLP-3 Buy 2 Get 1 Free — dollar discount off subtotal, before affiliate %.
  const { discount: bogoDiscount, freeVials: bogoFreeVials } = calcGlp3Bogo(cartItems);
  const cartTotalPostPromos = cartTotalPostMemorial - bogoDiscount;

  const discountPct = affiliateApplied ? affiliateApplied.discountPct : 0;
  const discountAmount = cartTotalPostPromos * (discountPct / 100);
  const discountedSubtotal = cartTotalPostPromos - discountAmount;
  // Shipping math lives in lib/shipping.js — same helper runs server-side
  // in /api/orders/create so the totals match exactly. cartItems carry isKit
  // via spread in CartContext.addToCart, which the helper reads to detect
  // cold-pack carts. saleActive flag triggers the free-shipping override.
  const shippingBreakdown = calcShipping({ items: cartItems, discountedSubtotal, saleActive });
  const shippingCost = shippingBreakdown.total;
  const discountedTotal = discountedSubtotal + shippingCost;

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

  const buildOrderPayload = (paymentMethod) => ({
    name, email, address, city, state, zip,
    items: cartItems.map((item) => ({
      id: item.id, sku: item.sku, name: item.name,
      dosage: item.dosage, price: item.price, quantity: item.quantity,
      isPreorder: !!item.isPreorder,
      preorderShipDate: item.isPreorder ? item.preorderShipDate || null : null,
    })),
    affiliateCode: affiliateApplied?.code || null,
    researchUseAck: researchAck,
    researchField,
    paymentMethod,
  });

  const handleCheckout = async (paymentMethod) => {
    if (!validateCheckoutForm()) return;
    setSubmitting(true);
    setSubmittingMethod(paymentMethod);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOrderPayload(paymentMethod)),
      });
      const data = await res.json();
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

  // Smart-Buttons createOrder hook: server validates + creates our local order
  // + a PayPal order, returns { paypal_order_id, order_number }. The SDK then
  // hands paypal_order_id back to PayPal so the customer can approve.
  const createPaypalOrderOnServer = async () => {
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildOrderPayload('paypal')),
    });
    const data = await res.json();
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
    alert(err?.message || 'PayPal checkout failed. Please try again or use another payment method.');
  };

  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO title="Checkout" description="Complete your order — secure card or crypto payment." path="/checkout" />

      <div className="pb-8 border-b border-line">
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

          <form onSubmit={(e) => { e.preventDefault(); if (cardEnabled) handleCheckout('card'); }}>
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
                I acknowledge these products are for in-vitro research use only, I am 21+, and I am not
                purchasing for human or animal consumption.
              </span>
            </label>

            <div className="grid grid-cols-1 gap-3">
              {cardEnabled && (
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
              {(cryptoEnabled || zelleEnabled || venmoEnabled) && (() => {
                // Grid auto-sizes to the number of alt-payment buttons enabled.
                // Class names are written literally (not interpolated) so Tailwind's
                // content scanner picks them up.
                const altCount = [cryptoEnabled, zelleEnabled, venmoEnabled].filter(Boolean).length;
                const altGridClass =
                  altCount === 3 ? 'sm:grid-cols-3'
                  : altCount === 2 ? 'sm:grid-cols-2'
                  : '';
                return (
                  <div className={`grid grid-cols-1 ${altGridClass} gap-3`}>
                    {cryptoEnabled && (
                      <button
                        type="button"
                        onClick={() => handleCheckout('crypto')}
                        className="btn-outline w-full py-4 text-base"
                        disabled={submitting || !researchAck || !researchField}
                      >
                        {submitting && submittingMethod === 'crypto'
                          ? 'Processing…'
                          : `Pay $${discountedTotal.toFixed(2)} with crypto`}
                      </button>
                    )}
                    {zelleEnabled && (
                      <button
                        type="button"
                        onClick={() => handleCheckout('zelle')}
                        className="btn-outline w-full py-4 text-base"
                        disabled={submitting || !researchAck || !researchField}
                      >
                        {submitting && submittingMethod === 'zelle'
                          ? 'Processing…'
                          : `Pay $${discountedTotal.toFixed(2)} with Zelle`}
                      </button>
                    )}
                    {venmoEnabled && (
                      <button
                        type="button"
                        onClick={() => handleCheckout('venmo')}
                        className="btn-outline w-full py-4 text-base"
                        disabled={submitting || !researchAck || !researchField}
                      >
                        {submitting && submittingMethod === 'venmo'
                          ? 'Processing…'
                          : `Pay $${discountedTotal.toFixed(2)} with Venmo`}
                      </button>
                    )}
                  </div>
                );
              })()}
              {paypalEnabled && (
                <div className="mt-1">
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-line" />
                    <span className="opp-meta-mono text-ink-mute">OR PAY WITH</span>
                    <div className="flex-1 h-px bg-line" />
                  </div>
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
            <p className="opp-meta-mono text-center mt-3 leading-relaxed m-0">
              {[
                cardEnabled && 'Card processed by Bankful',
                paypalEnabled && 'PayPal, Pay Later & card via PayPal',
                cryptoEnabled && 'Crypto (BTC, ETH, USDC, USDT) by NOWPayments',
                zelleEnabled && 'Zelle direct to OPP (manual review)',
                venmoEnabled && 'Venmo to @optimizedperformance (manual review)',
              ].filter(Boolean).join('. ') + '.'}
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
                  <Vial label={item.name} dosage={item.dosage} size={40} kit={item.isKit} />
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
