import { useCart } from '../context/CartContext';
import { Vial, Icon } from './Primitives';

const LOW_STOCK_THRESHOLD = 20;

export default function ProductCard({ product, qty }) {
  const { addToCart } = useCart();
  const stock = qty ?? product.stock ?? 0;
  const status = stock === 0 ? 'out' : stock <= LOW_STOCK_THRESHOLD ? 'low' : 'in';
  const statusText =
    status === 'out' ? 'Sold out' : status === 'low' ? `Only ${stock} left` : 'In stock';

  return (
    <article className="bg-surface border border-line rounded-opp-lg flex flex-col overflow-hidden relative transition-all duration-200 hover:-translate-y-0.5 hover:border-ink">
      <div className="relative flex items-center justify-center min-h-[220px] px-4 py-6 border-b border-line opp-grid-bg">
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
      </div>
      <div className="p-5 flex flex-col flex-1 gap-1">
        <div className="opp-meta-mono mb-1.5">{product.category}</div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display font-semibold text-xl tracking-display text-ink leading-tight m-0">
            {product.name}
          </h3>
          <span className="shrink-0 font-mono text-[11px] px-2 py-0.5 border border-line rounded-full text-accent-strong font-semibold">
            {product.dosage}
          </span>
        </div>
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
            className="btn-primary text-xs px-3 py-1.5"
            onClick={(e) => {
              e.stopPropagation();
              if (status !== 'out') addToCart(product);
            }}
            disabled={status === 'out'}
          >
            <Icon name="plus" size={14} /> Add
          </button>
        </div>
      </div>
    </article>
  );
}
