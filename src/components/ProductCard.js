import Link from 'next/link';
import { useCart } from '../context/CartContext';
import { isPreorderable, formatPreorderShipDate } from '../data/products';
import { Vial, Icon } from './Primitives';

const LOW_STOCK_THRESHOLD = 20;

export default function ProductCard({ product, qty }) {
  const { addToCart } = useCart();
  const stock = qty ?? product.stock ?? 0;
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

  const statusText =
    status === 'out'
      ? 'Sold out'
      : status === 'low'
      ? `Only ${stock} left`
      : status === 'preorder'
      ? shipDate
        ? `Preorder · ships ~${shipDate}`
        : 'Preorder · ship date TBD'
      : 'In stock';

  const detailHref = `/products/${product.id}`;

  return (
    <article className="bg-surface border border-line rounded-opp-lg flex flex-col overflow-hidden relative transition-all duration-200 hover:-translate-y-0.5 hover:border-ink">
      <Link
        href={detailHref}
        className="relative flex items-center justify-center min-h-[220px] px-4 py-6 border-b border-line opp-grid-bg"
        aria-label={`View ${product.name} ${product.dosage} details`}
      >
        <div className="absolute top-3 right-3 px-2 py-1 bg-surface border border-line rounded-sm opp-meta-mono">
          {product.purity ?? 99}% · HPLC
        </div>
        {product.badge && (
          <div
            className={`absolute top-3 left-3 font-mono text-[10px] font-bold tracking-[0.12em] px-2 py-1 rounded-sm ${
              product.badge === 'BUNDLE' ? 'bg-ink text-paper' : 'bg-accent text-surface'
            }`}
          >
            {product.badge}
          </div>
        )}
        <Vial
          label={product.name}
          dosage={product.dosage}
          size={160}
          purity={product.purity}
          kit={product.isKit}
          sku={product.sku}
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
            <div className="font-display font-semibold text-2xl tracking-display text-ink leading-none">
              ${product.price.toFixed(2)}
            </div>
            <div className={`opp-stock opp-stock--${status} mt-1.5`}>
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
