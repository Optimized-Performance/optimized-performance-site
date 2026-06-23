import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import SEO from '../../components/SEO';
import { Icon } from '../../components/Primitives';

// Mirrors src/lib/alerts.js detectCarrierAndUrl. Inlined client-side to
// avoid pulling the server lib into the page bundle. If the carrier
// detection logic ever needs to evolve, update both sites — the patterns
// are intentionally narrow so they shouldn't drift.
function detectCarrierAndUrl(tracking) {
  const t = String(tracking || '').replace(/\s/g, '').toUpperCase();
  if (!t) return { carrier: 'Carrier', url: '' };
  if (/^1Z[A-Z0-9]{16}$/.test(t)) return { carrier: 'UPS', url: `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}` };
  // USPS before FedEx — USPS IMpb (20-34 digits starting 92-95) also matches the bare FedEx length patterns
  if (/^9[2-5]\d{18,32}$/.test(t) || /^[A-Z]{2}\d{9}US$/.test(t)) return { carrier: 'USPS', url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}` };
  if (/^\d{12}$|^\d{15}$|^\d{20}$|^\d{22}$/.test(t)) return { carrier: 'FedEx', url: `https://www.fedex.com/fedextrack/?tracknumbers=${encodeURIComponent(t)}` };
  if (/^\d{10}$|^\d{11}$/.test(t)) return { carrier: 'DHL', url: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}` };
  return { carrier: 'Carrier', url: `https://parcelsapp.com/en/tracking/${encodeURIComponent(t)}` };
}

const FULFILLMENT_LABELS = {
  pending: 'Order received',
  packed: 'Packed',
  shipped: 'Shipped',
  fulfilled: 'Delivered',
  cancelled: 'Cancelled',
};

const FULFILLMENT_DESCRIPTIONS = {
  pending: 'Your order is in our queue and will be packed shortly.',
  packed: 'Your order has been packed and will ship within one business day.',
  shipped: 'Your order is in transit. Tracking details below.',
  fulfilled: 'Marked delivered. If anything is off, contact us — we\'d rather sort it out than have you dispute.',
  cancelled: 'This order has been cancelled. If you\'re unsure why, contact us.',
};

const FULFILLMENT_CLASSES = {
  pending: 'bg-warning/10 text-warning border-warning/30',
  packed: 'bg-accent-soft text-accent-strong border-accent/30',
  shipped: 'bg-ink/10 text-ink border-ink/30',
  fulfilled: 'bg-success/10 text-success border-success/30',
  cancelled: 'bg-danger/10 text-danger border-danger/30',
};

function formatShipDate(iso) {
  if (!iso) return null;
  try {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return null;
  }
}

export default function OrderLookup() {
  const router = useRouter();
  const orderNumberFromUrl = router.query.order_number || '';
  const emailFromUrl = router.query.email || '';

  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Auto-submit when ?email= is in the URL (link in email comes through
  // pre-filled). Only fires once on mount; subsequent edits use the form.
  useEffect(() => {
    if (!router.isReady) return;
    if (emailFromUrl && orderNumberFromUrl && !order && !submitting) {
      setEmail(String(emailFromUrl));
      lookup(String(orderNumberFromUrl), String(emailFromUrl));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  async function lookup(orderNumber, lookupEmail) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/orders/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_number: orderNumber, email: lookupEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Lookup failed.');
        setOrder(null);
      } else {
        setOrder(data.order);
      }
    } catch {
      setError('Network error. Try again.');
    }
    setSubmitting(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!email || !orderNumberFromUrl) return;
    lookup(String(orderNumberFromUrl), email);
  }

  const status = order?.fulfillment_status || 'pending';
  const carrierInfo = order?.tracking ? detectCarrierAndUrl(order.tracking) : null;

  return (
    <div className="max-w-narrow mx-auto px-8 pt-14 pb-20">
      <SEO
        title={order ? `Order ${order.order_number}` : 'Order Lookup'}
        description="Check the status of your Syngyn order."
        path=""
        noindex
      />

      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Order Status</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(28px,4vw,42px)] leading-none mt-3 mb-2 text-ink">
          {order ? `Order ${order.order_number}` : 'Look up your order'}
        </h1>
        <p className="text-ink-soft text-sm m-0">
          {order
            ? FULFILLMENT_DESCRIPTIONS[status]
            : 'Enter the email you used at checkout to view your order details.'}
        </p>
      </div>

      <div className="pt-10">
        {!order && (
          <form onSubmit={handleSubmit} className="card-premium p-8 max-w-md mx-auto">
            <div className="mb-5">
              <label className="opp-meta-mono uppercase block mb-1.5">Order Number</label>
              <input
                className="input-field"
                value={orderNumberFromUrl}
                readOnly
                aria-readonly="true"
              />
            </div>
            <div className="mb-5">
              <label className="opp-meta-mono uppercase block mb-1.5">Email</label>
              <input
                className="input-field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <p className="opp-meta-mono text-ink-mute mt-2 m-0">
                The email you used at checkout. Required to confirm this order is yours.
              </p>
            </div>
            {error && (
              <div className="mb-4 p-3 rounded-opp bg-danger/10 border border-danger/30 text-danger text-sm">
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Looking up…' : <>View order <Icon name="arrow" size={16} /></>}
            </button>
          </form>
        )}

        {order && (
          <>
            <div className="card-premium p-6 md:p-8 mb-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <div>
                  <div className="opp-meta-mono uppercase mb-1">Status</div>
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${FULFILLMENT_CLASSES[status]}`}>
                    {FULFILLMENT_LABELS[status]}
                  </span>
                </div>
                <div className="text-right">
                  <div className="opp-meta-mono uppercase mb-1">Payment</div>
                  <span
                    className={`text-sm font-semibold ${
                      order.payment_status === 'refunded'
                        ? 'text-danger'
                        : order.payment_status === 'completed'
                          ? 'text-success'
                          : order.payment_status === 'abandoned'
                            ? 'text-ink-mute'
                            : 'text-warning'
                    }`}
                  >
                    {order.payment_status === 'refunded'
                      ? 'Refunded'
                      : order.payment_status === 'completed'
                        ? 'Paid'
                        : order.payment_status === 'abandoned'
                          ? 'Abandoned'
                          : order.payment_status === 'awaiting_payment'
                            ? 'Awaiting payment'
                            : 'Pending'}
                  </span>
                </div>
              </div>

              {carrierInfo && status === 'shipped' && (
                <div className="bg-surfaceAlt border border-line rounded-opp p-4 mb-4">
                  <div className="opp-meta-mono uppercase mb-1">Tracking ({carrierInfo.carrier})</div>
                  <div className="font-mono text-sm text-ink mb-2">{order.tracking}</div>
                  {carrierInfo.url && (
                    <a
                      href={carrierInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-accent-strong hover:underline text-sm font-semibold"
                    >
                      Track package <Icon name="arrow" size={14} />
                    </a>
                  )}
                  {order.shipped_at && (
                    <div className="opp-meta-mono text-ink-mute mt-2">
                      Shipped {new Date(order.shipped_at).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {order.refunded_at && (
                <div className="bg-danger/5 border border-danger/30 rounded-opp p-4 mb-4">
                  <div className="opp-meta-mono uppercase mb-1 text-danger">Refunded</div>
                  <div className="text-sm text-ink">
                    ${Number(order.refund_amount || 0).toFixed(2)} on{' '}
                    {new Date(order.refunded_at).toLocaleDateString()}
                  </div>
                  {order.refund_reason && (
                    <div className="opp-meta-mono text-ink-mute mt-1">{order.refund_reason}</div>
                  )}
                  <div className="text-sm text-ink-soft mt-2">
                    Refunds typically post to your statement within 5–10 business days.
                  </div>
                </div>
              )}
            </div>

            <div className="card-premium p-6 md:p-8 mb-5">
              <h2 className="font-display font-semibold tracking-display text-lg m-0 mb-4 text-ink">Items</h2>
              {order.items.map((it, i) => (
                <div key={i} className="flex justify-between items-start py-3 border-t border-line first:border-none">
                  <div>
                    <div className="text-sm font-semibold text-ink">{it.name}</div>
                    <div className="opp-meta-mono mt-0.5">
                      {it.sku} · {it.dosage} · qty {it.quantity}
                    </div>
                    {it.isPreorder && (
                      <div className="opp-meta-mono text-accent-strong mt-1">
                        PREORDER ·{' '}
                        {formatShipDate(it.preorderShipDate)
                          ? `ships ~${formatShipDate(it.preorderShipDate)}`
                          : 'ship date TBD'}
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-ink whitespace-nowrap">
                    ${(Number(it.price || 0) * Number(it.quantity || 0)).toFixed(2)}
                  </div>
                </div>
              ))}

              <div className="border-t border-line pt-3 mt-3 space-y-1.5">
                <div className="flex justify-between text-sm text-ink-soft">
                  <span>Subtotal</span>
                  <span>${Number(order.subtotal || 0).toFixed(2)}</span>
                </div>
                {Number(order.discount || 0) > 0 && (
                  <div className="flex justify-between text-sm text-success">
                    <span>Discount</span>
                    <span>-${Number(order.discount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-ink-soft">
                  <span>Shipping</span>
                  <span>{Number(order.shipping || 0) === 0 ? 'FREE' : `$${Number(order.shipping).toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-base font-semibold text-ink pt-1 border-t border-line">
                  <span>Total</span>
                  <span>${Number(order.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="card-premium p-6 md:p-8 mb-5">
              <h2 className="font-display font-semibold tracking-display text-lg m-0 mb-3 text-ink">
                Shipping to
              </h2>
              <div className="text-sm text-ink leading-relaxed">
                {order.customer_name}<br />
                {order.shipping_address}<br />
                {order.city}, {order.state} {order.zip}
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-ink-soft mb-4">
                Something off? Email{' '}
                <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">
                  support@syngyn.co
                </a>{' '}
                or call{' '}
                <a href="tel:+18312185147" className="text-accent-strong hover:underline font-mono">
                  (831) 218-5147
                </a>
                . We&apos;d rather sort it out than have you dispute.
              </p>
              <button
                className="btn-outline text-sm"
                onClick={() => {
                  setOrder(null);
                  setEmail('');
                  setError(null);
                }}
              >
                Look up a different order
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
