import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useCart } from '../../context/CartContext'
import SEO from '../../components/SEO'
import { Icon } from '../../components/Primitives'

// Keep this in sync with VENMO_BUSINESS_HANDLE in src/lib/alerts.js — both
// fall back to the same default so a missing env var doesn't break the flow.
const VENMO_HANDLE = 'optimizedperformance'

// Universal link — Venmo opens the app on mobile (with the amount + note
// pre-filled) and the web page on desktop. Avoids the venmo:// scheme's
// silent failure on desktop browsers.
function buildVenmoUrl({ amount, orderNumber }) {
  const params = new URLSearchParams({
    txn: 'pay',
    audience: 'private',
    recipients: VENMO_HANDLE,
  })
  if (amount) params.set('amount', amount)
  if (orderNumber) params.set('note', orderNumber)
  return `https://venmo.com/?${params.toString()}`
}

export default function VenmoInstructions() {
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

  const venmoUrl = buildVenmoUrl({ amount, orderNumber })

  return (
    <div className="max-w-container mx-auto px-8 py-16">
      <SEO title="Complete your Venmo payment" description="Send your Venmo payment to complete your OPP order." path="/checkout/venmo-instructions" />

      <div className="max-w-2xl mx-auto">
        <span className="opp-eyebrow">Almost done</span>
        <h1 className="font-display font-semibold tracking-display text-4xl m-0 mt-3 mb-3 text-ink">
          Complete your Venmo payment
        </h1>
        <p className="text-ink-soft m-0 mb-8">
          Your order is reserved. Send the Venmo below from your phone to confirm it. We&apos;ll ship within 1 business day once payment lands.
        </p>

        <div className="card-premium p-6 md:p-8 mb-6">
          <a
            href={venmoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 mb-6"
          >
            <Icon name="arrow" size={16} /> Open in Venmo
          </a>
          <p className="text-xs text-ink-mute m-0 mb-6 text-center">
            On mobile, this opens the Venmo app with the amount and note pre-filled. On desktop, it opens venmo.com — pay from your phone for the smoothest flow.
          </p>

          <div className="border-t border-line pt-6">
            <h3 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-mute m-0 mb-4">
              Or enter manually
            </h3>
            <div className="grid gap-5">
              <Field
                label="Send to"
                value={`@${VENMO_HANDLE}`}
                copyKey="recipient"
                copied={copied === 'recipient'}
                onCopy={() => copyValue('recipient', `@${VENMO_HANDLE}`)}
                mono
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
                label="Note (required)"
                value={orderNumber || '—'}
                copyKey="memo"
                copied={copied === 'memo'}
                onCopy={() => copyValue('memo', orderNumber)}
                mono
                hint="Put ONLY this order number in the Venmo note so we can match the payment to your order."
              />
            </div>
          </div>
        </div>

        <div className="card-premium p-6 mb-6 bg-surfaceAlt">
          <h3 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-mute m-0 mb-3">
            How this works
          </h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-ink-soft leading-relaxed m-0">
            <li>Tap <strong>Open in Venmo</strong> above (or open the app manually and search <span className="font-mono text-ink">@{VENMO_HANDLE}</span>).</li>
            <li>Confirm the amount and put your order number <span className="font-mono text-ink">{orderNumber || '—'}</span> in the note. This is how we match the payment to your order.</li>
            <li>Pay from your Venmo balance, bank account, or debit card — all free. Credit card funding adds a 3% Venmo fee paid by you.</li>
            <li>We confirm orders during business hours and ship within 1 business day of payment landing. You&apos;ll receive an order-confirmation email once we&apos;ve matched your payment.</li>
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
