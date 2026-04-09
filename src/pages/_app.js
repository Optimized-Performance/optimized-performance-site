import dynamic from 'next/dynamic';
import { Plus_Jakarta_Sans, Inter } from 'next/font/google';
import { CartProvider } from '../context/CartContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CartDrawer from '../components/CartDrawer';
import '../styles/globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const MoonPayProvider = dynamic(
  () => import('@moonpay/moonpay-react').then((mod) => mod.MoonPayProvider),
  { ssr: false }
);

export default function App({ Component, pageProps }) {
  return (
    <MoonPayProvider
      apiKey={process.env.NEXT_PUBLIC_MOONPAY_API_KEY}
      debug={process.env.NODE_ENV === 'development'}
    >
    <CartProvider>
      <div className={`${jakarta.variable} ${inter.variable} min-h-screen flex flex-col bg-brand-dark font-body`}>
        <Header />
        <CartDrawer />
        <main className="flex-1">
          <Component {...pageProps} />
        </main>
        <Footer />
      </div>
    </CartProvider>
    </MoonPayProvider>
  );
}
