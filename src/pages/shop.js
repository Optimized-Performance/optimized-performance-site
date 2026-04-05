import { useState } from 'react';
import ProductCard from '../components/ProductCard';
import products from '../data/products';
import { supabaseAdmin } from '../lib/supabase';

const CATEGORIES = ['All', 'Peptides', 'GH Peptides', 'Combos', 'Supplements'];

export default function Shop({ inventory }) {
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = activeCategory === 'All'
    ? products
    : products.filter((p) => p.category === activeCategory);

  return (
    <div style={styles.page}>
      <div style={styles.headerBanner}>
        <p style={styles.eyebrow}>Research Peptides</p>
        <h1 style={styles.title}>Optimized Performance Catalog</h1>
        <p style={styles.subtitle}>
          99% pure · Third-party tested and ensured · Ships within 24 hours
        </p>
        <div style={styles.trustRow}>
          <span style={styles.trustBadge}>✓ 99% Purity</span>
          <span style={styles.trustBadge}>✓ US Owned & Operated</span>
          <span style={styles.trustBadge}>✓ Tested & Ensured</span>
          <span style={styles.trustBadge}>✓ Discrete Packaging</span>
        </div>
      </div>

      <div style={styles.filterBar}>
        <div style={styles.filterInner}>
          <span style={styles.filterLabel}>Filter:</span>
          <div style={styles.tabs}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                style={{ ...styles.tab, ...(activeCategory === cat ? styles.tabActive : {}) }}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
                <span style={{ ...styles.tabCount, ...(activeCategory === cat ? styles.tabCountActive : {}) }}>
                  {cat === 'All' ? products.length : products.filter((p) => p.category === cat).length}
                </span>
              </button>
            ))}
          </div>
          <span style={styles.resultCount}>{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div style={styles.container}>
        <div style={styles.grid}>
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} qty={inventory[product.id]} />
          ))}
        </div>
      </div>

      <div style={styles.tierBanner}>
        <div style={styles.tierInner}>
          <div style={styles.tierTitle}>Volume Discounts Available</div>
          <div style={styles.tierGrid}>
            {[
              { label: '1–3 vials', val: 'Base price' },
              { label: '4–6 vials', val: '10% off' },
              { label: '7–10 vials', val: '15% off' },
              { label: '11–15 vials', val: '20% off' },
              { label: '16–25 vials', val: '22% off' },
              { label: '26–30 vials', val: '25% off' },
              { label: '31+ vials', val: '30% off' },
            ].map((tier) => (
              <div key={tier.label} style={styles.tierItem}>
                <div style={styles.tierQty}>{tier.label}</div>
                <div style={styles.tierDiscount}>{tier.val}</div>
              </div>
            ))}
          </div>
          <p style={styles.tierNote}>Discount applied automatically at checkout based on cart quantity.</p>
        </div>
      </div>

      <div style={styles.ruo}>
        <p style={styles.ruoText}>
          FOR RESEARCH USE ONLY — Not for human consumption. Not for veterinary use.
          All products are sold strictly for in-vitro research and laboratory use.
        </p>
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  try {
    const { data, error } = await supabaseAdmin
      .from('inventory')
      .select('product_id, stock')
    if (error) throw error
    const inventory = {}
    data.forEach(item => { inventory[item.product_id] = item.stock })
    return { props: { inventory } }
  } catch {
    // Fallback to product defaults if Supabase is unreachable
    const inventory = {}
    const products = require('../data/products').default
    products.forEach(p => { inventory[p.id] = p.stock })
    return { props: { inventory } }
  }
}

const styles = {
  page: { minHeight: '60vh', backgroundColor: '#F7FAFB' },
  headerBanner: { backgroundColor: '#0D1B2A', padding: '52px 24px 44px', textAlign: 'center' },
  eyebrow: { margin: '0 0 8px', fontSize: 11, fontWeight: 600, letterSpacing: 3, color: '#00B4D8', textTransform: 'uppercase', fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  title: { color: '#FFFFFF', fontSize: 34, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 10px', fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  subtitle: { color: '#7BA3C4', fontSize: 14, fontWeight: 400, margin: '0 0 20px', letterSpacing: 0.5, fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  trustRow: { display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' },
  trustBadge: {
    fontSize: 12, fontWeight: 600, color: '#FFFFFF', background: 'rgba(0,180,216,0.18)',
    border: '1px solid rgba(0,180,216,0.35)', borderRadius: 20, padding: '5px 14px',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
  },
  filterBar: { backgroundColor: '#FFFFFF', borderBottom: '1px solid #E4EDF3', padding: '0 24px', position: 'sticky', top: 0, zIndex: 10 },
  filterInner: { maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, overflowX: 'auto', padding: '12px 0' },
  filterLabel: { fontSize: 12, fontWeight: 600, color: '#9AAAB8', letterSpacing: 0.5, flexShrink: 0, fontFamily: "'Helvetica Neue', Arial, sans-serif", textTransform: 'uppercase' },
  tabs: { display: 'flex', gap: 6, flex: 1 },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20,
    border: '1px solid #E4EDF3', background: 'transparent', cursor: 'pointer', fontSize: 13,
    fontWeight: 500, color: '#5A7D9A', fontFamily: "'Helvetica Neue', Arial, sans-serif",
    whiteSpace: 'nowrap', transition: 'all 0.15s',
  },
  tabActive: { backgroundColor: '#0D1B2A', borderColor: '#0D1B2A', color: '#FFFFFF' },
  tabCount: { fontSize: 10, fontWeight: 700, background: '#F0F4F8', color: '#9AAAB8', borderRadius: 10, padding: '1px 6px' },
  tabCountActive: { background: 'rgba(255,255,255,0.2)', color: '#FFFFFF' },
  resultCount: { marginLeft: 'auto', flexShrink: 0, fontSize: 12, color: '#9AAAB8', fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  container: { maxWidth: 1200, margin: '0 auto', padding: '36px 24px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 22 },
  tierBanner: { backgroundColor: '#0D1B2A', padding: '40px 24px' },
  tierInner: { maxWidth: 1000, margin: '0 auto', textAlign: 'center' },
  tierTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 700, marginBottom: 24, fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  tierGrid: { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  tierItem: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(0,180,216,0.25)', borderRadius: 10, padding: '12px 18px', minWidth: 100 },
  tierQty: { color: '#7BA3C4', fontSize: 11, fontWeight: 500, letterSpacing: 0.5, marginBottom: 4, fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  tierDiscount: { color: '#00B4D8', fontSize: 16, fontWeight: 700, fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  tierNote: { color: '#7BA3C4', fontSize: 12, margin: 0, fontFamily: "'Helvetica Neue', Arial, sans-serif" },
  ruo: { textAlign: 'center', padding: '20px 24px', backgroundColor: '#FFF5F5', borderTop: '1px solid #FECDD3' },
  ruoText: { margin: 0, fontSize: 11, color: '#CC0000', fontWeight: 600, letterSpacing: 0.8, fontFamily: "'Helvetica Neue', Arial, sans-serif", lineHeight: 1.6 },
};
