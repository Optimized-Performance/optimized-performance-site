import ProductCard from '../components/ProductCard';
import products from '../data/products';

export default function Shop() {
  return (
    <div style={styles.page}>
      <div style={styles.headerBanner}>
        <h1 style={styles.title}>Research Peptides</h1>
        <p style={styles.subtitle}>
          All products are 98%+ purity, third-party tested, and ship within 24 hours.
        </p>
      </div>

      <div style={styles.container}>
        <div style={styles.grid}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>

      {/* RUO reminder */}
      <div style={styles.ruo}>
        <p style={styles.ruoText}>
          All products are for research use only. Not for human consumption.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '60vh',
  },
  headerBanner: {
    backgroundColor: '#0D1B2A',
    padding: '48px 24px',
    textAlign: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: 2,
    margin: 0,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  subtitle: {
    color: '#7BA3C4',
    fontSize: 14,
    fontWeight: 300,
    marginTop: 10,
    letterSpacing: 1,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '40px 24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 24,
  },
  ruo: {
    textAlign: 'center',
    padding: '24px',
    backgroundColor: '#FFF5F5',
    borderTop: '1px solid #FECDD3',
  },
  ruoText: {
    margin: 0,
    fontSize: 12,
    color: '#CC0000',
    fontWeight: 600,
    letterSpacing: 1,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
};
