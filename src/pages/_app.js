import { CartProvider } from '../context/CartContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CartDrawer from '../components/CartDrawer';

export default function App({ Component, pageProps }) {
  return (
    <CartProvider>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F5F8FA',
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}>
        <Header />
        <CartDrawer />
        <main style={{ flex: 1 }}>
          <Component {...pageProps} />
        </main>
        <Footer />
      </div>

      {/* Global styles */}
      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          background-color: #F5F8FA;
        }
        a {
          color: inherit;
          text-decoration: none;
        }
      `}</style>
    </CartProvider>
  );
}
