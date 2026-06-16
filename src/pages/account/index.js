import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import SEO from '../../components/SEO'
import { Icon } from '../../components/Primitives'
import { useCart } from '../../context/CartContext'

// Customer account dashboard — the retention surface behind the account
// gate: order history (verified email only), live status + tracking,
// one-click reorder, and the marketing/restock preference center.

const STATUS_LABELS = {
  pending: 'Order received',
  packed: 'Packed',
  shipped: 'Shipped',
  fulfilled: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_CLASSES = {
  pending: 'bg-warning/10 text-warning border-warning/30',
  packed: 'bg-accent-soft text-accent-strong border-accent/30',
  shipped: 'bg-ink/10 text-ink border-ink/30',
  fulfilled: 'bg-success/10 text-success border-success/30',
  cancelled: 'bg-danger/10 text-danger border-danger/30',
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

export default function AccountDashboard() {
  const router = useRouter()
  const { addToCart, setIsCartOpen } = useCart()

  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [prefs, setPrefs] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const loadOrders = useCallback(async () => {
    const res = await fetch('/api/customers/orders')
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}))
      if (data.needsVerification) {
        setNeedsVerification(true)
        setOrders([])
        return
      }
    }
    if (res.ok) {
      const data = await res.json()
      setOrders(data.orders || [])
      setNeedsVerification(false)
    } else {
      setOrders([])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const meRes = await fetch('/api/customers/me')
      if (meRes.status === 401) {
        router.replace('/account/login?next=/account')
        return
      }
      if (!meRes.ok) {
        if (!cancelled) setLoading(false)
        return
      }
      const { customer: me } = await meRes.json()
      if (cancelled) return
      setCustomer(me)
      setLoading(false)
      loadOrders()
      fetch('/api/customers/preferences')
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => { if (!cancelled && p) setPrefs(p) })
        .catch(() => {})
    }
    boot()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Post-verification landing (?verified=1 from the email link).
  useEffect(() => {
    if (!router.isReady) return
    if (router.query.verified === '1') setNotice('Email verified — your order history is unlocked.')
    if (router.query.verify_error === '1') setNotice('That verification link is invalid or expired — resend below.')
  }, [router.isReady, router.query.verified, router.query.verify_error])

  async function resendVerification() {
    setBusy('verify')
    const res = await fetch('/api/customers/request-verify', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setNotice(res.ok ? 'Verification email sent — check your inbox.' : (data.error || 'Could not send — try again shortly.'))
    setBusy('')
  }

  async function toggleMarketing(optOut) {
    setBusy('prefs')
    const res = await fetch('/api/customers/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketingOptOut: optOut }),
    })
    if (res.ok) setPrefs((p) => ({ ...p, marketingOptedOut: optOut, suppressionReason: optOut ? 'preference' : null }))
    setBusy('')
  }

  async function removeAlert(sku) {
    const res = await fetch('/api/customers/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeRestockSku: sku }),
    })
    if (res.ok) setPrefs((p) => ({ ...p, restockAlerts: (p.restockAlerts || []).filter((a) => a.product_sku !== sku) }))
  }

  function reorder(order) {
    let added = 0
    for (const item of order.items || []) {
      // order.items are enriched with display fields server-side
      // (/api/customers/orders), so add them straight to the cart — no
      // client-side catalog import.
      if (!item || !item.id || typeof item.price !== 'number') continue
      for (let i = 0; i < (item.quantity || 1); i++) addToCart(item)
      added++
    }
    if (added === 0) {
      setNotice('Those items are no longer in the catalog — browse the shop for current stock.')
      return
    }
    if (added < (order.items || []).length) {
      setNotice('Some items from that order are no longer available — the rest are in your cart.')
    }
    setIsCartOpen(true)
  }

  async function signOut() {
    await fetch('/api/customers/logout', { method: 'POST' }).catch(() => {})
    router.push('/')
  }

  if (loading) {
    return (
      <div className="max-w-container mx-auto px-8 py-20">
        <SEO title="Account" path="/account" noindex />
        <p className="opp-meta-mono text-ink-mute">Loading your account…</p>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="max-w-container mx-auto px-8 py-20">
        <SEO title="Account" path="/account" noindex />
        <p className="text-ink-soft">
          Couldn&apos;t load your account. <Link href="/account/login?next=/account" className="text-accent-strong hover:underline">Sign in</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-container mx-auto px-8 py-14">
      <SEO title="Your Account" path="/account" noindex />

      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <span className="opp-eyebrow">Account</span>
          <h1 className="font-display font-semibold tracking-display text-4xl mt-2 mb-1 text-ink">
            {customer.name ? customer.name : 'Your account'}
          </h1>
          <p className="opp-meta-mono text-ink-mute m-0">
            {customer.email}
            {customer.email_verified ? (
              <span className="ml-2 text-success">✓ verified</span>
            ) : (
              <span className="ml-2 text-warning">unverified</span>
            )}
          </p>
        </div>
        <button className="btn-outline text-sm" onClick={signOut}>Sign out</button>
      </div>

      {notice && (
        <div className="mb-6 px-4 py-3 bg-surfaceAlt border border-line rounded-opp text-[13px] text-ink">
          {notice}
        </div>
      )}

      {(needsVerification || !customer.email_verified) && (
        <div className="mb-8 p-5 card-premium border border-warning/40">
          <p className="text-ink m-0 mb-1 font-semibold">Verify your email to unlock order history</p>
          <p className="text-ink-soft text-sm m-0 mb-3">
            We emailed a verification link when you created the account. Order history stays locked until it&apos;s clicked —
            it&apos;s what keeps someone else from registering your email and reading your orders.
          </p>
          <button className="btn-primary text-sm" onClick={resendVerification} disabled={busy === 'verify'}>
            {busy === 'verify' ? 'Sending…' : 'Resend verification email'}
          </button>
        </div>
      )}

      {/* Orders */}
      <h2 className="font-display font-semibold text-2xl text-ink mb-4">Orders</h2>
      {orders === null && <p className="opp-meta-mono text-ink-mute">Loading orders…</p>}
      {orders !== null && orders.length === 0 && !needsVerification && customer.email_verified && (
        <p className="text-ink-soft">
          No orders on this email yet. <Link href="/shop" className="text-accent-strong hover:underline">Browse the catalog</Link>
        </p>
      )}
      <div className="flex flex-col gap-4 mb-12">
        {(orders || []).map((order) => {
          const status = order.fulfillment_status || 'pending'
          const refunded = !!order.refunded_at
          return (
            <div key={order.order_number} className="card-premium p-6">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm text-ink">{order.order_number}</span>
                  <span className="opp-meta-mono text-ink-mute">{formatDate(order.created_at)}</span>
                  <span className={`text-[11px] font-mono uppercase tracking-wide px-2 py-0.5 border rounded-full ${refunded ? STATUS_CLASSES.cancelled : (STATUS_CLASSES[status] || STATUS_CLASSES.pending)}`}>
                    {refunded ? 'Refunded' : (STATUS_LABELS[status] || status)}
                  </span>
                </div>
                <span className="font-mono text-ink">${Number(order.total || 0).toFixed(2)}</span>
              </div>
              <ul className="m-0 mb-4 p-0 list-none text-sm text-ink-soft">
                {(order.items || []).map((it, i) => (
                  <li key={i} className="py-0.5">
                    {it.quantity}× {it.name || it.sku}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-3 flex-wrap">
                <button className="btn-primary text-sm" onClick={() => reorder(order)}>
                  Reorder <Icon name="arrow" size={14} />
                </button>
                <Link href={`/orders/${encodeURIComponent(order.order_number)}?email=${encodeURIComponent(customer.email)}`} className="btn-outline text-sm">
                  View details
                </Link>
                {order.tracking_url && (
                  <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="text-accent-strong text-sm hover:underline">
                    Track {order.tracking_carrier ? `(${order.tracking_carrier})` : ''} →
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Preferences */}
      <h2 className="font-display font-semibold text-2xl text-ink mb-4">Email preferences</h2>
      <div className="card-premium p-6 max-w-xl">
        {!prefs && <p className="opp-meta-mono text-ink-mute m-0">Loading preferences…</p>}
        {prefs && (
          <>
            <div className="flex items-center justify-between gap-4 mb-1">
              <div>
                <p className="text-ink m-0 font-semibold text-sm">Restock alerts &amp; new-drop emails</p>
                <p className="text-ink-soft text-[13px] m-0">
                  Order confirmations, shipping, and account emails always send.
                </p>
              </div>
              <button
                className={prefs.marketingOptedOut ? 'btn-outline text-sm' : 'btn-primary text-sm'}
                disabled={busy === 'prefs' || ['bounce', 'complaint'].includes(prefs.suppressionReason)}
                onClick={() => toggleMarketing(!prefs.marketingOptedOut)}
              >
                {prefs.marketingOptedOut ? 'Opted out — re-enable' : 'Subscribed — opt out'}
              </button>
            </div>
            {['bounce', 'complaint'].includes(prefs.suppressionReason) && (
              <p className="text-[12px] text-warning m-0 mb-2">
                This address previously bounced — contact support to re-enable sends.
              </p>
            )}
            {(prefs.restockAlerts || []).filter((a) => a.status !== 'notified').length > 0 && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="opp-meta-mono uppercase text-ink-mute mb-2">Pending restock alerts</p>
                <ul className="m-0 p-0 list-none">
                  {prefs.restockAlerts.filter((a) => a.status !== 'notified').map((a) => (
                    <li key={a.product_sku} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="font-mono text-ink-soft">{a.product_sku}</span>
                      <button className="text-danger text-[13px] hover:underline" onClick={() => removeAlert(a.product_sku)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
