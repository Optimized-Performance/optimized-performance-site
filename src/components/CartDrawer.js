import { useRouter } from 'next/router';
import { useCart } from '../context/CartContext';

export default function CartDrawer() {
  const router = useRouter();
  const {
    cartItems,
    isCartOpen,
    setIsCartOpen,
    removeFromCart,
    updateQuantity,
    cartTotal,
  } = useCart();

  if (!isCartOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
        onClick={() => setIsCartOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 w-[400px] max-w-[90vw] h-screen bg-brand-navy z-[201] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-heading font-bold text-brand-cream">Your Cart</h2>
          <button
            className="p-1 text-brand-muted hover:text-brand-cream transition-colors"
            onClick={() => setIsCartOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {cartItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-10">
            <p className="text-brand-muted text-base mb-5">Your cart is empty</p>
            <button
              className="btn-primary"
              onClick={() => setIsCartOpen(false)}
            >
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between items-start py-4 border-b border-white/[0.06]">
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-brand-cream">{item.name}</h4>
                    <p className="text-xs text-brand-muted mt-0.5">{item.dosage}</p>
                    <p className="text-sm font-semibold text-brand-cyan mt-1.5">${item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 border border-white/10 rounded-md px-1 py-0.5">
                      <button
                        className="w-7 h-7 flex items-center justify-center text-brand-cream font-bold text-base hover:text-brand-cyan transition-colors bg-transparent border-none cursor-pointer"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        -
                      </button>
                      <span className="text-sm font-semibold text-brand-cream min-w-[20px] text-center">{item.quantity}</span>
                      <button
                        className="w-7 h-7 flex items-center justify-center text-brand-cream font-bold text-base hover:text-brand-cyan transition-colors bg-transparent border-none cursor-pointer"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="text-xs text-red-400 hover:text-red-300 transition-colors bg-transparent border-none cursor-pointer"
                      onClick={() => removeFromCart(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-5 border-t border-white/[0.06] bg-brand-surface">
              <div className="flex justify-between items-center mb-1">
                <span className="text-base font-semibold text-brand-cream">Subtotal</span>
                <span className="text-xl font-bold text-brand-cream font-heading">${cartTotal.toFixed(2)}</span>
              </div>
              <p className="text-xs text-brand-muted mb-4">Shipping calculated at checkout</p>
              <button
                className="w-full btn-primary text-[15px] py-3.5"
                onClick={() => {
                  setIsCartOpen(false);
                  router.push('/checkout');
                }}
              >
                Proceed to Checkout
              </button>
              <p className="text-[11px] text-brand-muted text-center mt-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00B4D8" strokeWidth="2" className="inline-block align-middle mr-1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Secure checkout powered by crypto payment rails
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
