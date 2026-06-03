import { useEffect, useState } from 'react'

const RAIL_ORDER = ['card', 'paypal', 'crypto', 'zelle', 'venmo', 'other']
const RAIL_LABELS = {
  card: 'Card',
  paypal: 'PayPal',
  crypto: 'Crypto',
  zelle: 'Zelle',
  venmo: 'Venmo',
  other: 'Other',
}
// Manual rails don't auto-abandon — an unpaid Zelle/Venmo just sits 'pending',
// so their fall-off isn't captured the way instant rails' is. Flag in the UI.
const MANUAL_RAILS = ['zelle', 'venmo']

function fmtPct(n) {
  if (n === null || n === undefined) return '—'
  return `${(Number(n) * 100).toFixed(1)}%`
}
function fallOffTone(r) {
  if (r === null || r === undefined) return 'text-ink'
  if (r >= 0.4) return 'text-danger'
  if (r >= 0.2) return 'text-warning'
  return 'text-success'
}
function completionTone(r) {
  if (r === null || r === undefined) return 'text-ink'
  if (r >= 0.8) return 'text-success'
  if (r >= 0.6) return 'text-warning'
  return 'text-danger'
}

export default function FunnelTab({ token }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState('') // '' = all time

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  function authHeaders() {
    return { 'x-admin-token': token || '' }
  }

  async function fetchData() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (days) params.set('days', days)
      const res = await fetch(`/api/admin/funnel?${params.toString()}`, { headers: authHeaders() })
      if (res.ok) setData(await res.json())
    } catch {
      /* fail silently — empty state covers it */
    }
    setLoading(false)
  }

  const windows = [
    ['', 'All time'],
    ['90', 'Last 90d'],
    ['30', 'Last 30d'],
  ]

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Payment Funnel</h2>
          <p className="opp-meta-mono mt-1 m-0">
            Checkout completion + payment fall-off by rail. &quot;Fall-off&quot; = orders that reached checkout on an
            instant rail (card / PayPal / crypto) but never completed payment (abandoned after 48h).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {windows.map(([v, l]) => (
            <button
              key={v}
              onClick={() => setDays(v)}
              className={`text-xs px-3 py-1.5 rounded-opp border ${
                days === v ? 'bg-ink text-paper border-ink' : 'border-line text-ink hover:bg-surfaceAlt'
              }`}
            >
              {l}
            </button>
          ))}
          <button className="btn-outline text-xs px-4 py-2" onClick={fetchData}>
            Refresh
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="text-center py-12 text-ink-mute text-sm">Loading…</div>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
            <div className="card-premium p-5">
              <div className={`font-display font-semibold tracking-display text-2xl ${completionTone(data.sitewide.completionRate)}`}>
                {fmtPct(data.sitewide.completionRate)}
              </div>
              <div className="opp-meta-mono uppercase mt-1">Overall completion</div>
              <div className="opp-meta-mono text-ink-mute mt-0.5">
                {data.sitewide.paid} paid / {data.sitewide.resolved} resolved
              </div>
            </div>
            <div className="card-premium p-5">
              <div className={`font-display font-semibold tracking-display text-2xl ${fallOffTone(data.cardRails.fallOffRate)}`}>
                {fmtPct(data.cardRails.fallOffRate)}
              </div>
              <div className="opp-meta-mono uppercase mt-1">Card / PayPal fall-off</div>
              <div className="opp-meta-mono text-ink-mute mt-0.5">
                {data.cardRails.abandoned} abandoned / {data.cardRails.resolved} attempts
              </div>
            </div>
            <Stat value={data.sitewide.abandoned} label="Total abandoned" tone={data.sitewide.abandoned > 0 ? 'warn' : 'success'} />
            <Stat value={data.sitewide.awaiting} label="In-flight (awaiting)" sub={`${data.total_orders} orders in window`} />
          </div>

          {/* By rail */}
          <div className="card-premium overflow-hidden mb-5">
            <div className="px-5 pt-4 pb-2 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">
              By rail
            </div>
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surfaceAlt">
                <tr>
                  {['Rail', 'Attempts', 'Completed', 'Abandoned', 'Awaiting', 'Pending', 'Completion', 'Fall-off'].map((h) => (
                    <th key={h} className="px-3 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RAIL_ORDER.filter((r) => data.byRail[r] && data.byRail[r].attempts > 0).map((r) => {
                  const b = data.byRail[r]
                  const manual = MANUAL_RAILS.includes(r)
                  return (
                    <tr key={r} className="border-t border-line hover:bg-surfaceAlt/50">
                      <td className="px-3 py-2 font-semibold text-ink">
                        {RAIL_LABELS[r] || r}
                        {manual && <span className="ml-1.5 opp-meta-mono text-ink-mute normal-case">(manual)</span>}
                      </td>
                      <td className="px-3 py-2">{b.attempts}</td>
                      <td className="px-3 py-2 text-success">{b.completed}</td>
                      <td className="px-3 py-2 text-danger">{b.abandoned}</td>
                      <td className="px-3 py-2 text-ink-soft">{b.awaiting}</td>
                      <td className="px-3 py-2 text-ink-soft">{b.pending}</td>
                      <td className={`px-3 py-2 font-semibold ${manual ? 'text-ink-mute' : completionTone(b.completionRate)}`}>
                        {manual ? '—' : fmtPct(b.completionRate)}
                      </td>
                      <td className={`px-3 py-2 font-semibold ${manual ? 'text-ink-mute' : fallOffTone(b.fallOffRate)}`}>
                        {manual ? '—' : fmtPct(b.fallOffRate)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* By affiliate */}
          <div className="card-premium overflow-hidden mb-5">
            <div className="px-5 pt-4 pb-2 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">
              By affiliate code
            </div>
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surfaceAlt">
                <tr>
                  {['Code', 'Orders', 'Completion', 'Card attempts', 'Card fall-off'].map((h) => (
                    <th key={h} className="px-3 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.byAffiliate.map((a) => {
                  const isTris = a.code === 'TRIS'
                  return (
                    <tr key={a.code} className={`border-t border-line hover:bg-surfaceAlt/50 ${isTris ? 'bg-accent-soft/40' : ''}`}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-ink">
                        {a.code}
                        {isTris && <span className="ml-1.5 text-[10px] text-accent-strong">★</span>}
                      </td>
                      <td className="px-3 py-2">{a.all.attempts}</td>
                      <td className={`px-3 py-2 font-semibold ${completionTone(a.all.completionRate)}`}>{fmtPct(a.all.completionRate)}</td>
                      <td className="px-3 py-2 text-ink-soft">{a.card.attempts}</td>
                      <td className={`px-3 py-2 font-semibold ${fallOffTone(a.card.fallOffRate)}`}>{fmtPct(a.card.fallOffRate)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* How to read this */}
          <div className="card-premium p-4 text-xs text-ink-soft">
            <strong className="text-ink">How to read this:</strong>
            <ul className="mt-2 mb-0 pl-4 list-disc space-y-1">
              <li><strong>Completion</strong> = paid ÷ resolved attempts (resolved = paid + abandoned; excludes still-in-flight &quot;awaiting&quot; and manual-deposit/fraud-review &quot;pending&quot;).</li>
              <li><strong>Fall-off</strong> = abandoned ÷ resolved — the &quot;people who tried to pay and didn&apos;t finish.&quot; <strong>Card / PayPal fall-off is the &quot;credit card stuff&quot;</strong> to watch before showing Tris.</li>
              <li><strong>Manual rails (Zelle / Venmo) show &quot;—&quot;</strong> for completion/fall-off — they don&apos;t auto-abandon (an unpaid one sits &quot;pending&quot;), so their fall-off isn&apos;t comparable here.</li>
              <li><strong>Caveat:</strong> &quot;abandoned&quot; conflates true card declines with customers who just closed the tab — it&apos;s &quot;didn&apos;t complete,&quot; not strictly &quot;declined.&quot;</li>
            </ul>
          </div>
        </>
      )}
    </>
  )
}

function Stat({ value, label, tone = '', sub }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div className="card-premium p-5">
      <div className={`font-display font-semibold tracking-display text-2xl ${toneClass}`}>{value}</div>
      <div className="opp-meta-mono uppercase mt-1">{label}</div>
      {sub && <div className="opp-meta-mono text-ink-mute mt-0.5">{sub}</div>}
    </div>
  )
}
