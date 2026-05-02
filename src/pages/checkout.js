import { useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useCart } from '../context/CartContext';
import SEO from '../components/SEO';
import { Vial, Icon } from '../components/Primitives';

const MoonPayBuyWidget = dynamic(
  () => import('@moonpay/moonpay-react').then((mod) => mod.MoonPayBuyWidget),
  { ssr: false }
);

const cryptoEnabled = process.env.NEXT_PUBLIC_CRYPTO_ENABLED === 'true';

export default function Checkout() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const [showMoonPay, setShowMoonPay] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittingMethod, setSubmittingMethod] = useState(null);
  const [affiliateCode, setAffiliateCode] = useState('');
  const [affiliateApplied, setAffiliateApplied] = useState(null);
  const [affiliateError, setAffiliateError] = useState('');
  const [serverTotal, setServerTotal] = useState(null);
  const [researchAck, setResearchAck] = useState(false);
  const router = useRouter();

  async function applyAffiliateCode() {
    if (!affiliateCode.trim()) {
      setAffiliateApplied(null);
      setAffiliateError('');
      return;
    }
    const code = affiliateCode.toUpperCase().trim();
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

  const discountPct = affiliateApplied ? affiliateApplied.discountPct : 0;
  const discountAmount = cartTotal * (discountPct / 100);
  const discountedTotal = cartTotal - discountAmount;

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

  if (cartItems.length === 0 && !orderPlaced) {
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

  if (orderPlaced) {
    return (
      <div className="max-w-container mx-auto px-8 py-20 text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-success text-surface flex items-center justify-center mx-auto mb-6">
          <Icon name="check" size={32} />
        </div>
        <h1 className="font-display font-semibold tracking-display text-4xl m-0 mb-2 text-ink">
          Order placed.
        </h1>
        {orderNumber && (
          <p className="opp-meta-mono text-accent-strong mb-2">Order #{orderNumber}</p>
        )}
        <p className="text-ink-soft max-w-md mx-auto mb-8">
          Confirmation sent to your email. You&apos;ll receive a tracking number once it ships.
        </p>
        <button className="btn-primary" onClick={() => router.push('/')}>
          Back to Home <Icon name="arrow" size={16} />
        </button>
      </div>
    );
  }

  const handleCheckout = async (paymentMethod) => {
    if (!email || !name || !address || !city || !state || !zip) {
      alert('Please fill in all shipping fields.');
      return;
    }
    if (!researchAck) {
      alert('You must acknowledge the research-use terms (21+ and non-consumption) to proceed.');
      return;
    }
    setSubmitting(true);
    setSubmittingMethod(paymentMethod);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, address, city, state, zip,
          items: cartItems.map((item) => ({
            id: item.id, sku: item.sku, name: item.name,
            dosage: item.dosage, price: item.price, quantity: item.quantity,
            isPreorder: !!item.isPreorder,
            preorderShipDate: item.isPreorder ? item.preorderShipDate || null : null,
          })),
          affiliateCode: affiliateApplied?.code || null,
          researchUseAck: researchAck,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create order');
      setOrderNumber(data.order_number);
      if (typeof data.total === 'number') setServerTotal(data.total);
      if (paymentMethod === 'card') {
        if (!data.redirect_url) throw new Error('Payment processor returned no redirect URL');
        window.location.href = data.redirect_url;
        return;
      }
      setShowMoonPay(true);
    } catch (err) {
      alert(err.message || 'Something went wrong creating your order. Please try again.');
      console.error(err);
    }
    setSubmitting(false);
    setSubmittingMethod(null);
  };

  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO title="Checkout" description="Complete your order — secure payment via MoonPay." path="/checkout" />

      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Checkout</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Secure order
        </h1>
        <ol className="flex gap-8 list-none p-0 mt-6">
          {['Details', 'Payment', 'Confirmation'].map((s, i) => {
            const step = submitting || showMoonPay ? 2 : 1;
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
            We use your email for order updates. Card payments are processed securely by MoonPay.
          </p>

          <form onSubmit={(e) => { e.preventDefault(); handleCheckout('card'); }}>
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
                <button type="button" onClick={applyAffiliateCode} className="btn-primary px-5 whitespace-nowrap">
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

            <div className={`grid grid-cols-1 ${cryptoEnabled ? 'sm:grid-cols-2' : ''} gap-3`}>
              <button
                type="submit"
                className="btn-primary w-full py-4 text-base"
                disabled={submitting || !researchAck}
              >
                <Icon name="card" size={18} />
                {submitting && submittingMethod === 'card'
                  ? 'Processing…'
                  : `Pay $${discountedTotal.toFixed(2)} with card`}
              </button>
              {cryptoEnabled && (
                <button
                  type="button"
                  onClick={() => handleCheckout('crypto')}
                  className="btn-outline w-full py-4 text-base"
                  disabled={submitting || !researchAck}
                >
                  {submitting && submittingMethod === 'crypto'
                    ? 'Processing…'
                    : `Pay $${(discountedTotal * 1.04).toFixed(2)} with crypto`}
                </button>
              )}
            </div>
            <p className="opp-meta-mono text-center mt-3 leading-relaxed m-0">
              {cryptoEnabled
                ? 'Card processed by Bankful. Crypto via MoonPay (≈4% processing fee added).'
                : 'Card processed by Bankful.'}
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
            {affiliateApplied && (
              <div className="flex justify-between text-[13px]">
                <span className="text-success font-semibold">
                  Discount ({affiliateApplied.discountPct}% — {affiliateApplied.code})
                </span>
                <span className="text-success font-semibold">-${discountAmount.toFixed(2)}</span>
              </div>
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

      <MoonPayBuyWidget
        variant="overlay"
        baseCurrencyCode="usd"
        baseCurrencyAmount={String(Math.ceil(serverTotal ?? discountedTotal * 1.04))}
        defaultCurrencyCode="usdc_polygon"
        externalTransactionId={orderNumber}
        visible={showMoonPay}
        onCloseOverlay={() => setShowMoonPay(false)}
        onTransactionCompleted={() => {
          setShowMoonPay(false);
          clearCart();
          setOrderPlaced(true);
        }}
      />
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
