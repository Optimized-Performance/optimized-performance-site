import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart } from '../context/CartContext';
import { Icon } from './Primitives';

// iOS-style fixed bottom tab bar — mobile only (CSS-gated via .tabbar-wrap).
// Ported from the Forged Coaching app's shell so the storefront reads like an
// app: Home / Shop / Cart (opens the drawer, live badge) / Account. Renders an
// in-flow spacer so page content clears the bar.
export default function MobileTabBar() {
  const router = useRouter();
  const { cartCount, setIsCartOpen } = useCart();
  const path = router.asPath.split('?')[0];

  const isActive = (href) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <div className="tabbar-wrap">
      <div className="tabbar-spacer" />
      <nav className="tabbar">
        <Link href="/" className={isActive('/') ? 'active' : ''}>
          <span className="icon"><Icon name="home" size={23} stroke={1.75} /></span>
          <span>Home</span>
        </Link>
        <Link href="/shop" className={isActive('/shop') ? 'active' : ''}>
          <span className="icon"><Icon name="flask" size={23} stroke={1.75} /></span>
          <span>Shop</span>
        </Link>
        <button type="button" onClick={() => setIsCartOpen(true)} aria-label="Open cart">
          <span className="icon"><Icon name="cart" size={23} stroke={1.75} /></span>
          <span>Cart</span>
          {cartCount > 0 ? <span className="badge">{cartCount > 99 ? '99+' : cartCount}</span> : null}
        </button>
        <Link href="/account" className={isActive('/account') ? 'active' : ''}>
          <span className="icon"><Icon name="user" size={23} stroke={1.75} /></span>
          <span>Account</span>
        </Link>
      </nav>
    </div>
  );
}
