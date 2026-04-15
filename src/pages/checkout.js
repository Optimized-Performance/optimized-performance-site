import { useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useCart } from '../context/CartContext';
import SEO from '../components/SEO';

const MoonPayBuyWidget = dynamic(
  () => import('@moonpay/moonpay-react').then((mod) => mod.MoonPayBuyWidget),
  { ssr: false }
);

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
  const [affiliateCode, setAffiliateCode] = useState('');
  const [affiliateApplied, setAffiliateApplied] = useState(null);
  const [affiliateError, setAffiliateError] = useState('');
  const [serverTotal, setServerTotal] = useState(null);
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
        const data = await res.json();
        setAffiliateApplied(data);
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

  if (cartItems.length === 0 && !orderPlaced) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-5 text-center">
        <h1 className="text-2xl font-heading font-bold text-brand-cream mb-3">Your cart is empty</h1>
        <p className="text-brand-muted mb-6">Add some products before checking out.</p>
        <button className="btn-primary" onClick={() => router.push('/shop')}>
          Browse Products
        </button>
      </div>
    );
  }

  if (orderPlaced) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-5 text-center">
        <div className="mb-6">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h1 className="text-2xl font-heading font-bold text-brand-cream mb-2">Payment Complete!</h1>
        {orderNumber && (
          <p className="text-sm font-semibold text-brand-cyan mb-2">Order #{orderNumber}</p>
        )}
        <p className="text-brand-muted mb-6">
          Your order has been placed. You will receive a confirmation email shortly.
        </p>
        <button className="btn-primary" onClick={() => router.push('/')}>
          Back to Home
        </button>
      </div>
    );
  }

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!email || !name || !address || !city || !state || !zip) {
      alert('Please fill in all shipping fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          address,
          city,
          state,
          zip,
          items: cartItems.map((item) => ({
            id: item.id,
            sku: item.sku,
            name: item.name,
            dosage: item.dosage,
            price: item.price,
            quantity: item.quantity,
          })),
          affiliateCode: affiliateApplied?.code || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create order');

      setOrderNumber(data.order_number);
      // Use server-calculated total (prevents client tampering)
      if (typeof data.total === 'number') {
        setServerTotal(data.total);
      }
      setShowMoonPay(true);
    } catch (err) {
      alert('Something went wrong creating your order. Please try again.');
      console.error(err);
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-[960px] mx-auto px-5 py-10 pb-16">
      <SEO title="Checkout" description="Complete your order — secure payment via MoonPay." path="/checkout" />
      <h1 className="text-2xl font-heading font-bold text-brand-cream mb-8">Checkout</h1>

      <div className="flex gap-8 flex-wrap">
        {/* Shipping form */}
        <div className="flex-[1_1_400px] card-premium p-8">
          <h2 className="text-lg font-heading font-bold text-brand-cream mb-5">Shipping Information</h2>
          <form onSubmit={handleCheckout}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-brand-platinum mb-1.5">Full Name</label>
              <input className="input-field" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-brand-platinum mb-1.5">Email</label>
              <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-brand-platinum mb-1.5">Address</label>
              <input className="input-field" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-[2]">
                <label className="block text-sm font-medium text-brand-platinum mb-1.5">City</label>
                <input className="input-field" type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-brand-platinum mb-1.5">State</label>
                <input className="input-field" type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-brand-platinum mb-1.5">ZIP</label>
                <input className="input-field" type="text" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="90210" />
              </div>
            </div>

            <div className="mb-4 mt-2">
              <label className="block text-sm font-medium text-brand-platinum mb-1.5">Affiliate / Promo Code</label>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 uppercase font-mono font-semibold"
                  type="text"
                  value={affiliateCode}
                  onChange={(e) => { setAffiliateCode(e.target.value); setAffiliateApplied(null); setAffiliateError(''); }}
                  placeholder="Enter code"
                />
                <button
                  type="button"
                  onClick={applyAffiliateCode}
                  className="btn-primary px-5 py-2.5 text-sm whitespace-nowrap"
                >
                  Apply
                </button>
              </div>
              {affiliateApplied && (
                <p className="text-xs font-semibold text-emerald-400 mt-1.5">
                  Code &ldquo;{affiliateApplied.code}&rdquo; applied — {affiliateApplied.discountPct}% off!
                </p>
              )}
              {affiliateError && (
                <p className="text-xs font-semibold text-red-400 mt-1.5">{affiliateError}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full btn-primary py-4 text-base mt-2"
              disabled={submitting}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block align-middle mr-2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              {submitting ? 'Processing...' : `Pay $${discountedTotal.toFixed(2)} with Card`}
            </button>
            <p className="text-[11px] text-brand-muted text-center mt-3 leading-relaxed">
              Your card payment is securely converted to USDC via MoonPay.
              <br />A ~4% processing fee applies.
            </p>
          </form>
        </div>

        {/* Order summary */}
        <div className="flex-[0_1_320px] card-premium p-8 self-start">
          <h2 className="text-lg font-heading font-bold text-brand-cream mb-5">Order Summary</h2>
          <div className="mb-4">
            {cartItems.map((item) => (
              <div key={item.id} className="flex justify-between items-center py-2 border-b border-white/[0.06]">
                <div>
                  <span className="text-sm font-semibold text-brand-cream">{item.name}</span>
                  <span className="text-xs text-brand-muted"> - {item.dosage}</span>
                  <span className="text-xs text-brand-muted"> x{item.quantity}</span>
                </div>
                <span className="text-sm font-semibold text-brand-cream">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="h-px bg-white/10 my-3" />
          {affiliateApplied && (
            <>
              <div className="flex justify-between py-1 mb-1">
                <span className="text-sm text-brand-muted">Subtotal</span>
                <span className="text-sm text-brand-muted">${cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 mb-2">
                <span className="text-sm font-semibold text-emerald-400">Discount ({affiliateApplied.discountPct}% — {affiliateApplied.code})</span>
                <span className="text-sm font-semibold text-emerald-400">-${discountAmount.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-center">
            <span className="text-base font-semibold text-brand-cream">Total</span>
            <span className="text-xl font-bold text-brand-cream font-heading">${discountedTotal.toFixed(2)}</span>
          </div>
          <div className="flex items-start gap-2 text-[11px] text-brand-muted mt-4 p-3 bg-brand-dark/50 rounded-lg leading-relaxed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2" className="shrink-0 mt-0.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>All products are for research use only. Not for human consumption.</span>
          </div>
        </div>
      </div>

      {/* MoonPay Widget */}
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
          // Affiliate stats are now updated server-side by the MoonPay webhook
          clearCart();
          setOrderPlaced(true);
        }}
      />
    </div>
  );
}
