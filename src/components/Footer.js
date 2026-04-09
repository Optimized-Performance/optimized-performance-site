import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-brand-dark mt-auto border-t border-white/[0.06]">
      <div className="max-w-container mx-auto px-6 pt-16 pb-8 flex justify-between flex-wrap gap-12">
        <div className="max-w-md">
          <p className="text-brand-cream font-heading text-sm font-bold tracking-premium mb-3">
            Optimized Performance Inc.
          </p>
          <p className="text-xs leading-relaxed text-brand-muted">
            All products are strictly for research use only. Not for human consumption.
            Not a drug, food, or cosmetic. Must be 21+ to purchase.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <Link href="/shop" className="text-sm text-brand-platinum hover:text-brand-cyan transition-colors">Shop</Link>
          <Link href="/faq" className="text-sm text-brand-platinum hover:text-brand-cyan transition-colors">FAQ</Link>
          <Link href="/shipping" className="text-sm text-brand-platinum hover:text-brand-cyan transition-colors">Shipping & Returns</Link>
          <Link href="/privacy" className="text-sm text-brand-platinum hover:text-brand-cyan transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="text-sm text-brand-platinum hover:text-brand-cyan transition-colors">Terms of Service</Link>
        </div>
      </div>
      <div className="max-w-container mx-auto px-6 py-4 border-t border-white/[0.06]">
        <p className="text-[11px] text-brand-muted/60">
          &copy; {new Date().getFullYear()} Optimized Performance Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
