import Link from 'next/link';
import { useCart } from '../context/CartContext';
import { isPreorderable, formatPreorderShipDate } from '../data/catalog-client';
import { isMemorialDaySaleActive, getSalePrice, MEMORIAL_DAY_DISCOUNT_PCT, isBogoProduct } from '../lib/sale';
import { Vial, Icon } from './Primitives';

const LOW_STOCK_THRESHOLD = 20;

export default function ProductCard({ product, qty, cohort = false }) {
  const { addToCart } = useCart();
  const stock = qty ?? product.stock ?? 0;
  // Merchandising (sale pricing, BOGO, promo badges, low-stock scarcity) shows
  // only to cohort (?ref=) visitors. The public/cold face stays clean for AUP
  // review — `cohort` is threaded from shop.js getServerSideProps so this is
  // decided in the server HTML, not hidden client-side.
  const saleActive = isMemorialDaySaleActive() && cohort;
  const salePrice = saleActive ? getSalePrice(product.price) : product.price;
  const bogo = isBogoProduct(product) && cohort;
  const preorderEnabled = stock === 0 && isPreorderable(product);
  const shipDate = preorderEnabled ? formatPreorderShipDate(product) : null;

  let status; // 'in' | 'low' | 'out' | 'preorder'
  if (stock === 0) {
    status = preorderEnabled ? 'preorder' : 'out';
  } else if (stock <= LOW_STOCK_THRESHOLD) {
    status = 'low';
  } else {
    status = 'in';
  }

  // Public face hides the "Only N left" scarcity cue — render low stock as a
  // plain "In stock". Availability/add-to-cart logic still uses `status`.
  const displayStatus = !cohort && status === 'low' ? 'in' : status;

  const statusText =
    displayStatus === 'out'
      ? 'Sold out'
      : displayStatus === 'low'
      ? `Only ${stock} left`
      : displayStatus === 'preorder'
      ? shipDate
        ? `Preorder · ships ~${shipDate}`
        : 'Preorder · ship date TBD'
      : 'In stock';

  const detailHref = `/products/${product.id}`;

  return (
    <article className="opp-card bg-surface border border-line rounded-opp-lg flex flex-col overflow-hidden relative">
      <Link
        href={detailHref}
        className="relative flex items-center justify-center min-h-[220px] px-4 py-6 border-b border-line opp-grid-bg"
        aria-label={`View ${product.name} ${product.dosage} details`}
      >
        <div className="absolute top-3 right-3 px-2 py-1 bg-surface border border-line rounded-sm opp-meta-mono">
          {product.purity ?? 99}% · HPLC
        </div>
        {cohort && product.badge && (
          <div
            className={`absolute top-3 left-3 font-mono text-[10px] font-bold tracking-[0.12em] px-2 py-1 rounded-sm ${
              product.badge === 'BUNDLE' ? 'bg-ink text-paper' : 'bg-accent text-surface'
            }`}
          >
            {product.badge}
          </div>
        )}
        {bogo && (
          <div className="absolute bottom-3 left-3 right-3 font-mono text-[10px] font-bold tracking-[0.1em] px-2 py-1 rounded-sm bg-accent text-surface text-center">
            🎁 BUY 2 GET 1 FREE
          </div>
        )}
        <Vial
          label={product.name}
          dosage={product.dosage}
          size={160}
          purity={product.purity}
          kit={product.isKit}
          sku={product.sku}
          image={product.imageUrl}
        />
      </Link>
      <div className="p-5 flex flex-col flex-1 gap-1">
        <div className="opp-meta-mono mb-1.5">{product.category}</div>
        <Link href={detailHref} className="group">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display font-semibold text-xl tracking-display text-ink leading-tight m-0 group-hover:text-accent-strong transition-colors">
              {product.name}
            </h3>
            <span className="shrink-0 font-mono text-[11px] px-2 py-0.5 border border-line rounded-full text-accent-strong font-semibold">
              {product.dosage}
            </span>
          </div>
        </Link>
        <p className="text-[13px] text-ink-soft leading-relaxed my-1 flex-1">{product.description}</p>
        <div className="flex items-end justify-between pt-3.5 border-t border-line gap-3">
          <div>
            {saleActive ? (
              <div className="flex items-baseline gap-2">
                <span className="font-display font-semibold text-2xl tracking-display text-accent-strong leading-none">
                  ${salePrice.toFixed(2)}
                </span>
                <span className="font-mono text-[12px] text-ink-mute line-through">
                  ${product.price.toFixed(2)}
                </span>
              </div>
            ) : (
              <div className="font-display font-semibold text-2xl tracking-display text-ink leading-none">
                ${product.price.toFixed(2)}
              </div>
            )}
            <div className={`opp-stock opp-stock--${displayStatus} mt-1.5`}>
              <span className="opp-stock-dot" /> {statusText}
            </div>
          </div>
          <button
            className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
            onClick={(e) => {
              e.stopPropagation();
              if (status !== 'out') {
                addToCart(product, {
                  isPreorder: status === 'preorder',
                  preorderShipDate: status === 'preorder' ? product.preorderShipDate || null : null,
                });
              }
            }}
            disabled={status === 'out'}
          >
            <Icon name="plus" size={14} /> {status === 'preorder' ? 'Preorder' : 'Add'}
          </button>
        </div>
      </div>
    </article>
  );
}
