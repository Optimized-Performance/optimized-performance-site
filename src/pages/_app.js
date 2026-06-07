import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { track } from '../lib/track';
import { CartProvider } from '../context/CartContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CartDrawer from '../components/CartDrawer';
import '../styles/globals.css';

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const AgeGate = dynamic(() => import('../components/AgeGate'), { ssr: false });
const LaunchBanner = dynamic(() => import('../components/LaunchBanner'), { ssr: false });
const MemorialDayBanner = dynamic(() => import('../components/MemorialDayBanner'), { ssr: false });
const Glp3BogoBanner = dynamic(() => import('../components/Glp3BogoBanner'), { ssr: false });

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isAdmin = router.pathname.startsWith('/admin');
  const isCheckout = router.pathname.startsWith('/checkout');

  // First-party funnel: fire a page_view on initial load + every route change,
  // and a product_view on product pages. Skips /admin (internal noise).
  useEffect(() => {
    const fire = (url) => {
      const path = String(url || '').split('?')[0] || '/';
      if (path.startsWith('/admin')) return;
      track('page_view', { path });
      if (path.startsWith('/products/')) {
        const product_id = path.split('/products/')[1]?.split('/')[0] || null;
        if (product_id) track('product_view', { path, product_id });
      }
    };
    fire(router.asPath);
    router.events.on('routeChangeComplete', fire);
    return () => router.events.off('routeChangeComplete', fire);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const showLaunchBanner = !isAdmin && !isCheckout;
  const showMemorialDayBanner = !isAdmin; // Show on checkout too — reinforces the sale at the moment of purchase
  const showBogoBanner = !isAdmin; // GLP-3 B2G1 — show on checkout too

  return (
    <CartProvider>
      <div className={`${interTight.variable} ${jetbrainsMono.variable} min-h-screen flex flex-col bg-paper text-ink font-body`}>
        {isAdmin ? (
          <Component {...pageProps} />
        ) : (
          <>
            {showMemorialDayBanner && <MemorialDayBanner />}
            {showBogoBanner && <Glp3BogoBanner />}
            {showLaunchBanner && <LaunchBanner />}
            <Header />
            <CartDrawer />
            <main className="flex-1">
              <Component {...pageProps} />
            </main>
            <Footer />
            <AgeGate />
          </>
        )}
      </div>
      <Analytics />
    </CartProvider>
  );
}
