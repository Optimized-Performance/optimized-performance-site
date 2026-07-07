import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart } from '../context/CartContext';
import { BRAND } from '../lib/brand';
import { Logo, Icon } from './Primitives';

const NAV = [
  { href: '/shop', label: 'Shop' },
  { href: '/faq', label: 'FAQ' },
  { href: '/shipping', label: 'Shipping' },
];

export default function Header() {
  const { cartCount, setIsCartOpen } = useCart();
  const brand = BRAND;
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const path = router.asPath.split('?')[0];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="max-w-container mx-auto px-8 py-2 md:py-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-6 md:grid md:grid-cols-[1fr_auto_1fr] max-md:flex max-md:justify-between">
        <Link href="/" className="flex items-center -my-2" aria-label={brand.name}>
          <Logo className="h-20 md:h-[140px]" />
        </Link>

        <nav className="hidden md:flex gap-7 justify-self-center">
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`text-sm py-1.5 border-b ${
                  active
                    ? 'text-ink border-ink'
                    : 'text-ink-soft border-transparent hover:text-ink hover:border-ink'
                } transition-colors`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2 justify-self-end">
          <Link
            href="/account"
            className={`text-sm py-1.5 px-2 border-b ${
              path.startsWith('/account')
                ? 'text-ink border-ink'
                : 'text-ink-soft border-transparent hover:text-ink hover:border-ink'
            } transition-colors`}
          >
            Account
          </Link>
          <button
            className="relative inline-flex items-center gap-2 px-3.5 py-2 border border-line rounded-opp text-sm font-medium text-ink hover:border-ink transition-colors"
            onClick={() => setIsCartOpen(true)}
            aria-label="Cart"
          >
            <Icon name="cart" size={18} />
            <span>Cart</span>
            {cartCount > 0 && (
              <span key={cartCount} className="opp-bump bg-accent text-surface font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile */}
        <div className="flex md:hidden items-center gap-3">
          <button
            className="relative p-1 text-ink"
            onClick={() => setIsCartOpen(true)}
            aria-label="Cart"
          >
            <Icon name="cart" size={22} />
            {cartCount > 0 && (
              <span key={cartCount} className="opp-bump absolute -top-1.5 -right-2 bg-accent text-surface font-mono text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1 text-ink" aria-label="Menu">
            <Icon name={mobileOpen ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-line bg-surface px-8 py-4 flex flex-col gap-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMobileOpen(false)}
              className={`text-sm py-2 ${path.startsWith(n.href) ? 'text-ink font-semibold' : 'text-ink-soft'}`}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/account"
            onClick={() => setMobileOpen(false)}
            className={`text-sm py-2 ${path.startsWith('/account') ? 'text-ink font-semibold' : 'text-ink-soft'}`}
          >
            Account
          </Link>
        </div>
      )}

    </header>
  );
}
