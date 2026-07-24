import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import QRCode from 'qrcode';
import { isPreorderable, formatPreorderShipDate, getEffectiveStock, shouldShowRestricted, getPrivateInquiryUrl } from '../../data/catalog-client';
import { useCart } from '../../context/CartContext';
import SEO from '../../components/SEO';
import { Vial, Icon } from '../../components/Primitives';
import { BRAND, RESEARCH_MODE } from '../../lib/brand';
import NotifyMe from '../../components/NotifyMe';
import AccessGateModal from '../../components/AccessGateModal';
import { supabaseAdmin } from '../../lib/supabase';
import { getCohortFromRequest } from '../../lib/cohort-session';
import { hasGatedAccess } from '../../lib/gated-access';
import { getCustomerIdFromReq } from '../../lib/customer-session';
import { isAllowedCrawler } from '../../lib/crawler';
import { isMemorialDaySaleActive, getSalePrice, MEMORIAL_DAY_DISCOUNT_PCT, isBogoProduct, VOLUME_TIERS, volumeTierPct, isVolumeEligible, isFlashProduct, getFlashPrice, FLASH_SALE_PCT } from '../../lib/sale';
// Static import (NOT require) so Next keeps lib/catalog in this page's server
// bundle — a dynamic require() of a module with no static importer tree-shakes
// to {} in the prod build, so getCatalog() became "t is not a function" and
// 500'd every PDP. Only used in getServerSideProps, so Next strips it (and the
// supabaseAdmin it pulls) from the client bundle automatically.
import { getCatalog } from '../../lib/catalog';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://syngyn.co';

const LOW_STOCK_THRESHOLD = 20;

export default function ProductDetail({
  product,
  stock,
  relatedProducts,
  privateInquiry,
  inquiryUrl,
  coaQr,
  bacCrossSell,
  cohort,
  approvalRequired,
  approved,
  loggedIn,
}) {
  const router = useRouter();
  const { addToCart } = useCart();
  // Purchase-approval gate: listed but only buyable by an approved researcher.
  // When gated + not approved, the buy action becomes "Apply for access" — or,
  // for a signed-out visitor, "Sign in" (a grandfathered customer whose email
  // is already on the allowlist just needs to log in).
  const needsApproval = !!approvalRequired && !approved;
  const loginUrl = `/account/login?next=${encodeURIComponent(`/products/${product?.id || ''}`)}`;
  const [qty, setQty] = useState(1);
  const [gateOpen, setGateOpen] = useState(false);
  // Per-SKU volume break at the selected quantity (replaces the old kit SKUs).
  // HGH is excluded (supply-constrained hero) — no tiers, always full price.
  // No consumer quantity-discount merchandising on approval-gated research
  // materials (NoRamp/Stripe finding #3 — "buy more save more" reads consumer).
  const volEligible = isVolumeEligible(product?.id) && !product?.purchaseApprovalRequired;
  const volPct = volEligible ? volumeTierPct(qty) : 0;
  const lineBase = (product?.price || 0) * qty;
  const lineTotal = lineBase * (1 - volPct / 100);
  // Track whether the main add-to-cart CTA is on-screen; when it scrolls out of
  // view, reveal a sticky bottom buy-bar so the action is always one tap away
  // (esp. mobile / long pages). IntersectionObserver — no scroll-handler jank.
  // Declared before the early returns so hook order stays stable.
  const ctaRef = useRef(null);
  const [ctaVisible, setCtaVisible] = useState(true);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCtaVisible(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (router.isFallback || !product) {
    return (
      <div className="max-w-container mx-auto px-8 py-24 text-center">
        <span className="opp-eyebrow">Product</span>
        <h1 className="font-display font-semibold tracking-display text-4xl mt-3 mb-3 text-ink">
          Product not found.
        </h1>
        <p className="text-ink-soft mb-6">
          We couldn&apos;t find that SKU. It may have been moved or discontinued.
        </p>
        <button className="btn-primary" onClick={() => router.push('/shop')}>
          Browse catalog
        </button>
      </div>
    );
  }

  if (privateInquiry) {
    return (
      <div className="max-w-container mx-auto px-8 pt-10 pb-20">
        <SEO
          title="Research Inquiry"
          description="Available for qualified researchers by direct inquiry."
          path={`/products/${product.id}`}
          noindex
        />

        <nav className="flex items-center gap-2 text-[12px] opp-meta-mono mb-6">
          <Link href="/shop" className="text-ink-mute hover:text-ink-soft transition-colors">
            Shop
          </Link>
          <span className="text-ink-mute">/</span>
          <span className="text-ink-soft">Private Inquiry</span>
        </nav>

        <div className="max-w-narrow mx-auto">
          <div className="card-premium p-10 md:p-14 text-center">
            <span className="opp-eyebrow">Private Research Inquiry</span>
            <h1 className="font-display font-semibold tracking-display text-[clamp(32px,4.5vw,56px)] leading-tight mt-3 mb-5 text-ink">
              Research Inquiry
            </h1>
            <p className="text-ink-soft leading-relaxed max-w-lg mx-auto mb-8">
              This compound is available to qualified researchers through direct inquiry only.
              Reach out via the channel below and we&apos;ll confirm availability, pricing,
              and batch details.
            </p>

            <a
              href={inquiryUrl}
              className="btn-primary inline-flex items-center gap-2 px-6 py-3.5 text-base"
              target={inquiryUrl.startsWith('http') ? '_blank' : undefined}
              rel={inquiryUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              <Icon name="doc" size={16} /> Contact for research inquiry
            </a>

            <div className="mt-10 pt-8 border-t border-line text-left">
              <div className="opp-meta-mono text-ink-mute mb-3">What to include in your inquiry</div>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
                <li>Your research context (institution, project, end-use nature)</li>
                <li>Quantity needed</li>
                <li>Preferred contact method for follow-up</li>
              </ul>
            </div>

            <p className="font-mono text-[11px] text-ink-mute leading-relaxed mt-10 m-0">
              All compounds are supplied strictly for in-vitro research and laboratory use only.
              Not drugs, foods, or cosmetics. Not intended for human or animal consumption.
              Must be 21 years of age or older.
            </p>
          </div>

          <div className="text-center mt-8">
            <Link href="/shop" className="text-sm text-ink-soft hover:text-ink transition-colors">
              ← Back to public catalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const preorderEnabled = stock === 0 && isPreorderable(product);
  const shipDate = preorderEnabled ? formatPreorderShipDate(product) : null;
  // Merchandising (BOGO, promo badge, sale pricing, low-stock scarcity) is a
  // signed-in-member experience. `cohort` (legacy prop name) = the viewer's
  // logged-in status from getServerSideProps.
  const bogoActive = isBogoProduct(product) && cohort;

  let status; // 'in' | 'low' | 'out' | 'preorder'
  if (stock === 0) {
    status = preorderEnabled ? 'preorder' : 'out';
  } else if (stock <= LOW_STOCK_THRESHOLD) {
    status = 'low';
  } else {
    status = 'in';
  }

  // Public face renders low stock as a plain "In stock" (no scarcity cue).
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

  const handleAdd = () => {
    if (status === 'out') return;
    // Approval-gated + not approved → open the inline application/sign-in
    // modal at purchase intent (the server also refuses the order — this is
    // the friendly front door). On unlock the modal adds this item to cart.
    if (needsApproval) {
      setGateOpen(true);
      return;
    }
    const options = {
      isPreorder: status === 'preorder',
      preorderShipDate: status === 'preorder' ? product.preorderShipDate || null : null,
    };
    for (let i = 0; i < qty; i++) {
      addToCart(product, options);
    }
  };

  return (
    <div className="max-w-container mx-auto px-8 pt-10 pb-20">
      <SEO
        title={`${product.name} ${product.dosage}`}
        description={product.description}
        path={`/products/${product.id}`}
      />

      {/* Sticky buy bar — mobile only (on desktop the pinned image + buy box
          keep the CTA reachable; a full-width bottom bar reads cheap there). */}
      {status !== 'out' && !needsApproval && (
        <div className={`lg:hidden fixed left-0 right-0 bottom-[calc(74px+env(safe-area-inset-bottom,0px))] sm:bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-md transition-transform duration-300 ${ctaVisible ? 'translate-y-full' : 'translate-y-0'}`}>
          <div className="max-w-container mx-auto px-6 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1 hidden sm:block">
              <div className="text-[13px] font-semibold text-ink truncate">{product.name} <span className="text-ink-mute font-mono text-[11px]">{product.dosage}</span></div>
              <div className="opp-meta-mono text-ink-mute">{statusText}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 rounded-full border border-line text-ink-soft hover:text-ink hover:border-ink transition-colors" aria-label="Decrease quantity">−</button>
              <span className="w-8 text-center font-mono font-semibold text-ink text-sm">{qty}</span>
              <button type="button" onClick={() => setQty(Math.min(stock || 99, qty + 1))} className="w-8 h-8 rounded-full border border-line text-ink-soft hover:text-ink hover:border-ink transition-colors" aria-label="Increase quantity">+</button>
            </div>
            <button type="button" onClick={handleAdd} className="btn-primary px-5 py-2.5 text-sm whitespace-nowrap shrink-0">
              <Icon name="plus" size={14} /> {status === 'preorder' ? `Preorder · $${lineTotal.toFixed(2)}` : `Add · $${lineTotal.toFixed(2)}`}{volPct > 0 && <span className="ml-1 opacity-90">(-{volPct}%)</span>}
            </button>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[12px] opp-meta-mono mb-6">
        <Link href="/shop" className="text-ink-mute hover:text-ink-soft transition-colors">
          Shop
        </Link>
        <span className="text-ink-mute">/</span>
        <Link
          href={`/shop?cat=${encodeURIComponent(product.category)}`}
          className="text-ink-mute hover:text-ink-soft transition-colors"
        >
          {product.category}
        </Link>
        <span className="text-ink-mute">/</span>
        <span className="text-ink-soft">
          {product.name} {product.dosage}
        </span>
      </nav>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12">
        {/* Image panel — pinned on desktop so it stays in view while details scroll */}
        <div className="card-premium relative flex items-center justify-center min-h-[420px] p-8 opp-product-stage lg:sticky lg:top-24 lg:self-start">
          <div className="absolute top-5 right-5 px-2.5 py-1 bg-surface border border-line rounded-sm opp-meta-mono">
            {product.purity ?? 99}% · HPLC
          </div>
          {cohort && product.badge && (
            <div
              className={`absolute top-5 left-5 font-mono text-[10px] font-bold tracking-[0.12em] px-2 py-1 rounded-sm ${
                product.badge === 'BUNDLE' ? 'bg-ink text-paper' : 'bg-accent text-surface'
              }`}
            >
              {product.badge}
            </div>
          )}
          <Vial
            label={product.name}
            dosage={product.dosage}
            size={320}
            purity={product.purity}
            kit={product.isKit}
            sku={product.sku}
            image={product.imageUrl}
            format={product.format}
          />
        </div>

        {/* Details panel */}
        <div className="flex flex-col">
          <div className="opp-meta-mono text-accent-strong mb-2">{product.category}</div>
          <div className="flex items-baseline gap-3 mb-3">
            <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,56px)] leading-none text-ink m-0">
              {product.name}
            </h1>
            <span className="font-mono text-[12px] px-2.5 py-0.5 border border-line rounded-full text-accent-strong font-semibold">
              {product.dosage}
            </span>
          </div>
          <p className="text-ink-soft leading-relaxed mb-6">{product.description}</p>

          {/* Spec table */}
          <div className="border border-line rounded-opp-lg overflow-hidden mb-6 bg-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <SpecRow label="SKU" value={product.sku} />
            <SpecRow label="Class" value={product.category} />
            <SpecRow label="Purity" value={`${product.purity ?? 99}% — HPLC verified`} />
            <SpecRow label="Format" value={product.format || 'Lyophilized Powder'} />
            <SpecRow label="Vial size" value={product.vialSize || '2 mL Vial'} />
            {product.mw && <SpecRow label="Molecular weight" value={product.mw} />}
            {product.halfLife && <SpecRow label="Half-life" value={product.halfLife} />}
            {product.reconShelfLife && <SpecRow label="Recon. shelf-life" value={product.reconShelfLife} />}
            {product.expiry && <SpecRow label="Expiry" value={product.expiry} />}
            <SpecRow label="Storage" value="−20°C recommended" last />
          </div>

          {/* Price + action */}
          <div className="flex items-end justify-between pb-5 border-b border-line mb-5">
            <div>
              {(() => {
                const flashOn = isFlashProduct(product) && cohort;
                const mdActive = isMemorialDaySaleActive() && cohort;
                const onSale = flashOn || mdActive;
                const salePrice = flashOn ? getFlashPrice(product.price) : (mdActive ? getSalePrice(product.price) : product.price);
                return onSale ? (
                  <div className="flex items-baseline gap-3">
                    <span className="font-display font-semibold text-4xl tracking-display text-accent-strong leading-none">
                      ${salePrice.toFixed(2)}
                    </span>
                    <span className="font-mono text-base text-ink-mute line-through">
                      ${product.price.toFixed(2)}
                    </span>
                    <span className="opp-meta-mono text-accent-strong">
                      {flashOn ? `−${FLASH_SALE_PCT}% · 24HR FLASH` : `−${MEMORIAL_DAY_DISCOUNT_PCT}% MEMORIAL DAY`}
                    </span>
                  </div>
                ) : (
                  <div className="font-display font-semibold text-4xl tracking-display text-ink leading-none">
                    ${product.price.toFixed(2)}
                  </div>
                );
              })()}
              {product.vialCount > 1 && (
                <div className="font-mono text-[12px] text-ink-mute mt-1">
                  ${(product.price / product.vialCount).toFixed(2)} per vial
                </div>
              )}
              <div className={`opp-stock opp-stock--${displayStatus} mt-2`}>
                <span className="opp-stock-dot" /> {statusText}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-9 h-9 rounded-full border border-line text-ink-soft hover:text-ink hover:border-ink transition-colors"
                aria-label="Decrease quantity"
                disabled={status === 'out'}
              >
                −
              </button>
              <span className="w-10 text-center font-mono font-semibold text-ink">{qty}</span>
              <button
                type="button"
                onClick={() => setQty(Math.min(stock || 99, qty + 1))}
                className="w-9 h-9 rounded-full border border-line text-ink-soft hover:text-ink hover:border-ink transition-colors"
                aria-label="Increase quantity"
                disabled={status === 'out'}
              >
                +
              </button>
            </div>
          </div>

          {bogoActive && (
            <div className="mb-4 px-4 py-3 bg-accent text-surface rounded-opp text-sm leading-snug">
              <span className="font-bold tracking-wide">🎁 BUY 2 GET 1 FREE</span> — every 3rd vial is free, applied automatically in your cart. Through Jun 5.
            </div>
          )}

          {/* Volume / quantity-break tiers (per SKU) — hidden for excluded SKUs (HGH) */}
          {volEligible && (
          <div className="mb-4 border border-line rounded-opp overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-surfaceAlt">
              <span className="opp-meta-mono text-ink-mute">BUY MORE · SAVE MORE</span>
              {volPct > 0 && (
                <span className="font-mono text-[11px] font-bold text-accent">
                  −{volPct}% · save ${(lineBase - lineTotal).toFixed(2)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 divide-x divide-line">
              {VOLUME_TIERS.slice().reverse().map((t) => {
                const active = volPct === t.pct;
                return (
                  <div key={t.min} className={`px-3 py-2 text-center ${active ? 'bg-accent/10' : ''}`}>
                    <div className={`font-display font-bold text-sm ${active ? 'text-accent' : 'text-ink'}`}>{t.min}+</div>
                    <div className={`font-mono text-[11px] ${active ? 'text-accent' : 'text-ink-mute'}`}>{t.pct}% off</div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {needsApproval ? (
            <>
              <button
                ref={ctaRef}
                type="button"
                onClick={handleAdd}
                className="btn-primary w-full py-4 text-base"
              >
                <Icon name="lock" size={16} /> Get access to purchase
              </button>
              <p className="opp-meta-mono text-ink-mute mt-2 leading-relaxed">
                {loggedIn
                  ? 'This material is available to verified researchers. Apply for access — once approved, purchasing unlocks for this and all restricted items.'
                  : <>Ordered with us before? Your email is likely already approved —{' '}
                      <Link href={loginUrl} className="text-accent-strong hover:underline">sign in</Link>{' '}
                      with your order email. New researcher? Apply above.</>}
              </p>
            </>
          ) : (
            <button
              ref={ctaRef}
              type="button"
              onClick={handleAdd}
              className="btn-primary w-full py-4 text-base"
              disabled={status === 'out'}
            >
              <Icon name="plus" size={16} />
              {status === 'out'
                ? 'Sold out'
                : status === 'preorder'
                ? `Preorder — $${lineTotal.toFixed(2)}`
                : `Add to cart — $${lineTotal.toFixed(2)}`}
              {volPct > 0 && <span className="ml-1 opacity-90">(-{volPct}%)</span>}
            </button>
          )}

          {/* Trust reinforcement at the decision point */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 opp-meta-mono text-ink-mute">
            <span className="inline-flex items-center gap-1"><Icon name="check" size={12} className="text-success" /> Third-party HPLC tested</span>
            <span className="inline-flex items-center gap-1"><Icon name="truck" size={12} className="text-success" /> Ships within 24h</span>
            <span className="inline-flex items-center gap-1"><Icon name="lock" size={12} className="text-success" /> Protective, insulated packaging</span>
          </div>

          {status === 'preorder' && (
            <>
              <div className="mt-3 p-3 bg-surfaceAlt border border-line rounded-opp text-[12px] text-ink-soft leading-snug">
                <span className="opp-meta-mono text-accent-strong">PREORDER</span>{' '}
                {shipDate
                  ? `This SKU is currently out of stock. Estimated ship date: ${shipDate}. Card is charged at checkout; the order ships when inventory arrives.`
                  : 'This SKU is currently out of stock. Ship date is being confirmed; we\'ll email you with an updated ETA. Card is charged at checkout; the order ships when inventory arrives.'}
              </div>
              <NotifyMe sku={product.sku} productId={product.id} productName={product.name} />
            </>
          )}

          {/* BAC reconstitution cross-sell (for lyophilized peptides) */}
          {bacCrossSell && (
            <div className="mt-4 p-4 bg-surfaceAlt border border-line rounded-opp">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="opp-meta-mono text-ink-mute mb-1">Required for reconstitution</div>
                  <div className="font-display font-semibold text-base text-ink leading-tight">
                    {bacCrossSell.name}{' '}
                    <span className="font-mono text-[11px] text-ink-mute">({bacCrossSell.dosage})</span>
                  </div>
                  <div className="font-mono text-sm text-ink mt-1">${bacCrossSell.price.toFixed(2)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(bacCrossSell, {})}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface border border-line rounded-opp text-sm text-ink hover:border-ink transition-colors whitespace-nowrap"
                  aria-label={`Add ${bacCrossSell.name} to cart`}
                >
                  <Icon name="plus" size={14} /> Add BAC
                </button>
              </div>
            </div>
          )}

          {/* COA / compliance */}
          <div className="mt-6 grid gap-3">
            {!product.noCoa && (
            <ComplianceRow icon="doc" title="Certificate of Analysis">
              {product.category === 'Supplies' ? (
                <>
                  USP Grade Sterile. Manufacturer sterility certificate available on request
                  at <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">support@syngyn.co</a>.
                </>
              ) : coaQr ? (
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    Independent third-party HPLC verified. Current batch is
                    {' '}<span className="font-mono text-ink">{coaQr.lotNumber}</span>{' '}
                    — scan the QR or{' '}
                    <a
                      href={coaQr.path}
                      target="_blank"
                      rel="noopener"
                      className="text-accent-strong hover:underline"
                    >
                      view the COA
                    </a>
                    {' '}directly. Earlier batches available on request at{' '}
                    <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">support@syngyn.co</a>.
                  </div>
                  <div
                    className="shrink-0 p-1.5 bg-surface border border-line rounded-opp"
                    style={{ width: 88, height: 88 }}
                    aria-label={`QR code linking to COA for lot ${coaQr.lotNumber}`}
                    dangerouslySetInnerHTML={{ __html: coaQr.svg }}
                  />
                </div>
              ) : (
                <>
                  Independent third-party HPLC verified. COA available per batch upon request
                  at <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">support@syngyn.co</a>.
                </>
              )}
            </ComplianceRow>
            )}
            <ComplianceRow icon="truck" title="Shipping">
              Ships within 1 business day in protective, insulated packaging.
              {product.format === 'Lyophilized Powder' && ' Cold pack included for temperature-controlled transit.'}
              {' '}
              <Link href="/shipping" className="text-accent-strong hover:underline">Full policy</Link>.
            </ComplianceRow>
            {RESEARCH_MODE ? (
              <ComplianceRow icon="lock" title="Research Use Only">
                For in-vitro research and laboratory use only. Not a drug, food, or cosmetic.
                Not intended for human or animal consumption. Must be 21+ to purchase.
              </ComplianceRow>
            ) : (
              <ComplianceRow icon="lock" title="Laboratory Use">
                Supplied for laboratory, research, and calibration use. Store as labeled.
              </ComplianceRow>
            )}
          </div>
        </div>
      </div>

      {/* Related products */}
      {relatedProducts && relatedProducts.length > 0 && (
        <section className="mt-16 pt-10 border-t border-line">
          <div className="flex items-end justify-between mb-6">
            <div>
              <span className="opp-eyebrow">Related</span>
              <h2 className="font-display font-semibold tracking-display text-3xl mt-2 text-ink">
                Other {product.category}
              </h2>
            </div>
            <Link href="/shop" className="text-sm text-accent-strong hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {relatedProducts.map((rp) => (
              <Link
                key={rp.id}
                href={`/products/${rp.id}`}
                className="bg-surface border border-line rounded-opp-lg p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-ink flex flex-col gap-2"
              >
                <div className="flex justify-center py-2 opp-product-stage rounded-opp">
                  <Vial label={rp.name} dosage={rp.dosage} size={80} kit={rp.isKit} sku={rp.sku} image={rp.imageUrl} format={rp.format} />
                </div>
                <div className="opp-meta-mono text-ink-mute">{rp.category}</div>
                <div className="font-display font-semibold text-base text-ink leading-tight">
                  {rp.name}{' '}
                  <span className="font-mono text-[11px] text-accent-strong">({rp.dosage})</span>
                </div>
                <div className="font-mono text-sm text-ink">${rp.price.toFixed(2)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Back to shop */}
      <div className="mt-10 flex justify-center">
        <Link href="/shop" className="text-sm text-ink-soft hover:text-ink transition-colors">
          ← Back to catalog
        </Link>
      </div>

      {/* Inline researcher-access gate — on unlock, adds the selected qty to cart. */}
      <AccessGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        loggedIn={loggedIn}
        productId={product.id}
        productName={status === 'out' ? '' : `${product.name} ${product.dosage}`}
        onUnlocked={status === 'out' ? undefined : () => {
          const options = {
            isPreorder: status === 'preorder',
            preorderShipDate: status === 'preorder' ? product.preorderShipDate || null : null,
          };
          for (let i = 0; i < qty; i++) addToCart(product, options);
        }}
      />
    </div>
  );
}

function SpecRow({ label, value, last = false }) {
  return (
    <div className={`grid grid-cols-[130px_1fr] gap-3 px-5 py-3 ${last ? '' : 'border-b border-line'}`}>
      <span className="opp-meta-mono text-ink-mute">{label}</span>
      <span className="font-mono text-[13px] text-ink">{value}</span>
    </div>
  );
}

function ComplianceRow({ icon, title, children }) {
  return (
    <div className="flex items-start gap-3.5 p-4 rounded-opp-lg border border-line bg-gradient-to-b from-surfaceAlt to-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full text-accent bg-[rgba(245,166,35,0.10)] border border-[rgba(245,166,35,0.22)]">
        <Icon name={icon} size={16} />
      </span>
      <div className="flex-1">
        <div className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink mb-1.5">
          {title}
        </div>
        <div className="text-[13px] text-ink-soft leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  const products = await getCatalog();
  const { id } = context.params;
  const product = products.find((p) => p.id === id);

  // getCatalog() includes UNPUBLISHED rows (so in-flight orders + order history
  // still resolve prices via getProductById). But a customer-facing PDP must
  // NOT render an unpublished/retired SKU — otherwise a retired product (e.g. a
  // kit) stays purchasable by direct URL even after it's pulled from /shop.
  if (!product || product.published === false) {
    return { notFound: true };
  }

  // getCohortFromRequest runs for its side effects — ?ref=CODE affiliate
  // ATTRIBUTION (opp_ref cookie → commissions) rides the response. Restricted
  // visibility itself is ACCOUNT-driven (2026-07-23): an approved-researcher
  // account unlocks members-only detail pages, same members-area pattern as
  // the catalog tiers.
  await getCohortFromRequest(context, supabaseAdmin);
  const gatedAccess = await hasGatedAccess(context.req);
  const loggedIn = !!getCustomerIdFromReq(context.req);

  // Server-enforced login wall (same policy as /shop and / — see lib/crawler).
  // A signed-out human may not pull a product page out of the server: return
  // notFound so no name/description/price/SKU is ever serialized into the HTML
  // without an account. Allowlisted crawlers (search + payment-processor /
  // compliance scanners) and signed-in customers get the full page, so product
  // pages stay verifiably crawlable and don't read as hidden inventory.
  if (!loggedIn && !gatedAccess && !isAllowedCrawler(context.req)) {
    return { notFound: true };
  }

  const restrictedVisible = shouldShowRestricted(gatedAccess);

  // Restricted SKU + viewer not approved → serve a generic Private Inquiry
  // view instead of the normal storefront detail. Critically, we DO NOT pass
  // the product name/description/dosage to the client — those values would
  // serialize into the rendered HTML (Next.js __NEXT_DATA__ blob) and leak
  // members-only SKU identifiers into the public HTML. The URL itself still
  // reveals the slug (/products/glp3-10mg) but the page body is generic + noindex.
  if (product.restricted && !restrictedVisible) {
    return {
      props: {
        product: { id: product.id },
        stock: 0,
        relatedProducts: [],
        privateInquiry: true,
        inquiryUrl: getPrivateInquiryUrl(),
      },
    };
  }

  // Resolve stock: try Supabase, fall back to static product.stock
  let inventory = {};
  try {
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('inventory').select('product_id, stock');
      if (!error && data) {
        data.forEach((row) => {
          inventory[row.product_id] = row.stock;
        });
      }
    }
  } catch {
    // silent fall-through to static
  }

  const stock = product.isKit
    ? getEffectiveStock(product, inventory)
    : inventory[product.id] ?? product.stock ?? 0;

  // Latest-batch COA lookup for the on-page QR. We query the most recent
  // batch that has an actual coa_pdf_path so the QR always lands on a real
  // PDF (the /coa/[sku]/[lot] route handles the no-COA-yet case gracefully,
  // but routing customers to a "pending" page from a product page reads bad).
  // For kits, the COA lives on the parent SKU since kits are bundles of
  // parent vials.
  let coaQr = null;
  const coaLookupSku = product.isKit ? product.parentId : product.id;
  if (coaLookupSku && supabaseAdmin) {
    try {
      const { data: latestBatch } = await supabaseAdmin
        .from('batches')
        .select('sku, lot_number')
        .ilike('sku', coaLookupSku)
        .not('coa_pdf_path', 'is', null)
        .order('production_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestBatch) {
        const coaPath = `/coa/${encodeURIComponent(latestBatch.sku)}/${encodeURIComponent(latestBatch.lot_number)}`;
        const coaUrl = `${SITE_URL}${coaPath}`;
        const svg = await QRCode.toString(coaUrl, {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 0,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
        coaQr = { lotNumber: latestBatch.lot_number, path: coaPath, svg };
      }
    } catch {
      // Soft-fail — page still renders, just without QR. Falls back to the
      // existing "available on request" copy.
    }
  }

  // Related products: up to 4 other products in same category, excluding
  // any restricted SKUs the visitor isn't cleared to see.
  const relatedProducts = products
    .filter(
      (p) =>
        p.category === product.category &&
        p.id !== product.id &&
        p.published !== false &&
        !(p.restricted && !restrictedVisible)
    )
    .slice(0, 4)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      dosage: p.dosage,
      price: p.price,
      category: p.category,
      isKit: p.isKit || false,
      imageUrl: p.imageUrl || null,
    }));

  // BAC cross-sell for any lyophilized-powder peptide (skipped when viewing BAC itself
  // or when BAC is out of stock — silent fall-through, no broken cart adds).
  // BAC is a members-only SKU, so only surface the BAC cross-sell to approved
  // viewers — otherwise a public peptide PDP would expose a gated product.
  let bacCrossSell = null;
  if (product.format === 'Lyophilized Powder' && product.id !== 'bac-water-10ml' && restrictedVisible) {
    const bacProduct = products.find((p) => p.id === 'bac-water-10ml');
    if (bacProduct) {
      const bacStock = inventory[bacProduct.id] ?? bacProduct.stock ?? 0;
      if (bacStock > 0) {
        bacCrossSell = { ...bacProduct, stock: bacStock };
      }
    }
  }

  // Purchase-approval gate: a SKU flagged purchaseApprovalRequired is listed
  // fully (exposed/crawlable — no cloaking) but can only be BOUGHT by an
  // approved-researcher account. Compute approval status here so the client can
  // show "Apply for access" instead of the buy button. Non-gated SKUs are
  // always purchasable (approved: true).
  const approvalRequired = !!product.purchaseApprovalRequired;
  const approved = approvalRequired ? gatedAccess : true;
  // `loggedIn` (computed above with the login-wall check) drives the gated CTA:
  // a grandfathered customer whose email is already on the allowlist just needs
  // to sign in, so guests get a "sign in" nudge rather than being sent to re-apply.

  return {
    props: {
      product,
      stock,
      relatedProducts,
      privateInquiry: false,
      inquiryUrl: null,
      coaQr,
      bacCrossSell,
      cohort: loggedIn,
      approvalRequired,
      approved,
      loggedIn,
    },
  };
}
