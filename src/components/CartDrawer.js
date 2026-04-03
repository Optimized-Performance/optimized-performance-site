import { useRouter } from 'next/router';
import { useCart } from '../context/CartContext';

export default function CartDrawer() {
  const router = useRouter();
  const {
    cartItems,
    isCartOpen,
    setIsCartOpen,
    removeFromCart,
    updateQuantity,
    cartTotal,
  } = useCart();

  if (!isCartOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div style={styles.overlay} onClick={() => setIsCartOpen(false)} />

      {/* Drawer */}
      <div style={styles.drawer}>
        <div style={styles.drawerHeader}>
          <h2 style={styles.drawerTitle}>Your Cart</h2>
          <button style={styles.closeBtn} onClick={() => setIsCartOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {cartItems.length === 0 ? (
          <div style={styles.empty}>
            <p style={styles.emptyText}>Your cart is empty</p>
            <button
              style={styles.shopBtn}
              onClick={() => setIsCartOpen(false)}
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div style={styles.items}>
              {cartItems.map((item) => (
                <div key={item.id} style={styles.item}>
                  <div style={styles.itemInfo}>
                    <h4 style={styles.itemName}>{item.name}</h4>
                    <p style={styles.itemDosage}>{item.dosage}</p>
                    <p style={styles.itemPrice}>${item.price.toFixed(2)}</p>
                  </div>
                  <div style={styles.itemActions}>
                    <div style={styles.qtyWrap}>
                      <button
                        style={styles.qtyBtn}
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        -
                      </button>
                      <span style={styles.qty}>{item.quantity}</span>
                      <button
                        style={styles.qtyBtn}
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      style={styles.removeBtn}
                      onClick={() => removeFromCart(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.footer}>
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>Subtotal</span>
                <span style={styles.totalAmount}>${cartTotal.toFixed(2)}</span>
              </div>
              <p style={styles.shippingNote}>Shipping calculated at checkout</p>
              <button
                style={styles.checkoutBtn}
                onClick={() => {
                  setIsCartOpen(false);
                  router.push('/checkout');
                }}
              >
                Proceed to Checkout
              </button>
              <p style={styles.cryptoNote}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 6 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Secure checkout powered by crypto payment rails
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(13,27,42,0.6)',
    zIndex: 200,
  },
  drawer: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 400,
    maxWidth: '90vw',
    height: '100vh',
    backgroundColor: '#FFFFFF',
    zIndex: 201,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid #E8F0F6',
  },
  drawerTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6B7B8D',
    padding: 4,
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    color: '#6B7B8D',
    fontSize: 16,
    marginBottom: 20,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  shopBtn: {
    backgroundColor: '#0D1B2A',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 28px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  items: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 24px',
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '16px 0',
    borderBottom: '1px solid #F0F4F8',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  itemDosage: {
    margin: '2px 0 0',
    fontSize: 12,
    color: '#5A7D9A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  itemPrice: {
    margin: '6px 0 0',
    fontSize: 15,
    fontWeight: 600,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  itemActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  qtyWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    border: '1px solid #E8F0F6',
    borderRadius: 6,
    padding: '2px 4px',
  },
  qtyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 700,
    color: '#0D1B2A',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  qty: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0D1B2A',
    minWidth: 20,
    textAlign: 'center',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#CC0000',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  footer: {
    padding: '20px 24px',
    borderTop: '1px solid #E8F0F6',
    backgroundColor: '#FAFCFD',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 600,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  shippingNote: {
    fontSize: 12,
    color: '#6B7B8D',
    margin: '4px 0 16px',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  checkoutBtn: {
    width: '100%',
    backgroundColor: '#00B4D8',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    letterSpacing: 1,
  },
  cryptoNote: {
    fontSize: 11,
    color: '#5A7D9A',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 0,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
};
