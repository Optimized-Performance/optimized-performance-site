import { useCart } from '../context/CartContext';

const LOW_STOCK_THRESHOLD = 20;

export default function ProductCard({ product, qty }) {
  const { addToCart } = useCart();

  const stock = qty ?? product.stock;
  const status = stock === 0 ? 'out' : stock <= LOW_STOCK_THRESHOLD ? 'low' : 'in';

  const badgeColors = {
    HERO: { bg: '#00B4D8', color: '#fff' },
    BUNDLE: { bg: '#0D1B2A', color: '#fff' },
  };

  return (
    <div
      style={styles.card}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
      }}
    >
      {product.badge && (
        <div style={{
          ...styles.badge,
          backgroundColor: badgeColors[product.badge]?.bg || '#00B4D8',
          color: badgeColors[product.badge]?.color || '#fff',
        }}>
          {product.badge}
        </div>
      )}

      <div style={styles.imgWrap}>
        <svg viewBox="0 0 100 170" width="72" height="122" style={{ display: 'block', margin: '0 auto' }}>
          {/* Green flip-top cap */}
          <rect x="38" y="2" width="24" height="8" rx="2" fill="#4CAF50" />
          <rect x="38" y="8" width="24" height="3" rx="1" fill="#388E3C" />
          {/* Aluminum crimp ring */}
          <rect x="36" y="11" width="28" height="5" rx="1.5" fill="#C0C0C0" />
          <rect x="36" y="11" width="28" height="5" rx="1.5" fill="url(#crimp)" opacity="0.6" />
          {/* Glass neck */}
          <rect x="40" y="16" width="20" height="10" rx="1" fill="#E8F0F4" stroke="#C8D8E4" strokeWidth="0.5" />
          {/* Glass vial body */}
          <rect x="30" y="26" width="40" height="115" rx="6" fill="#EDF4F8" stroke="#C0CED8" strokeWidth="0.8" />
          {/* Glass highlight */}
          <rect x="32" y="28" width="6" height="108" rx="3" fill="white" opacity="0.35" />
          {/* Silver metallic label wrap */}
          <rect x="31" y="42" width="38" height="70" rx="3" fill="#D4D4D4" />
          <rect x="31" y="42" width="38" height="70" rx="3" fill="url(#metallic)" opacity="0.5" />
          {/* Label border */}
          <rect x="31" y="42" width="38" height="70" rx="3" fill="none" stroke="#B0B0B0" strokeWidth="0.5" />
          {/* Holographic shimmer on label */}
          <rect x="32" y="44" width="4" height="66" rx="2" fill="white" opacity="0.15" />
          {/* Mini mandala on label */}
          <polygon points="50,50 54,52 54,56 50,58 46,56 46,52" fill="none" stroke="#0D1B2A" strokeWidth="0.6" opacity="0.5" />
          <circle cx="50" cy="54" r="1" fill="#0D1B2A" opacity="0.4" />
          {/* Product name on label */}
          <text x="50" y="68" textAnchor="middle" fontSize="6" fontWeight="800" fill="#0D1B2A" fontFamily="Arial">{product.name}</text>
          <line x1="38" y1="71" x2="62" y2="71" stroke="#0D1B2A" strokeWidth="0.3" opacity="0.3" />
          <text x="50" y="78" textAnchor="middle" fontSize="4" fill="#555" fontFamily="Arial">{product.dosage}</text>
          <text x="50" y="84" textAnchor="middle" fontSize="3" fill="#777" fontFamily="Arial">Lyophilized Powder</text>
          <text x="50" y="90" textAnchor="middle" fontSize="3" fill="#777" fontFamily="Arial">Purity: &gt;99%</text>
          {/* RUO text */}
          <text x="50" y="100" textAnchor="middle" fontSize="2.5" fontWeight="600" fill="#0D1B2A" fontFamily="Arial" opacity="0.5">FOR RESEARCH USE ONLY</text>
          <text x="50" y="106" textAnchor="middle" fontSize="2.5" fill="#999" fontFamily="Arial">{product.sku}</text>
          {/* Powder in bottom of vial */}
          <rect x="32" y="120" width="36" height="18" rx="4" fill="#F0F6FA" opacity="0.8" />
          <rect x="32" y="128" width="36" height="10" rx="4" fill="white" opacity="0.3" />
          {/* Gradient defs */}
          <defs>
            <linearGradient id="metallic" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.4" />
              <stop offset="30%" stopColor="#E8E8E8" stopOpacity="0.1" />
              <stop offset="50%" stopColor="white" stopOpacity="0.3" />
              <stop offset="70%" stopColor="#D0D0D0" stopOpacity="0.1" />
              <stop offset="100%" stopColor="white" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="crimp" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#A0A0A0" stopOpacity="0.3" />
              <stop offset="100%" stopColor="white" stopOpacity="0.5" />
            </linearGradient>
          </defs>
        </svg>
        <div style={styles.categoryTag}>{product.category}</div>
      </div>

      <div style={styles.info}>
        <div style={styles.nameRow}>
          <h3 style={styles.name}>{product.name}</h3>
          <span style={styles.dosagePill}>{product.dosage}</span>
        </div>
        <p style={styles.sku}>SKU: {product.sku}</p>
        <p style={styles.desc}>{product.description}</p>

        <div style={styles.bottom}>
          <div>
            <span style={styles.price}>${product.price.toFixed(2)}</span>
            <span style={styles.perVial}> / vial</span>
          </div>
          <button
            style={{ ...styles.addBtn, ...(status === 'out' ? styles.addBtnDisabled : {}) }}
            onClick={() => status !== 'out' && addToCart(product)}
            disabled={status === 'out'}
            onMouseEnter={(e) => { if (status !== 'out') e.target.style.backgroundColor = '#0096B7'; }}
            onMouseLeave={(e) => { if (status !== 'out') e.target.style.backgroundColor = '#00B4D8'; }}
          >
            {status === 'out' ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>

        <div style={styles.stockRow}>
          <span style={{
            ...styles.stockDot,
            backgroundColor: status === 'out' ? '#ef4444' : status === 'low' ? '#f59e0b' : '#22c55e',
          }} />
          {status === 'out' && <span style={{ ...styles.stockText, color: '#ef4444' }}>Out of Stock</span>}
          {status === 'low' && <span style={{ ...styles.stockText, color: '#f59e0b' }}>Only {stock} left!</span>}
          {status === 'in' && <span style={{ ...styles.stockText, color: '#22c55e' }}>In Stock</span>}
          {status !== 'out' && <span style={styles.shipping}>· Ships within 24hrs</span>}
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    border: '1px solid #E4EDF3',
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  badge: {
    position: 'absolute', top: 12, left: 12, fontSize: 10, fontWeight: 700,
    letterSpacing: 1.2, padding: '3px 8px', borderRadius: 4,
    fontFamily: "'Helvetica Neue', Arial, sans-serif", zIndex: 1,
  },
  imgWrap: {
    backgroundColor: '#F4F9FC', padding: '28px 16px 14px',
    textAlign: 'center', borderBottom: '1px solid #E4EDF3',
  },
  categoryTag: {
    display: 'inline-block', marginTop: 10, fontSize: 10, fontWeight: 600,
    letterSpacing: 1, color: '#5A7D9A', textTransform: 'uppercase',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  info: { padding: '16px 18px 18px', flex: 1, display: 'flex', flexDirection: 'column' },
  nameRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { margin: 0, fontSize: 17, fontWeight: 700, color: '#0D1B2A', fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  dosagePill: {
    flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#00B4D8',
    background: '#EBF8FC', borderRadius: 20, padding: '2px 9px',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  sku: { margin: '4px 0 8px', fontSize: 11, color: '#9AAAB8', fontFamily: "'Helvetica Neue', Arial, sans-serif", letterSpacing: 0.3 },
  desc: { margin: '0 0 14px', fontSize: 12, color: '#6B7B8D', lineHeight: 1.55, fontFamily: "'Helvetica Neue', Arial, sans-serif", flex: 1 },
  bottom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #F0F4F8' },
  price: { fontSize: 22, fontWeight: 700, color: '#0D1B2A', fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  perVial: { fontSize: 12, color: '#9AAAB8', fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  addBtn: {
    backgroundColor: '#00B4D8', color: '#fff', border: 'none', borderRadius: 8,
    padding: '9px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Helvetica Neue', Arial, sans-serif", letterSpacing: 0.5, transition: 'background-color 0.15s',
  },
  addBtnDisabled: { backgroundColor: '#CBD5E1', cursor: 'not-allowed' },
  stockRow: { display: 'flex', alignItems: 'center', marginTop: 10, gap: 5 },
  stockDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  stockText: { fontSize: 11, fontWeight: 600, fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  shipping: { fontSize: 11, color: '#9AAAB8', fontFamily: "'Helvetica Neue', Arial, sans-serif" },
};
