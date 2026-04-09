import { useState } from 'react';
import ProductCard from '../components/ProductCard';
import products, { getEffectiveStock } from '../data/products';
import { supabaseAdmin } from '../lib/supabase';
import SEO from '../components/SEO';

const CATEGORIES = ['All', 'GLPs', 'Peptides', 'GH Peptides', 'Combos', 'Supplements'];

export default function Shop({ inventory }) {
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = activeCategory === 'All'
    ? products
    : products.filter((p) => p.category === activeCategory);

  return (
    <div className="min-h-[60vh]">
      <SEO
        title="Shop Research Peptides"
        description="Browse our full catalog of research-grade peptides. BPC-157, TB-500, GLP-3, Ipamorelin, HGH 191AA, MT-2, NAD+, and combo kits. 99% purity, fast shipping."
        path="/shop"
      />

      {/* Header */}
      <div className="bg-brand-navy py-14 px-6 text-center">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-brand-cyan uppercase mb-2">
          Research Peptides
        </p>
        <h1 className="text-3xl md:text-[34px] font-heading font-bold text-brand-cream mb-3">
          Product Catalog
        </h1>
        <p className="text-sm text-brand-muted">
          99% pure · Third-party tested · Ships within 24 hours
        </p>
        <div className="flex justify-center gap-3 flex-wrap mt-5">
          {['99% Purity', 'US Owned & Operated', 'Tested & Ensured', 'Discrete Packaging'].map((t) => (
            <span key={t} className="text-xs font-medium text-brand-cream bg-brand-cyan/10 border border-brand-cyan/20 rounded-full px-3.5 py-1.5">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-brand-surface border-b border-white/[0.06] px-6 sticky top-0 z-10">
        <div className="max-w-container mx-auto flex items-center gap-4 overflow-x-auto py-3">
          <span className="text-[11px] font-semibold text-brand-muted tracking-wide uppercase shrink-0">
            Filter:
          </span>
          <div className="flex gap-1.5 flex-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer border ${
                  activeCategory === cat
                    ? 'bg-brand-cyan text-white border-brand-cyan'
                    : 'bg-transparent text-brand-platinum border-white/10 hover:border-brand-cyan/30'
                }`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-px ${
                  activeCategory === cat
                    ? 'bg-white/20 text-white'
                    : 'bg-white/5 text-brand-muted'
                }`}>
                  {cat === 'All' ? products.length : products.filter((p) => p.category === cat).length}
                </span>
              </button>
            ))}
          </div>
          <span className="ml-auto shrink-0 text-xs text-brand-muted">
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Product grid */}
      <div className="max-w-container mx-auto px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} qty={product.isKit ? getEffectiveStock(product, inventory) : inventory[product.id]} />
          ))}
        </div>
      </div>

      {/* Volume discount tier */}
      <div className="bg-brand-navy py-12 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-lg font-heading font-bold text-brand-cream mb-6">
            Volume Discounts
          </h3>
          <div className="flex justify-center flex-wrap gap-2.5 mb-4">
            {[
              { label: '1-3 vials', val: 'Base price' },
              { label: '4-6 vials', val: '10% off' },
              { label: '7-10 vials', val: '15% off' },
              { label: '11-15 vials', val: '20% off' },
              { label: '16-25 vials', val: '22% off' },
              { label: '26-30 vials', val: '25% off' },
              { label: '31+ vials', val: '30% off' },
            ].map((tier) => (
              <div key={tier.label} className="bg-white/[0.04] border border-brand-cyan/15 rounded-lg px-4 py-3 min-w-[100px]">
                <div className="text-[11px] text-brand-muted mb-1">{tier.label}</div>
                <div className="text-base font-bold text-brand-cyan font-heading">{tier.val}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-brand-muted">
            Discount applied automatically at checkout based on cart quantity.
          </p>
        </div>
      </div>

      {/* RUO */}
      <div className="text-center py-5 px-6 bg-brand-dark border-t border-red-500/10">
        <p className="text-[11px] text-red-500/60 font-medium tracking-wide leading-relaxed">
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
    const inventory = {}
    const products = require('../data/products').default
    products.filter(p => !p.isKit).forEach(p => { inventory[p.id] = p.stock })
    return { props: { inventory } }
  }
}
