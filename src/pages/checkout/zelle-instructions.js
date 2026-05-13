import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useCart } from '../../context/CartContext'
import SEO from '../../components/SEO'
import { Icon } from '../../components/Primitives'

const ZELLE_RECIPIENT = 'admin@optimizedperformancepeptides.com'

export default function ZelleInstructions() {
  const router = useRouter()
  const { clearCart } = useCart()
  const orderNumber = typeof router.query.order === 'string' ? router.query.order : ''
  const amount = typeof router.query.amount === 'string' ? router.query.amount : ''
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    // Order is reserved server-side; cart is no longer the source of truth.
    clearCart()
  }, [clearCart])

  function copyValue(label, value) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="max-w-container mx-auto px-8 py-16">
      <SEO title="Complete your Zelle payment" description="Send your Zelle payment to complete your OPP order." path="/checkout/zelle-instructions" />

      <div className="max-w-2xl mx-auto">
        <span className="opp-eyebrow">Almost done</span>
        <h1 className="font-display font-semibold tracking-display text-4xl m-0 mt-3 mb-3 text-ink">
          Complete your Zelle payment
        </h1>
        <p className="text-ink-soft m-0 mb-8">
          Your order is reserved. Send the Zelle below from your bank app to confirm it. We'll ship within 1 business day once payment lands.
        </p>

        <div className="card-premium p-6 md:p-8 mb-6">
          <div className="grid gap-5">
            <Field
              label="Send to"
              value={ZELLE_RECIPIENT}
              copyKey="recipient"
              copied={copied === 'recipient'}
              onCopy={() => copyValue('recipient', ZELLE_RECIPIENT)}
            />
            {amount && (
              <Field
                label="Amount"
                value={`$${amount}`}
                copyKey="amount"
                copied={copied === 'amount'}
                onCopy={() => copyValue('amount', amount)}
                mono
              />
            )}
            <Field
              label="Memo (required)"
              value={orderNumber || '—'}
              copyKey="memo"
              copied={copied === 'memo'}
              onCopy={() => copyValue('memo', orderNumber)}
              mono
              hint="Put this in the Zelle memo so we can match the payment to your order."
            />
          </div>
        </div>

        <div className="card-premium p-6 mb-6 bg-surfaceAlt">
          <h3 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-mute m-0 mb-3">
            How this works
          </h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-ink-soft leading-relaxed m-0">
            <li>Open your bank app, navigate to Zelle, and send the amount above to <span className="font-mono text-ink">{ZELLE_RECIPIENT}</span>.</li>
            <li>Put your order number <span className="font-mono text-ink">{orderNumber || '—'}</span> in the memo field. This is how we match the payment to your order.</li>
            <li>Most banks settle Zelle instantly. We confirm orders during business hours and ship within 1 business day of payment landing.</li>
            <li>You'll receive an order-confirmation email once we've matched your payment.</li>
          </ol>
        </div>

        <p className="opp-meta-mono text-ink-mute mb-8">
          Order pending up to 72 hours. After that, unmatched orders are cancelled and any reserved inventory is released. Questions: email{' '}
          <a href="mailto:admin@optimizedperformancepeptides.com" className="text-accent-strong hover:underline">admin@optimizedperformancepeptides.com</a>{' '}
          or call <a href="tel:+18312185147" className="font-mono text-accent-strong hover:underline">(831) 218-5147</a>.
        </p>

        <div className="flex gap-3 flex-wrap">
          <button className="btn-primary" onClick={() => router.push('/shop')}>
            <Icon name="arrow" size={16} /> Keep browsing
          </button>
          {orderNumber && (
            <Link href={`/orders/${encodeURIComponent(orderNumber)}`} className="btn-outline">
              Check order status
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, copyKey, copied, onCopy, mono, hint }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="opp-meta-mono text-accent-strong hover:underline"
          aria-label={`Copy ${label}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={`p-3 bg-surfaceAlt border border-line rounded-opp ${mono ? 'font-mono' : ''} text-ink break-all`}>
        {value}
      </div>
      {hint && <p className="text-xs text-ink-mute mt-1.5 m-0">{hint}</p>}
    </div>
  )
}
