import { useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useCart } from '../context/CartContext';

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
  const router = useRouter();

  if (cartItems.length === 0 && !orderPlaced) {
    return (
      <div style={styles.emptyContainer}>
        <h1 style={styles.emptyTitle}>Your cart is empty</h1>
        <p style={styles.emptyText}>Add some products before checking out.</p>
        <button style={styles.shopBtn} onClick={() => router.push('/shop')}>
          Browse Products
        </button>
      </div>
    );
  }

  if (orderPlaced) {
    return (
      <div style={styles.emptyContainer}>
        <div style={styles.successIcon}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h1 style={styles.emptyTitle}>Payment Complete!</h1>
        <p style={styles.emptyText}>
          Your order has been placed. You will receive a confirmation email shortly.
        </p>
        <button style={styles.shopBtn} onClick={() => router.push('/')}>
          Back to Home
        </button>
      </div>
    );
  }

  const handleCheckout = (e) => {
    e.preventDefault();
    if (!email || !name || !address || !city || !state || !zip) {
      alert('Please fill in all shipping fields.');
      return;
    }
    setShowMoonPay(true);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Checkout</h1>

      <div style={styles.grid}>
        {/* Shipping info form */}
        <div style={styles.formSection}>
          <h2 style={styles.sectionTitle}>Shipping Information</h2>
          <form onSubmit={handleCheckout}>
            <div style={styles.field}>
              <label style={styles.label}>Full Name</label>
              <input
                style={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Address</label>
              <input
                style={styles.input}
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St"
              />
            </div>
            <div style={styles.row}>
              <div style={{ ...styles.field, flex: 2 }}>
                <label style={styles.label}>City</label>
                <input
                  style={styles.input}
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                />
              </div>
              <div style={{ ...styles.field, flex: 1 }}>
                <label style={styles.label}>State</label>
                <input
                  style={styles.input}
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="CA"
                />
              </div>
              <div style={{ ...styles.field, flex: 1 }}>
                <label style={styles.label}>ZIP</label>
                <input
                  style={styles.input}
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="90210"
                />
              </div>
            </div>

            <button type="submit" style={styles.payBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 8 }}>
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              Pay ${cartTotal.toFixed(2)} with Card
            </button>
            <p style={styles.payNote}>
              Your card payment is securely converted to USDC via MoonPay.
              <br />A ~4% processing fee applies.
            </p>
          </form>
        </div>

        {/* Order summary */}
        <div style={styles.summarySection}>
          <h2 style={styles.sectionTitle}>Order Summary</h2>
          <div style={styles.summaryItems}>
            {cartItems.map((item) => (
              <div key={item.id} style={styles.summaryItem}>
                <div>
                  <span style={styles.summaryName}>{item.name}</span>
                  <span style={styles.summaryDosage}> - {item.dosage}</span>
                  <span style={styles.summaryQty}> x{item.quantity}</span>
                </div>
                <span style={styles.summaryPrice}>
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div style={styles.summaryDivider} />
          <div style={styles.summaryTotal}>
            <span style={styles.totalLabel}>Total</span>
            <span style={styles.totalAmount}>${cartTotal.toFixed(2)}</span>
          </div>
          <div style={styles.disclaimer}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 6, flexShrink: 0 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>All products are for research use only. Not for human consumption.</span>
          </div>
        </div>
      </div>

      {/* MoonPay Widget - shows as overlay when triggered */}
      <MoonPayBuyWidget
        variant="overlay"
        baseCurrencyCode="usd"
        baseCurrencyAmount={String(Math.ceil(cartTotal * 1.04))}
        defaultCurrencyCode="usdc_polygon"
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

const styles = {
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '40px 20px 60px',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#0D1B2A',
    marginBottom: 32,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  grid: {
    display: 'flex',
    gap: 32,
    flexWrap: 'wrap',
  },
  formSection: {
    flex: '1 1 400px',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  summarySection: {
    flex: '0 1 320px',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0D1B2A',
    marginBottom: 20,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#5A7D9A',
    marginBottom: 6,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #D8E4EE',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    color: '#0D1B2A',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  row: {
    display: 'flex',
    gap: 12,
  },
  payBtn: {
    width: '100%',
    backgroundColor: '#00B4D8',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '16px 20px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  payNote: {
    fontSize: 11,
    color: '#6B7B8D',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 1.5,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  summaryItems: {
    marginBottom: 16,
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #F0F4F8',
  },
  summaryName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  summaryDosage: {
    fontSize: 12,
    color: '#5A7D9A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  summaryQty: {
    fontSize: 12,
    color: '#6B7B8D',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  summaryPrice: {
    fontSize: 14,
    fontWeight: 600,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E8F0F6',
    margin: '8px 0 12px',
  },
  summaryTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  disclaimer: {
    display: 'flex',
    alignItems: 'flex-start',
    fontSize: 11,
    color: '#5A7D9A',
    marginTop: 16,
    padding: '12px',
    backgroundColor: '#F5F8FA',
    borderRadius: 8,
    lineHeight: 1.4,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  emptyContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    textAlign: 'center',
  },
  successIcon: {
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#0D1B2A',
    marginBottom: 12,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7B8D',
    marginBottom: 24,
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
};
