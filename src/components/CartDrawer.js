import { useRouter } from 'next/router';
import { useCart } from '../context/CartContext';
import { Vial, Icon } from './Primitives';
import { calcShipping, FREE_SHIPPING_THRESHOLD } from '../lib/shipping';
import { getCartAddOns } from '../data/products';

function formatShipDate(iso) {
  if (!iso) return null;
  try {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export default function CartDrawer() {
  const router = useRouter();
  const {
    cartItems,
    isCartOpen,
    setIsCartOpen,
    removeFromCart,
    updateQuantity,
    addToCart,
    cartTotal,
  } = useCart();

  if (!isCartOpen) return null;

  const close = () => setIsCartOpen(false);
  const goto = (p) => {
    close();
    router.push(p);
  };

  // Drawer math is "best estimate before checkout" — affiliate discount isn't
  // applied yet, so we pass cartTotal as discountedSubtotal. Final numbers
  // are recomputed at checkout once the affiliate code is applied.
  const shippingBreakdown = calcShipping({ items: cartItems, discountedSubtotal: cartTotal });
  // Cross-sell add-ons (BAC water) + free-shipping progress — only meaningful for
  // vial-only carts (kits always pay the cold-pack surcharge, no free-ship tier).
  const addOns = getCartAddOns(cartItems);
  const freeShipEligible = !shippingBreakdown.hasColdPack;
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);
  const freeShipPct = Math.min(100, (cartTotal / FREE_SHIPPING_THRESHOLD) * 100);

  return (
    <>
      <div className="opp-drawer-scrim fixed inset-0 bg-black/35 z-[90]" onClick={close} />
      <aside
        className="opp-drawer-slide fixed top-0 right-0 bottom-0 w-[440px] max-w-[95vw] bg-surface border-l border-line z-[100] flex flex-col"
        role="dialog"
        aria-label="Cart"
      >
        <header className="flex justify-between items-start px-6 py-5 border-b border-line">
          <div>
            <span className="opp-eyebrow">Cart</span>
            <h3 className="font-display font-semibold text-2xl tracking-display mt-1 text-ink">
              {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}
            </h3>
          </div>
          <button
            className="w-9 h-9 rounded-opp flex items-center justify-center text-ink hover:bg-surfaceAlt transition-colors"
            onClick={close}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </header>

        {cartItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
            <div className="w-[72px] h-[72px] rounded-full bg-surfaceAlt flex items-center justify-center text-accent-strong">
              <Icon name="beaker" size={28} />
            </div>
            <p className="text-ink-soft m-0">Your cart is empty.</p>
            <button className="btn-primary" onClick={() => goto('/shop')}>
              Browse the catalog
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {cartItems.map((item) => (
                <div key={item.id} className="flex gap-3.5 py-4 border-b border-line last:border-none">
                  <div className="w-[70px] h-[90px] rounded-opp bg-surfaceAlt border border-line flex items-center justify-center shrink-0">
                    <Vial label={item.name} dosage={item.dosage} size={64} kit={item.isKit} />
                  </div>
                  <div className="flex-1 flex flex-col gap-2.5">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="text-sm font-semibold leading-snug text-ink">{item.name}</div>
                        <div className="opp-meta-mono">
                          {item.sku} · {item.dosage}
                        </div>
                        {item.isPreorder && (
                          <div className="opp-meta-mono text-accent-strong mt-1">
                            PREORDER ·{' '}
                            {formatShipDate(item.preorderShipDate)
                              ? `ships ~${formatShipDate(item.preorderShipDate)}`
                              : 'ship date TBD'}
                          </div>
                        )}
                      </div>
                      <button
                        className="w-7 h-7 rounded-opp flex items-center justify-center text-ink hover:bg-surfaceAlt transition-colors"
                        onClick={() => removeFromCart(item.id)}
                        aria-label="Remove"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="inline-flex items-center gap-2.5 border border-line rounded-opp overflow-hidden">
                        <button
                          className="w-8 h-8 flex items-center justify-center text-ink-soft hover:bg-surfaceAlt hover:text-ink transition-colors"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          aria-label="Decrease"
                        >
                          <Icon name="minus" size={12} />
                        </button>
                        <span className="min-w-[28px] text-center font-semibold text-sm">{item.quantity}</span>
                        <button
                          className="w-8 h-8 flex items-center justify-center text-ink-soft hover:bg-surfaceAlt hover:text-ink transition-colors"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          aria-label="Increase"
                        >
                          <Icon name="plus" size={12} />
                        </button>
                      </div>
                      <div className="font-semibold text-sm text-ink">
                        ${(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <footer className="border-t border-line px-6 py-5 flex flex-col gap-2.5">
              {/* Free-shipping progress — nudges AOV toward the $250 vial-only tier */}
              {freeShipEligible && (
                remaining > 0 ? (
                  <div className="mb-1">
                    <div className="flex justify-between opp-meta-mono mb-1.5">
                      <span className="text-ink-soft">Add <strong className="text-ink">${remaining.toFixed(2)}</strong> for FREE shipping</span>
                      <span className="text-ink-mute">${FREE_SHIPPING_THRESHOLD}</span>
                    </div>
                    <div className="h-1.5 bg-surfaceAlt rounded-full overflow-hidden">
                      <div className="h-full bg-accent-strong rounded-full transition-all duration-300" style={{ width: `${freeShipPct}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="opp-meta-mono text-success flex items-center gap-1.5 mb-1">
                    <Icon name="truck" size={13} /> You&rsquo;ve unlocked FREE shipping
                  </div>
                )
              )}

              {/* Cross-sell add-ons (BAC water) — highest-intent moment */}
              {addOns.length > 0 && (
                <div className="flex flex-col gap-2 pb-3 mb-1 border-b border-line">
                  <span className="opp-meta-mono text-ink-mute">Complete your order</span>
                  {addOns.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-opp border border-line bg-surfaceAlt/40">
                      <div className="w-9 h-11 rounded bg-surfaceAlt border border-line flex items-center justify-center shrink-0">
                        <Vial label={a.name} dosage={a.dosage} size={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-ink leading-snug truncate">{a.name}</div>
                        <div className="opp-meta-mono">{a.dosage} · ${a.price.toFixed(2)}</div>
                      </div>
                      <button className="btn-outline text-xs px-3 py-1.5 whitespace-nowrap" onClick={() => addToCart(a, {})} aria-label={`Add ${a.name}`}>
                        <Icon name="plus" size={12} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between text-base font-semibold text-ink mb-1">
                <span>Subtotal</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between opp-meta-mono">
                <span>Shipping</span>
                <span>
                  {shippingBreakdown.freeShipApplied
                    ? 'FREE'
                    : shippingBreakdown.hasColdPack
                      ? `$${shippingBreakdown.total.toFixed(2)} · cold-pack`
                      : '$16.95 flat · free over $250'}
                </span>
              </div>
              {shippingBreakdown.hasColdPack && (
                <p className="opp-meta-mono text-ink-mute m-0 leading-snug">
                  Kits ship USPS Priority in a larger thermal-insulated mailer — surcharge covers the larger mailer and faster transit kit-volume orders require.
                </p>
              )}
              <button className="btn-primary w-full mt-1" onClick={() => goto('/checkout')}>
                Checkout <Icon name="arrow" size={16} />
              </button>
              <button
                className="inline-flex items-center gap-1.5 text-ink-soft text-sm py-1 hover:text-ink transition-colors self-center"
                onClick={() => goto('/shop')}
              >
                Continue browsing
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
