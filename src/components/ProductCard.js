import { useCart } from '../context/CartContext';

const LOW_STOCK_THRESHOLD = 20;

export default function ProductCard({ product, qty }) {
  const { addToCart } = useCart();

  const stock = qty ?? product.stock;
  const status = stock === 0 ? 'out' : stock <= LOW_STOCK_THRESHOLD ? 'low' : 'in';

  return (
    <div className="card-premium overflow-hidden flex flex-col relative group hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 transition-all duration-200">
      {product.badge && (
        <div className={`absolute top-3 left-3 z-10 text-[10px] font-bold tracking-wide px-2.5 py-1 rounded ${
          product.badge === 'HERO'
            ? 'bg-brand-cyan text-white'
            : 'bg-brand-platinum/20 text-brand-platinum'
        }`}>
          {product.badge}
        </div>
      )}

      {/* Product visual — clean abstract vial */}
      <div className="bg-brand-dark/50 px-6 py-8 text-center border-b border-white/[0.04]">
        <svg viewBox="0 0 60 120" width="54" height="100" className="mx-auto block">
          {/* Cap */}
          <rect x="22" y="2" width="16" height="7" rx="2" fill="#00B4D8" opacity="0.9" />
          {/* Neck */}
          <rect x="24" y="9" width="12" height="8" rx="1" fill="#1a2a3a" stroke="#00B4D8" strokeWidth="0.5" opacity="0.6" />
          {/* Body */}
          <rect x="16" y="17" width="28" height="85" rx="4" fill="#1a2a3a" stroke="#00B4D8" strokeWidth="0.8" opacity="0.5" />
          {/* Label area */}
          <rect x="18" y="30" width="24" height="50" rx="2" fill="none" stroke="#00B4D8" strokeWidth="0.5" opacity="0.3" />
          {/* Center line accent */}
          <line x1="30" y1="38" x2="30" y2="72" stroke="#00B4D8" strokeWidth="0.5" opacity="0.25" />
          {/* Product initial */}
          <text x="30" y="58" textAnchor="middle" fontSize="9" fontWeight="700" fill="#00B4D8" opacity="0.7" fontFamily="system-ui">
            {product.name.charAt(0)}
          </text>
        </svg>
        <div className="mt-3 text-[10px] font-medium tracking-widest text-brand-muted uppercase">
          {product.category}
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-[15px] font-bold text-brand-cream font-heading leading-tight">{product.name}</h3>
          <span className="shrink-0 text-[11px] font-semibold text-brand-cyan bg-brand-cyan/10 border border-brand-cyan/20 rounded-full px-2.5 py-0.5">
            {product.dosage}
          </span>
        </div>
        <p className="text-[11px] text-brand-muted/70 mb-2">SKU: {product.sku}</p>
        <p className="text-xs text-brand-muted leading-relaxed mb-4 flex-1">{product.description}</p>

        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <div>
            <span className="text-xl font-bold text-brand-cream font-heading">${product.price.toFixed(2)}</span>
            <span className="text-xs text-brand-muted ml-1">/ vial</span>
          </div>
          <button
            className={`text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors duration-200 ${
              status === 'out'
                ? 'bg-white/5 text-brand-muted cursor-not-allowed'
                : 'bg-brand-cyan text-white hover:bg-brand-cyan-light cursor-pointer'
            }`}
            onClick={() => status !== 'out' && addToCart(product)}
            disabled={status === 'out'}
          >
            {status === 'out' ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>

        <div className="flex items-center mt-3 gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            status === 'out' ? 'bg-red-500' : status === 'low' ? 'bg-amber-400' : 'bg-emerald-400'
          }`} />
          {status === 'out' && <span className="text-[11px] font-medium text-red-400">Out of Stock</span>}
          {status === 'low' && <span className="text-[11px] font-medium text-amber-400">Only {stock} left!</span>}
          {status === 'in' && <span className="text-[11px] font-medium text-emerald-400">In Stock</span>}
          {status !== 'out' && <span className="text-[11px] text-brand-muted">· Ships within 24hrs</span>}
        </div>
      </div>
    </div>
  );
}
