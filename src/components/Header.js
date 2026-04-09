import { useState } from 'react';
import { useCart } from '../context/CartContext';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Logo from './Logo';

export default function Header() {
  const { cartCount, setIsCartOpen } = useCart();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/shop', label: 'Shop' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-brand-navy/95 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-container mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 no-underline">
          <Logo size={38} />
          <div>
            <div className="text-brand-cream font-heading text-[15px] font-bold tracking-premium leading-tight">
              OPTIMIZED
            </div>
            <div className="text-brand-cyan font-heading text-[10px] font-medium tracking-[0.15em]">
              PERFORMANCE PEPTIDES
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium transition-colors duration-200 ${
                router.pathname === href
                  ? 'text-brand-cyan'
                  : 'text-brand-platinum hover:text-brand-cream'
              }`}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative p-1 text-brand-platinum hover:text-brand-cream transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-brand-cyan text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </nav>

        {/* Mobile: cart + hamburger */}
        <div className="flex items-center gap-4 md:hidden">
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative p-1 text-brand-platinum"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-brand-cyan text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1 text-brand-platinum"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? (
                <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
              ) : (
                <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-brand-navy px-6 py-4 flex flex-col gap-3">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`text-sm font-medium py-2 ${
                router.pathname === href
                  ? 'text-brand-cyan'
                  : 'text-brand-platinum'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
