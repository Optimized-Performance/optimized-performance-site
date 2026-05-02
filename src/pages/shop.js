import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import ProductCard from '../components/ProductCard';
import { getEffectiveStock, getVisibleProducts } from '../data/products';
import { supabaseAdmin } from '../lib/supabase';
import SEO from '../components/SEO';
import { Icon } from '../components/Primitives';

const ALL_CATEGORIES = ['All', 'GLPs', 'Peptides', 'GH Peptides', 'Combos', 'Supplements'];

export default function Shop({ inventory }) {
  const router = useRouter();
  const initialCat = typeof router.query.cat === 'string' ? router.query.cat : 'All';
  const [cat, setCat] = useState(initialCat);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('default');

  // Respect the restricted-SKU feature flag sitewide.
  const visibleProducts = useMemo(() => getVisibleProducts(), []);

  // Hide any category that has zero visible SKUs so the filter row doesn't
  // show an empty tab (matters when restricted-hide is on and e.g. all GLPs
  // are gated to private inquiry).
  const categories = useMemo(() => {
    return ALL_CATEGORIES.filter(
      (c) => c === 'All' || visibleProducts.some((p) => p.category === c)
    );
  }, [visibleProducts]);

  // If the URL pre-selects a category that is no longer visible, fall back to
  // "All" so the page isn't left showing zero products.
  useEffect(() => {
    if (cat !== 'All' && !categories.includes(cat)) setCat('All');
  }, [cat, categories]);

  useEffect(() => {
    if (typeof router.query.cat === 'string') setCat(router.query.cat);
  }, [router.query.cat]);

  const list = useMemo(() => {
    let out = visibleProducts.slice();
    if (cat !== 'All') out = out.filter((p) => p.category === cat);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((p) => (p.name + p.sku + p.category).toLowerCase().includes(q));
    }
    if (sort === 'price-asc') out.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') out.sort((a, b) => b.price - a.price);
    return out;
  }, [visibleProducts, cat, search, sort]);

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO
        title="Shop Research Peptides"
        description="Browse our full catalog of research-grade peptides. BPC-157, TB-500, GLP-3, Ipamorelin, HGH 191AA, MT-2, NAD+, and combo kits. 99% purity, fast shipping."
        path="/shop"
      />

      <header className="flex flex-wrap justify-between items-end gap-8 pb-8 border-b border-line">
        <div>
          <span className="opp-eyebrow">Catalog</span>
          <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
            All products
          </h1>
          <p className="text-ink-soft text-sm m-0">
            {list.length} SKUs · updated {todayIso}
          </p>
        </div>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-line rounded-opp min-w-[280px] bg-surface focus-within:border-ink text-ink-soft">
          <Icon name="search" size={16} />
          <input
            className="border-none outline-none bg-transparent flex-1 text-ink text-sm"
            placeholder="Search SKU, compound, class…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      <div className="flex flex-wrap justify-between gap-4 py-6">
        <div className="flex gap-2 flex-wrap">
          {categories.map((c) => {
            const count =
              c === 'All'
                ? visibleProducts.length
                : visibleProducts.filter((p) => p.category === c).length;
            const active = cat === c;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 border rounded-full text-[13px] transition-all ${
                  active
                    ? 'bg-ink text-paper border-ink'
                    : 'text-ink-soft border-line hover:border-ink hover:text-ink'
                }`}
              >
                {c}
                {c !== 'All' && <span className="font-mono text-[10px] opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 items-center">
          <div className="inline-flex items-center gap-2 px-3 py-2 border border-line rounded-opp text-ink-soft text-[13px]">
            <Icon name="filter" size={14} />
            <select
              className="border-none outline-none bg-transparent text-ink text-[13px] pr-1"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="default">Sort: Default</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
            </select>
            <Icon name="chevDown" size={14} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {list.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            qty={p.isKit ? getEffectiveStock(p, inventory) : inventory[p.id]}
          />
        ))}
      </div>

      {/* RUO */}
      <div className="text-center py-6 mt-10 border-t border-line">
        <p className="font-mono text-[11px] text-danger font-medium tracking-wide leading-relaxed m-0">
          FOR RESEARCH USE ONLY — Not for human consumption. Not for veterinary use.
          All products are sold strictly for in-vitro research and laboratory use.
        </p>
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  try {
    const { data, error } = await supabaseAdmin.from('inventory').select('product_id, stock');
    if (error) throw error;
    const inventory = {};
    data.forEach((item) => {
      inventory[item.product_id] = item.stock;
    });
    return { props: { inventory } };
  } catch {
    const inventory = {};
    const productsList = require('../data/products').default;
    productsList.filter((p) => !p.isKit).forEach((p) => {
      inventory[p.id] = p.stock;
    });
    return { props: { inventory } };
  }
}
