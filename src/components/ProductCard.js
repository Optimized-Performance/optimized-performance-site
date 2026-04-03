import { useCart } from '../context/CartContext';

export default function ProductCard({ product }) {
  const { addToCart } = useCart();

  return (
    <div style={styles.card}>
      {/* Vial illustration */}
      <div style={styles.vialWrap}>
        <svg viewBox="0 0 100 160" width="80" height="128" style={{ display: 'block', margin: '0 auto' }}>
          {/* Vial cap */}
          <rect x="30" y="5" width="40" height="18" rx="3" fill="#1B3A5C" />
          {/* Vial neck */}
          <rect x="35" y="23" width="30" height="12" rx="1" fill="#E8F4F8" stroke="#CBD5E1" strokeWidth="0.5"/>
          {/* Vial body */}
          <rect x="25" y="35" width="50" height="100" rx="6" fill="#E8F4F8" stroke="#CBD5E1" strokeWidth="1"/>
          {/* Powder fill */}
          <rect x="26" y="105" width="48" height="29" rx="5" fill="#00B4D8" opacity="0.2"/>
          {/* Label area on vial */}
          <rect x="30" y="50" width="40" height="45" rx="3" fill="white" stroke="#CBD5E1" strokeWidth="0.5"/>
          {/* Mini mandala on label */}
          <polygon points="50,58 56,61 56,67 50,70 44,67 44,61" fill="none" stroke="#00B4D8" strokeWidth="0.8" opacity="0.7"/>
          <circle cx="50" cy="64" r="1.5" fill="#00B4D8" opacity="0.6"/>
          {/* Peptide name on vial */}
          <text x="50" y="82" textAnchor="middle" fontSize="6" fontWeight="700" fill="#0D1B2A" fontFamily="Arial">{product.name}</text>
          <text x="50" y="90" textAnchor="middle" fontSize="5" fill="#5A7D9A" fontFamily="Arial">{product.dosage}</text>
        </svg>
      </div>

      <div style={styles.info}>
        <h3 style={styles.name}>{product.name}</h3>
        <p style={styles.dosage}>{product.dosage} | {product.format}</p>
        <p style={styles.desc}>{product.description}</p>
        <div style={styles.bottom}>
          <span style={styles.price}>${product.price.toFixed(2)}</span>
          <button
            style={styles.addBtn}
            onClick={() => addToCart(product)}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#0096B7';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#00B4D8';
            }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    border: '1px solid #E8F0F6',
    overflow: 'hidden',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'default',
  },
  vialWrap: {
    backgroundColor: '#F0F7FA',
    padding: '24px 16px 12px',
    textAlign: 'center',
  },
  info: {
    padding: '16px 20px 20px',
  },
  name: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  dosage: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#5A7D9A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    letterSpacing: 0.5,
  },
  desc: {
    margin: '10px 0 0',
    fontSize: 13,
    color: '#6B7B8D',
    lineHeight: 1.5,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  bottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTop: '1px solid #F0F4F8',
  },
  price: {
    fontSize: 22,
    fontWeight: 700,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  addBtn: {
    backgroundColor: '#00B4D8',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    letterSpacing: 0.5,
    transition: 'background-color 0.2s',
  },
};
