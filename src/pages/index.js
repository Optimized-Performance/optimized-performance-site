import Link from 'next/link';
import ProductCard from '../components/ProductCard';
import products from '../data/products';

export default function Home() {
  const featured = products.slice(0, 3);

  return (
    <div>
      {/* Hero Section */}
      <section style={styles.hero}>
        <div style={styles.heroInner}>
          {/* Mandala logo large */}
          <svg viewBox="-95 -95 190 190" width="120" height="120" style={{ marginBottom: 24 }}>
            <polygon points="0,-80 69.3,-40 69.3,40 0,80 -69.3,40 -69.3,-40" fill="none" stroke="#00B4D8" strokeWidth="1.5" opacity="0.15"/>
            <polygon points="0,-72 18,-52 -18,-52" fill="none" stroke="#00B4D8" strokeWidth="2" strokeLinejoin="round" opacity="0.85"/>
            <polygon points="62,-36 52,-14 36,-40" fill="none" stroke="#00B4D8" strokeWidth="2" strokeLinejoin="round" opacity="0.75"/>
            <polygon points="62,36 36,40 52,14" fill="none" stroke="#0077B6" strokeWidth="2" strokeLinejoin="round" opacity="0.65"/>
            <polygon points="0,72 -18,52 18,52" fill="none" stroke="#0077B6" strokeWidth="2" strokeLinejoin="round" opacity="0.85"/>
            <polygon points="-62,36 -52,14 -36,40" fill="none" stroke="#0077B6" strokeWidth="2" strokeLinejoin="round" opacity="0.65"/>
            <polygon points="-62,-36 -36,-40 -52,-14" fill="none" stroke="#00B4D8" strokeWidth="2" strokeLinejoin="round" opacity="0.75"/>
            <polygon points="0,-48 41.6,-24 41.6,24 0,48 -41.6,24 -41.6,-24" fill="none" stroke="#00B4D8" strokeWidth="2" opacity="0.55"/>
            <polygon points="0,-60 14,-38 0,-42 -14,-38" fill="none" stroke="#00B4D8" strokeWidth="1.2" opacity="0.5"/>
            <polygon points="52,-30 33,-18 36,-24 38,-38" fill="none" stroke="#00B4D8" strokeWidth="1.2" opacity="0.5"/>
            <polygon points="52,30 38,38 36,24 33,18" fill="none" stroke="#00B4D8" strokeWidth="1.2" opacity="0.5"/>
            <polygon points="0,60 -14,38 0,42 14,38" fill="none" stroke="#0077B6" strokeWidth="1.2" opacity="0.5"/>
            <polygon points="-52,30 -33,18 -36,24 -38,38" fill="none" stroke="#0077B6" strokeWidth="1.2" opacity="0.5"/>
            <polygon points="-52,-30 -38,-38 -36,-24 -33,-18" fill="none" stroke="#0077B6" strokeWidth="1.2" opacity="0.5"/>
            <polygon points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" fill="none" stroke="#00B4D8" strokeWidth="2.5" opacity="0.8"/>
            <line x1="0" y1="0" x2="0" y2="-72" stroke="#00B4D8" strokeWidth="0.8" opacity="0.25"/>
            <line x1="0" y1="0" x2="62" y2="-36" stroke="#00B4D8" strokeWidth="0.8" opacity="0.25"/>
            <line x1="0" y1="0" x2="62" y2="36" stroke="#00B4D8" strokeWidth="0.8" opacity="0.25"/>
            <line x1="0" y1="0" x2="0" y2="72" stroke="#0077B6" strokeWidth="0.8" opacity="0.25"/>
            <line x1="0" y1="0" x2="-62" y2="36" stroke="#0077B6" strokeWidth="0.8" opacity="0.25"/>
            <line x1="0" y1="0" x2="-62" y2="-36" stroke="#0077B6" strokeWidth="0.8" opacity="0.25"/>
            <circle cx="0" cy="-80" r="3.5" fill="#00B4D8"/>
            <circle cx="69.3" cy="-40" r="3.5" fill="#00B4D8" opacity="0.85"/>
            <circle cx="69.3" cy="40" r="3.5" fill="#0077B6" opacity="0.85"/>
            <circle cx="0" cy="80" r="3.5" fill="#0077B6"/>
            <circle cx="-69.3" cy="40" r="3.5" fill="#0077B6" opacity="0.85"/>
            <circle cx="-69.3" cy="-40" r="3.5" fill="#00B4D8" opacity="0.85"/>
            <circle cx="0" cy="0" r="5" fill="#00B4D8"/>
            <circle cx="0" cy="0" r="2.5" fill="#0D1B2A"/>
          </svg>

          <h1 style={styles.heroTitle}>OPTIMIZED PERFORMANCE</h1>
          <p style={styles.heroSub}>Premium Research Peptides</p>
          <p style={styles.heroDesc}>
            High-purity lyophilized peptides for research purposes.
            Third-party tested. Fast shipping. Secure checkout.
          </p>
          <Link href="/shop" style={styles.heroCta}>
            Browse Products
          </Link>
        </div>
      </section>

      {/* Trust badges */}
      <section style={styles.badges}>
        <div style={styles.badgesInner}>
          <div style={styles.badge}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <div>
              <p style={styles.badgeTitle}>Third-Party Tested</p>
              <p style={styles.badgeText}>Every batch verified for purity</p>
            </div>
          </div>
          <div style={styles.badge}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5a1 1 0 0 1-1 1h-1"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <div>
              <p style={styles.badgeTitle}>Fast Shipping</p>
              <p style={styles.badgeText}>Orders ship within 24 hours</p>
            </div>
          </div>
          <div style={styles.badge}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <div>
              <p style={styles.badgeTitle}>Secure Checkout</p>
              <p style={styles.badgeText}>Encrypted crypto payment rails</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section style={styles.featured}>
        <div style={styles.featuredInner}>
          <h2 style={styles.sectionTitle}>Featured Products</h2>
          <div style={styles.grid}>
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Link href="/shop" style={styles.viewAll}>
              View All Products
            </Link>
          </div>
        </div>
      </section>

      {/* RUO Banner */}
      <section style={styles.ruoBanner}>
        <div style={styles.ruoInner}>
          <h3 style={styles.ruoTitle}>Research Use Only</h3>
          <p style={styles.ruoText}>
            All products sold by Optimized Performance Inc. are intended strictly for
            in-vitro research and laboratory use only. They are not drugs, foods, or
            cosmetics and are not intended for human or animal consumption. Purchasers
            must be 21 years of age or older.
          </p>
        </div>
      </section>
    </div>
  );
}

const styles = {
  hero: {
    backgroundColor: '#0D1B2A',
    color: '#FFFFFF',
    textAlign: 'center',
    padding: '80px 24px',
    position: 'relative',
    overflow: 'hidden',
  },
  heroInner: {
    maxWidth: 700,
    margin: '0 auto',
    position: 'relative',
    zIndex: 1,
  },
  heroTitle: {
    fontSize: 42,
    fontWeight: 700,
    letterSpacing: 4,
    margin: 0,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  heroSub: {
    fontSize: 16,
    fontWeight: 300,
    letterSpacing: 6,
    color: '#90CAF9',
    marginTop: 8,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  heroDesc: {
    fontSize: 15,
    color: '#7BA3C4',
    lineHeight: 1.7,
    marginTop: 20,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  heroCta: {
    display: 'inline-block',
    marginTop: 28,
    padding: '14px 40px',
    backgroundColor: '#00B4D8',
    color: '#FFFFFF',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: 1,
    textDecoration: 'none',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    transition: 'background-color 0.2s',
  },
  badges: {
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E8F0F6',
  },
  badgesInner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    justifyContent: 'center',
    gap: 48,
    flexWrap: 'wrap',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  badgeTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#0D1B2A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  badgeText: {
    margin: '2px 0 0',
    fontSize: 12,
    color: '#6B7B8D',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  featured: {
    padding: '60px 24px',
  },
  featuredInner: {
    maxWidth: 1200,
    margin: '0 auto',
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: '#0D1B2A',
    textAlign: 'center',
    marginBottom: 36,
    letterSpacing: 1,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300, 1fr))',
    gap: 24,
  },
  viewAll: {
    display: 'inline-block',
    padding: '12px 32px',
    border: '2px solid #0D1B2A',
    color: '#0D1B2A',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  ruoBanner: {
    backgroundColor: '#0D1B2A',
  },
  ruoInner: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '40px 24px',
    textAlign: 'center',
  },
  ruoTitle: {
    color: '#CC0000',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 3,
    marginBottom: 12,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  ruoText: {
    color: '#5A7D9A',
    fontSize: 12,
    lineHeight: 1.8,
    margin: 0,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
};
