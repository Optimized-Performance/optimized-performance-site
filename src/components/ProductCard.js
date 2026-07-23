import { useState } from 'react';
import Link from 'next/link';
import { useCart } from '../context/CartContext';
import { isPreorderable, formatPreorderShipDate } from '../data/catalog-client';
import { isMemorialDaySaleActive, getSalePrice, MEMORIAL_DAY_DISCOUNT_PCT, isBogoProduct, isFlashProduct, getFlashPrice, FLASH_SALE_PCT } from '../lib/sale';
import { Vial, Icon } from './Primitives';
import AccessGateModal from './AccessGateModal';

const LOW_STOCK_THRESHOLD = 20;

// `approved` defaults to FALSE so any usage that doesn't pass real approval
// status fails SAFE — a restricted item can never be added to cart without an
// approved account. Pages that know the viewer's status (shop, home) pass it.
export default function ProductCard({ product, qty, cohort = false, approved = false, loggedIn = false }) {
  const { addToCart } = useCart();
  const [gateOpen, setGateOpen] = useState(false);
  const gated = !!product.purchaseApprovalRequired && !approved;
  const stock = qty ?? product.stock ?? 0;
  // Merchandising (sale pricing, BOGO, promo badges, low-stock scarcity) is a
  // signed-in-member experience — `cohort` (legacy prop name) is the viewer's
  // logged-in status, threaded from getServerSideProps so it's decided in the
  // server HTML. The signed-out render is the plain, promotion-free storefront.
  // Flash (Tris birthday 24h) takes precedence on its SKUs: a flat 25% shown
  // as strikethrough. Falls back to the Memorial Day site sale otherwise.
  const flashOn = isFlashProduct(product) && cohort;
  const mdActive = isMemorialDaySaleActive() && cohort;
  const saleActive = flashOn || mdActive;
  const salePrice = flashOn ? getFlashPrice(product.price) : (mdActive ? getSalePrice(product.price) : product.price);
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
        className="relative flex items-center justify-center min-h-[220px] px-4 py-6 border-b border-line opp-product-stage"
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
        {flashOn && (
          <div className="absolute bottom-3 left-3 right-3 font-mono text-[10px] font-bold tracking-[0.1em] px-2 py-1 rounded-sm bg-accent text-surface text-center">
            🎉 24HR FLASH · {FLASH_SALE_PCT}% OFF
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
          format={product.format}
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
              if (status === 'out') return;
              // Restricted + not approved → the wall drops here, at purchase
              // intent, instead of at checkout.
              if (gated) { setGateOpen(true); return; }
              addToCart(product, {
                isPreorder: status === 'preorder',
                preorderShipDate: status === 'preorder' ? product.preorderShipDate || null : null,
              });
            }}
            disabled={status === 'out'}
          >
            {gated
              ? <><Icon name="lock" size={14} /> Access</>
              : <><Icon name="plus" size={14} /> {status === 'preorder' ? 'Preorder' : 'Add'}</>}
          </button>
        </div>
      </div>
      <AccessGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        loggedIn={loggedIn}
        productId={product.id}
        productName={status === 'out' ? '' : `${product.name} ${product.dosage}`}
        onUnlocked={status === 'out' ? undefined : () => addToCart(product, {
          isPreorder: status === 'preorder',
          preorderShipDate: status === 'preorder' ? product.preorderShipDate || null : null,
        })}
      />
    </article>
  );
}
