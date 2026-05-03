import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useCart } from '../../context/CartContext'
import SEO from '../../components/SEO'
import { Icon } from '../../components/Primitives'

export default function CheckoutSuccess() {
  const router = useRouter()
  const { clearCart } = useCart()
  const orderNumber = typeof router.query.order === 'string' ? router.query.order : ''

  useEffect(() => {
    clearCart()
  }, [clearCart])

  return (
    <div className="max-w-container mx-auto px-8 py-20 text-center">
      <SEO title="Order placed" description="Order confirmed." path="/checkout/success" />
      <div className="w-[72px] h-[72px] rounded-full bg-success text-surface flex items-center justify-center mx-auto mb-6">
        <Icon name="check" size={32} />
      </div>
      <h1 className="font-display font-semibold tracking-display text-4xl m-0 mb-2 text-ink">
        Order placed.
      </h1>
      {orderNumber && (
        <p className="opp-meta-mono text-accent-strong mb-2">Order #{orderNumber}</p>
      )}
      <p className="text-ink-soft max-w-md mx-auto mb-6">
        Confirmation sent to your email. You&apos;ll receive a tracking number once it ships.
      </p>
      <p className="opp-meta-mono text-ink-mute max-w-lg mx-auto mb-2">
        Charge will appear on your statement as <span className="font-mono text-ink">OPTIMIZED PERFORMANCE INC</span>
      </p>
      <p className="text-xs text-ink-mute max-w-md mx-auto mb-8">
        Anything off with your order? Email <a href="mailto:admin@optimizedperformancepeptides.com" className="text-accent-strong hover:underline">admin@optimizedperformancepeptides.com</a> or call <a href="tel:+18312185147" className="font-mono text-accent-strong hover:underline">(831) 218-5147</a> — direct refunds are faster than disputes. See <Link href="/shipping#returns-refunds" className="text-accent-strong hover:underline">Returns &amp; Refunds</Link>.
      </p>
      <button className="btn-primary" onClick={() => router.push('/')}>
        Back to Home <Icon name="arrow" size={16} />
      </button>
    </div>
  )
}
