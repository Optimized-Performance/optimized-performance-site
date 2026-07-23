import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { track } from '../lib/track';
import { RECOVERY_QUERY_PARAM } from '../lib/recovery-config';

const CartContext = createContext();

// Versioned localStorage persistence so the cart survives refreshes, new
// tabs, and round-trips to external payment providers (crypto redirect,
// PayPal popups) — the /checkout/cancel page promises "your cart is still
// saved", and this is what makes that true. Only ids + quantities + preorder
// flags are stored; on hydrate each line is re-joined against the current
// catalog so prices/names/stock flags can never go stale in storage.
const CART_STORAGE_KEY = 'opp_cart_v1';
const CART_STORAGE_VERSION = 2; // bumped: lines now persist display fields, not just id/qty (legacy v1 carts drop on read)
const CART_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Fields persisted per cart line so the cart rehydrates WITHOUT importing the
// full product catalog into the client bundle. Importing `data/products` here
// (as we used to) shipped every SKU — including members-only ones (HGH/Rx) —
// into _app-*.js, leaking gated SKUs into the public client bundle. The
// CHARGE is always recomputed server-side from the catalog by id, so a stale
// stored display price never affects what's billed.
const LINE_FIELDS = [
  'id', 'name', 'sku', 'dosage', 'price', 'category', 'format', 'vialSize', 'imageUrl',
  'isKit', 'parentId', 'vialCount', 'purity', 'badge', 'durableRailsOnly', 'railPolicy', 'noCoa',
];

function serializeLine(item) {
  const out = {
    quantity: item.quantity,
    isPreorder: Boolean(item.isPreorder),
    preorderShipDate: item.isPreorder ? item.preorderShipDate || null : null,
  };
  for (const k of LINE_FIELDS) if (item[k] !== undefined) out[k] = item[k];
  return out;
}

// Validate + normalize a stored/recovered line into a cart item. Drops anything
// missing an id or a numeric price (incl. legacy v1 lines that only had id/qty).
function reviveLine(line) {
  if (!line || !line.id || typeof line.price !== 'number') return null;
  const quantity = Math.floor(Number(line.quantity));
  if (!Number.isFinite(quantity) || quantity < 1) return null;
  const isPreorder = Boolean(line.isPreorder);
  return {
    ...line,
    quantity: Math.min(quantity, 99),
    isPreorder,
    preorderShipDate: isPreorder ? line.preorderShipDate || null : null,
  };
}

function readStoredCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CART_STORAGE_VERSION || !Array.isArray(parsed.items)) return [];
    if (!parsed.ts || Date.now() - parsed.ts > CART_MAX_AGE_MS) return [];
    return parsed.items.map(reviveLine).filter(Boolean);
  } catch {
    // localStorage blocked or corrupt payload — start empty, never crash
    return [];
  }
}

function writeStoredCart(cartItems) {
  try {
    if (!cartItems.length) {
      localStorage.removeItem(CART_STORAGE_KEY);
      return;
    }
    const items = cartItems.map(serializeLine);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ v: CART_STORAGE_VERSION, ts: Date.now(), items }));
  } catch {
    // localStorage blocked — cart stays session-only, same as before
  }
}

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // `hydrated` must be STATE, not a ref: the mirror effect below runs in the
  // same commit as the hydrate effect, and a ref flipped there would let the
  // mirror's initial run write the still-empty cart over the stored one
  // before the restore lands (then StrictMode's dev remount re-reads the
  // now-clobbered key and the cart "forgets"). As state, the mirror effect
  // can't see hydrated=true until the restored items are committed with it.
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once on mount (client-only, post-hydration, so SSR markup always
  // matches the first client render). No track() call and no drawer open:
  // this is a restore, not an add.
  //
  // Arriving on a payment-recovery link (?recover=TOKEN in the URL — the
  // email click moment, deliberately not the persisted cookie) with an empty
  // cart additionally rebuilds the exact abandoned order: the token is bound
  // server-side to the order, /api/recovery/cart returns its line ids +
  // quantities, and we re-join against the live catalog exactly like stored
  // carts. A non-empty cart always wins — never stomp what they've built.
  useEffect(() => {
    const stored = readStoredCart();
    if (stored.length) setCartItems(stored);
    setHydrated(true);

    if (stored.length) return;
    let token = '';
    try {
      token = new URLSearchParams(window.location.search).get(RECOVERY_QUERY_PARAM) || '';
    } catch { /* no-op */ }
    if (!token) return;
    let cancelled = false;
    fetch('/api/recovery/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.items) || !data.items.length) return;
        // /api/recovery/cart now resolves the order's lines server-side and
        // returns display fields, so we revive them the same way as stored
        // lines — no client-side catalog needed.
        const rebuilt = data.items.map(reviveLine).filter(Boolean);
        if (!rebuilt.length) return;
        // Rebuild only if the cart is still empty (they may have added items
        // while the fetch was in flight).
        setCartItems((prev) => (prev.length ? prev : rebuilt));
      })
      .catch(() => { /* recovery rebuild is best-effort */ });
    return () => { cancelled = true; };
  }, []);

  // Mirror every cart change back to storage after hydration.
  useEffect(() => {
    if (!hydrated) return;
    writeStoredCart(cartItems);
  }, [cartItems, hydrated]);

  const addToCart = useCallback((product, options = {}) => {
    const { isPreorder = false, preorderShipDate = null } = options;
    track('add_to_cart', { product_id: product?.id || null, value: Number(product?.price) || null });
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        // Re-adding an item refreshes its display fields from the live product
        // (e.g. imageUrl, name, price) and bumps quantity — so a line persisted
        // before a field existed (like imageUrl) self-heals on the next add,
        // instead of keeping stale data forever. isPreorder/preorderShipDate
        // live only on the cart line, so `...item` preserves them.
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, ...product, quantity: item.quantity + 1 }
            : item
        );
      }
      // Persist preorder metadata on the cart line so the drawer + checkout
      // can render ship-date messaging without re-querying inventory.
      return [
        ...prev,
        {
          ...product,
          quantity: 1,
          isPreorder,
          preorderShipDate: isPreorder ? preorderShipDate : null,
        },
      ];
    });
    setIsCartOpen(true);
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity <= 0) {
      setCartItems((prev) => prev.filter((item) => item.id !== productId));
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const cartTotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const clearCart = useCallback(() => {
    setCartItems([]);
    try { localStorage.removeItem(CART_STORAGE_KEY); } catch { /* blocked */ }
  }, []);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        isCartOpen,
        setIsCartOpen,
        addToCart,
        removeFromCart,
        updateQuantity,
        cartTotal,
        cartCount,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
