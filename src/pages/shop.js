import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import ProductCard from '../components/ProductCard';
import { getEffectiveStock } from '../data/catalog-client';
import { supabaseAdmin } from '../lib/supabase';
import { getCohortFromRequest } from '../lib/cohort-session';
import SEO from '../components/SEO';
import { Icon } from '../components/Primitives';

const ALL_CATEGORIES = ['All', 'GLPs', 'Peptides', 'GH Peptides', 'Combos', 'Tinctures', 'Supplements', 'Supplies'];

export default function Shop({ inventory, visibleProducts: visibleProductsProp, cohortAllowed }) {
  const router = useRouter();
  const initialCat = typeof router.query.cat === 'string' ? router.query.cat : 'All';
  const [cat, setCat] = useState(initialCat);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('default');

  // Cohort-aware visible products are computed server-side and passed as a
  // prop. The cookie / ?ref= / ?cohort= decision happens in getCohortFromRequest
  // before this component renders, so the HTML never contains restricted SKU
  // markup for unflagged visitors.
  const visibleProducts = visibleProductsProp;

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
        description="Browse our catalog of research-grade peptides. BPC-157, TB-500, Ipamorelin, MT-2, NAD+, and combo kits. 99% average purity, fast shipping."
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
            cohort={cohortAllowed}
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

export async function getServerSideProps(context) {
  // Cohort detection runs first so a Set-Cookie can ride on this response if
  // the visitor arrived via ?ref=CODE / ?cohort=TOKEN. Subsequent visits read
  // the cookie; no DB roundtrip required.
  // require (not top-level import) so the catalog array stays out of the client
  // bundle — getVisibleProductsForCohort references the full products array.
  const { getVisibleProductsForCohort } = require('../data/products');
  const { cohortAllowed } = await getCohortFromRequest(context, supabaseAdmin);
  const visibleProducts = getVisibleProductsForCohort(cohortAllowed);

  // Build the set of product_ids the inventory prop is allowed to expose.
  // Visible products themselves PLUS the parent_ids of visible kits (kits
  // resolve effective stock from the parent SKU's inventory row). Anything
  // NOT in this set must be stripped before returning props — Next.js
  // serializes the entire props object into __NEXT_DATA__ in the rendered
  // HTML, so an unfiltered inventory map leaks restricted SKU IDs to AUP
  // scanners parsing the HTML.
  const allowedInventoryIds = new Set();
  visibleProducts.forEach((p) => {
    allowedInventoryIds.add(p.id);
    if (p.isKit && p.parentId) allowedInventoryIds.add(p.parentId);
  });

  try {
    const { data, error } = await supabaseAdmin.from('inventory').select('product_id, stock');
    if (error) throw error;
    const inventory = {};
    data.forEach((item) => {
      if (allowedInventoryIds.has(item.product_id)) {
        inventory[item.product_id] = item.stock;
      }
    });
    return { props: { inventory, visibleProducts, cohortAllowed } };
  } catch {
    const inventory = {};
    visibleProducts.filter((p) => !p.isKit).forEach((p) => {
      inventory[p.id] = p.stock;
    });
    return { props: { inventory, visibleProducts, cohortAllowed } };
  }
}
