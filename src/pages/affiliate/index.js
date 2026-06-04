import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { Logo } from '../../components/Primitives'

const TOKEN_KEY = 'opp_aff_token'

function fmtUsd(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtPeriod(p) {
  if (!p) return '—'
  const [y, m] = p.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
}
function fmtPct(n) {
  if (n === null || n === undefined) return '—'
  return `${(Number(n) * 100).toFixed(1)}%`
}

export default function AffiliateDashboard() {
  const router = useRouter()
  const [phase, setPhase] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [token, setToken] = useState('')
  const [me, setMe] = useState(null)
  const [payouts, setPayouts] = useState(null)
  const [network, setNetwork] = useState(null)
  const [copied, setCopied] = useState('')
  const [siteUrl, setSiteUrl] = useState('')

  // Boot — read token from sessionStorage; redirect to login if missing
  useEffect(() => {
    setSiteUrl(window.location.origin)
    let stored = ''
    try { stored = sessionStorage.getItem(TOKEN_KEY) || '' } catch { /* fail */ }
    if (!stored) {
      router.replace('/affiliate/login')
      return
    }
    setToken(stored)
  }, [router])

  const loadDashboard = useCallback(async (authToken) => {
    try {
      const headers = { 'x-affiliate-token': authToken }
      const [meRes, payRes] = await Promise.all([
        fetch('/api/affiliates/me', { headers }),
        fetch('/api/affiliates/payouts', { headers }),
      ])
      if (meRes.status === 401) {
        // Token bad/expired — clear + redirect
        try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* fail */ }
        router.replace('/affiliate/login')
        return
      }
      if (!meRes.ok) {
        setErrorMsg('Could not load account data')
        setPhase('error')
        return
      }
      const meData = await meRes.json()
      setMe(meData)
      const payData = payRes.ok ? await payRes.json() : { payouts: [], monthly_volume: [] }
      setPayouts(payData)

      if (meData.affiliate?.has_network) {
        const nRes = await fetch('/api/affiliates/network', { headers })
        if (nRes.ok) setNetwork(await nRes.json())
      }
      setPhase('ready')
    } catch {
      setErrorMsg('Network error loading dashboard')
      setPhase('error')
    }
  }, [router])

  useEffect(() => {
    if (token) loadDashboard(token)
  }, [token, loadDashboard])

  function copy(s, label) {
    navigator.clipboard.writeText(s).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    })
  }

  function logout() {
    try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* fail */ }
    router.replace('/affiliate/login')
  }

  // ===== Render =====

  if (phase === 'loading') {
    return <Shell><div className="text-center py-16 text-ink-mute">Loading…</div></Shell>
  }

  if (phase === 'error') {
    return (
      <Shell>
        <div className="card-premium p-8 max-w-md mx-auto text-center">
          <h1 className="font-display font-semibold text-xl mb-3 text-danger">Something went wrong</h1>
          <p className="text-ink-soft">{errorMsg}</p>
          <button className="btn-primary mt-4" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </Shell>
    )
  }

  if (!me) return null
  const aff = me.affiliate
  const stats = me.stats
  const shareLink = `${siteUrl}/?ref=${aff.code}`

  return (
    <Shell>
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <p className="opp-meta-mono uppercase">Welcome back</p>
          <h1 className="font-display font-semibold text-2xl m-0 text-ink">{aff.name}</h1>
          <p className="opp-meta-mono mt-1">Member since {fmtDate(aff.member_since)}</p>
        </div>
        <button onClick={logout} className="btn-outline text-xs px-4 py-2">Log out</button>
      </div>

      {/* YTD top row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-4">
        <Stat label="YTD volume" value={fmtUsd(stats.ytd_volume)} sub={`${stats.ytd_orders} orders`} />
        <Stat label="YTD commission" value={fmtUsd(stats.ytd_commission)} tone="success" />
        <Stat label="YTD payouts processed" value={fmtUsd(stats.ytd_payouts_total)} sub="overrides + royalties" />
        <Stat label="Pending payouts" value={fmtUsd(me.pending_total)} tone="warn" sub={`${me.pending_payouts.length} items`} />
      </div>

      {/* MTD second row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <Stat label="Current rate" value={`${aff.commission_pct}%`} />
        <Stat label="MTD volume" value={fmtUsd(stats.mtd_volume)} sub={`${stats.mtd_orders} orders`} />
        <Stat label="MTD commission" value={fmtUsd(stats.mtd_commission)} tone="success" />
        <Stat label="Last month volume" value={fmtUsd(stats.last_month_volume)} sub={`${stats.last_month_orders} orders`} />
      </div>

      {/* Royalty (flat-rate primaries only — e.g. Tris) */}
      {me.royalty?.eligible && (
        <div className="card-premium p-6 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h2 className="font-display font-semibold text-lg m-0 text-ink">Royalty</h2>
            <div className="opp-meta-mono uppercase">{me.royalty.pct}% of OPP gross revenue</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <Stat label="Projected this month" value={fmtUsd(me.royalty.projected_mtd)} tone="success" sub="month-to-date, paid after month-end" />
            <Stat label={fmtPeriod(me.royalty.last_period)} value={fmtUsd(me.royalty.last_month)} sub="last month's royalty" />
            <Stat label="Pending royalty" value={fmtUsd(me.royalty.pending)} tone="warn" />
            <Stat label="Lifetime royalty paid" value={fmtUsd(me.royalty.lifetime_paid)} tone="success" />
          </div>
          <p className="opp-meta-mono mt-3 text-ink-mute">
            Royalty is {me.royalty.pct}% of Optimized Performance&apos;s total gross revenue across all sales and channels, processed monthly.
          </p>
        </div>
      )}

      {/* Checkout performance — payment completion + card fall-off */}
      {me.funnel && (
        <div className="card-premium p-6 mb-6">
          <h2 className="font-display font-semibold text-lg mb-1 text-ink">Checkout performance</h2>
          <p className="opp-meta-mono mb-4 text-ink-mute">
            How your referred orders complete payment. Customers can pay by card, PayPal, Zelle, or crypto — if one rail doesn&apos;t go through, the others do.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
            <Stat label="Orders completed" value={me.funnel.completed} />
            <Stat label="Payment completion" value={fmtPct(me.funnel.completionRate)} tone="success" />
            <Stat
              label="Card / PayPal fall-off"
              value={fmtPct(me.funnel.cardFallOffRate)}
              tone={(me.funnel.cardFallOffRate ?? 0) > 0.1 ? 'warn' : 'success'}
              sub={`${me.funnel.cardAttempts} card attempts`}
            />
          </div>
        </div>
      )}

      {/* Code + share */}
      <div className="card-premium p-6 mb-6">
        <h2 className="font-display font-semibold text-lg mb-3 text-ink">Your affiliate code</h2>
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="font-mono text-2xl font-bold text-accent-strong tracking-wide">{aff.code}</div>
          <div className="flex-1 min-w-0">
            <p className="opp-meta-mono uppercase mb-1">Share link</p>
            <div className="flex gap-2 items-center">
              <input className="input-field font-mono text-sm flex-1" readOnly value={shareLink} onFocus={(e) => e.target.select()} />
              <button className="btn-outline text-xs px-3 py-2" onClick={() => copy(shareLink, 'link')}>
                {copied === 'link' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
        <p className="opp-meta-mono mt-3 text-ink-mute">
          Customers using your code get {aff.discount_pct}% off at checkout.
        </p>
      </div>

      {/* Network section */}
      {aff.has_network && network && (
        <div className="card-premium p-6 mb-6">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h2 className="font-display font-semibold text-lg m-0 text-ink">Your network</h2>
            <div className="opp-meta-mono uppercase">
              {network.recruit_count} recruits · {network.override_pct}% override
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-4">
            <Stat label="MTD network volume" value={fmtUsd(network.mtd_recruit_volume)} />
            <Stat label="MTD projected override" value={fmtUsd(network.mtd_projected_override_total)} tone="success" />
            <Stat label="Pending override" value={fmtUsd(network.lifetime_override_pending)} tone="warn" />
            <Stat label="Lifetime override paid" value={fmtUsd(network.lifetime_override_paid)} tone="success" />
          </div>

          {network.recruits.length === 0 ? (
            <p className="text-ink-mute text-sm">No recruits yet. As recruits onboard, they'll show up here.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-surfaceAlt">
                <tr>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase text-ink-mute">Recruit</th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] uppercase text-ink-mute">Code</th>
                  <th className="px-3 py-2 text-center font-mono text-[10px] uppercase text-ink-mute">Tier</th>
                  <th className="px-3 py-2 text-right font-mono text-[10px] uppercase text-ink-mute">MTD volume</th>
                  <th className="px-3 py-2 text-right font-mono text-[10px] uppercase text-ink-mute">MTD override</th>
                  <th className="px-3 py-2 text-center font-mono text-[10px] uppercase text-ink-mute">Status</th>
                </tr>
              </thead>
              <tbody>
                {network.recruits.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-2 font-semibold text-ink">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-accent-strong">{r.code}</td>
                    <td className="px-3 py-2 text-center">{r.commission_pct}%</td>
                    <td className="px-3 py-2 text-right">{fmtUsd(r.mtd_volume)}</td>
                    <td className="px-3 py-2 text-right text-success font-semibold">{fmtUsd(r.mtd_projected_override)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.active ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {r.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pending payouts */}
      {me.pending_payouts.length > 0 && (
        <div className="card-premium p-6 mb-6">
          <h2 className="font-display font-semibold text-lg mb-3 text-ink">Pending payouts</h2>
          <table className="w-full text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase text-ink-mute">Period</th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase text-ink-mute">Type</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase text-ink-mute">Amount</th>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase text-ink-mute">Notes</th>
              </tr>
            </thead>
            <tbody>
              {me.pending_payouts.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-2 font-mono">{fmtPeriod(p.period)}</td>
                  <td className="px-3 py-2 capitalize">{p.payout_type}</td>
                  <td className="px-3 py-2 text-right font-semibold text-warning">{fmtUsd(p.amount)}</td>
                  <td className="px-3 py-2 text-ink-mute">{p.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Monthly history */}
      {payouts && payouts.monthly_volume.length > 0 && (
        <div className="card-premium p-6 mb-6">
          <h2 className="font-display font-semibold text-lg mb-3 text-ink">Monthly history (last 12 months)</h2>
          <table className="w-full text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                <th className="px-3 py-2 text-left font-mono text-[10px] uppercase text-ink-mute">Period</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase text-ink-mute">Volume</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase text-ink-mute">Orders</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase text-ink-mute">Commission</th>
              </tr>
            </thead>
            <tbody>
              {payouts.monthly_volume.map((m) => (
                <tr key={m.period} className="border-t border-line">
                  <td className="px-3 py-2 font-mono">{fmtPeriod(m.period)}</td>
                  <td className="px-3 py-2 text-right">{fmtUsd(m.volume)}</td>
                  <td className="px-3 py-2 text-right">{m.orders}</td>
                  <td className="px-3 py-2 text-right text-success">{fmtUsd(m.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="opp-meta-mono mt-2 text-ink-mute text-xs">
            Commission per order locks in at the rate in effect at order time. Tier ratchets apply to future orders only.
          </p>
        </div>
      )}

      {/* Lifetime */}
      <div className="card-premium p-6 mb-6">
        <h2 className="font-display font-semibold text-lg mb-3 text-ink">Lifetime</h2>
        <div className="grid grid-cols-3 gap-4">
          <MiniStat label="Volume" value={fmtUsd(stats.lifetime_volume)} />
          <MiniStat label="Orders" value={stats.lifetime_orders} />
          <MiniStat label="Commission" value={fmtUsd(stats.lifetime_commission)} />
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <>
      <Head>
        <title>Affiliate Dashboard · OPP</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-surface">
        <header className="border-b border-line bg-white">
          <div className="max-w-6xl mx-auto px-5 py-4 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 text-ink no-underline">
              <Logo size={28} />
              <div>
                <div className="font-display font-semibold text-base">Optimized Performance</div>
                <div className="opp-meta-mono">Affiliate Portal</div>
              </div>
            </Link>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-5 py-8">{children}</main>
      </div>
    </>
  )
}

function Stat({ label, value, sub, tone = '' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-ink'
  return (
    <div className="card-premium p-4">
      <div className="opp-meta-mono uppercase">{label}</div>
      <div className={`font-display font-semibold tracking-display text-xl mt-1 ${toneClass}`}>{value}</div>
      {sub && <div className="opp-meta-mono mt-1 text-ink-mute">{sub}</div>}
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="opp-meta-mono uppercase text-ink-mute">{label}</div>
      <div className="font-display font-semibold text-base text-ink mt-0.5">{value}</div>
    </div>
  )
}
