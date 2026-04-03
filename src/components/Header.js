import { useCart } from '../context/CartContext';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Header() {
  const { cartCount, setIsCartOpen } = useCart();
  const router = useRouter();

  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <Link href="/" style={styles.logoLink}>
          <div style={styles.logoWrap}>
            {/* Mandala icon inline SVG */}
            <svg viewBox="-90 -90 180 180" width="40" height="40" style={{ marginRight: 12 }}>
              <polygon points="0,-80 69.3,-40 69.3,40 0,80 -69.3,40 -69.3,-40" fill="none" stroke="#00B4D8" strokeWidth="2" opacity="0.15"/>
              <polygon points="0,-72 18,-52 -18,-52" fill="none" stroke="#00B4D8" strokeWidth="2.5" strokeLinejoin="round" opacity="0.85"/>
              <polygon points="62,-36 52,-14 36,-40" fill="none" stroke="#00B4D8" strokeWidth="2.5" strokeLinejoin="round" opacity="0.75"/>
              <polygon points="62,36 36,40 52,14" fill="none" stroke="#0077B6" strokeWidth="2.5" strokeLinejoin="round" opacity="0.65"/>
              <polygon points="0,72 -18,52 18,52" fill="none" stroke="#0077B6" strokeWidth="2.5" strokeLinejoin="round" opacity="0.85"/>
              <polygon points="-62,36 -52,14 -36,40" fill="none" stroke="#0077B6" strokeWidth="2.5" strokeLinejoin="round" opacity="0.65"/>
              <polygon points="-62,-36 -36,-40 -52,-14" fill="none" stroke="#00B4D8" strokeWidth="2.5" strokeLinejoin="round" opacity="0.75"/>
              <polygon points="0,-48 41.6,-24 41.6,24 0,48 -41.6,24 -41.6,-24" fill="none" stroke="#00B4D8" strokeWidth="2" opacity="0.55"/>
              <polygon points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" fill="none" stroke="#00B4D8" strokeWidth="2.5" opacity="0.8"/>
              <circle cx="0" cy="-80" r="3.5" fill="#00B4D8"/>
              <circle cx="69.3" cy="-40" r="3.5" fill="#00B4D8" opacity="0.85"/>
              <circle cx="69.3" cy="40" r="3.5" fill="#0077B6" opacity="0.85"/>
              <circle cx="0" cy="80" r="3.5" fill="#0077B6"/>
              <circle cx="-69.3" cy="40" r="3.5" fill="#0077B6" opacity="0.85"/>
              <circle cx="-69.3" cy="-40" r="3.5" fill="#00B4D8" opacity="0.85"/>
              <circle cx="0" cy="0" r="5" fill="#00B4D8"/>
              <circle cx="0" cy="0" r="2.5" fill="#0D1B2A"/>
            </svg>
            <div>
              <div style={styles.brandName}>OPTIMIZED</div>
              <div style={styles.brandSub}>PERFORMANCE</div>
            </div>
          </div>
        </Link>

        <nav style={styles.nav}>
          <Link href="/" style={{
            ...styles.navLink,
            ...(router.pathname === '/' ? styles.navLinkActive : {})
          }}>
            Home
          </Link>
          <Link href="/shop" style={{
            ...styles.navLink,
            ...(router.pathname === '/shop' ? styles.navLinkActive : {})
          }}>
            Shop
          </Link>
          <button
            onClick={() => setIsCartOpen(true)}
            style={styles.cartBtn}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            {cartCount > 0 && <span style={styles.cartBadge}>{cartCount}</span>}
          </button>
        </nav>
      </div>
    </header>
  );
}

const styles = {
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    backgroundColor: '#0D1B2A',
    borderBottom: '1px solid rgba(0,180,216,0.15)',
    backdropFilter: 'blur(10px)',
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoLink: {
    textDecoration: 'none',
    color: 'inherit',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 2,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    lineHeight: 1.1,
  },
  brandSub: {
    color: '#90CAF9',
    fontSize: 12,
    fontWeight: 300,
    letterSpacing: 4,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 28,
  },
  navLink: {
    color: '#90CAF9',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: 1,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    transition: 'color 0.2s',
    padding: '4px 0',
  },
  navLinkActive: {
    color: '#00B4D8',
    borderBottom: '2px solid #00B4D8',
  },
  cartBtn: {
    background: 'none',
    border: 'none',
    color: '#90CAF9',
    cursor: 'pointer',
    position: 'relative',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#00B4D8',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: '50%',
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
