import { useEffect, useState, useMemo } from 'react'

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
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
}

const ROYALTY_STATUS_LABELS = { accruing: 'Accruing', paid: 'Paid', pending: 'Pending', not_generated: 'Not generated' }
const ROYALTY_STATUS_TONES = {
  accruing: 'bg-accent-soft text-accent-strong',
  paid: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  not_generated: 'bg-danger/10 text-danger',
}

export default function PayoutsTab({ showSaveMsg, token }) {
  const [payouts, setPayouts] = useState([])
  const [affiliates, setAffiliates] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending') // pending | paid | all
  const [typeFilter, setTypeFilter] = useState('') // override | royalty | manual | ''
  const [affiliateFilter, setAffiliateFilter] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualForm, setManualForm] = useState(emptyManualForm())
  const [royalty, setRoyalty] = useState(null)

  useEffect(() => {
    fetchAll()
  }, [statusFilter, typeFilter, affiliateFilter, periodFilter])

  function authHeaders() {
    return { 'Content-Type': 'application/json', 'x-admin-token': token || '' }
  }

  function emptyManualForm() {
    return { affiliate_id: '', payout_type: 'manual', amount: '', period: '', notes: '' }
  }

  async function fetchAll() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (affiliateFilter) params.set('affiliate_id', affiliateFilter)
      if (periodFilter) params.set('period', periodFilter)
      const [pRes, aRes, rRes] = await Promise.all([
        fetch(`/api/admin/payouts?${params.toString()}`, { headers: authHeaders() }),
        fetch('/api/admin/affiliates', { headers: authHeaders() }),
        fetch('/api/admin/royalty', { headers: authHeaders() }),
      ])
      if (pRes.ok) setPayouts(await pRes.json())
      if (aRes.ok) setAffiliates(await aRes.json())
      if (rRes.ok) setRoyalty(await rRes.json())
    } catch { /* fail */ }
    setSelected(new Set())
    setLoading(false)
  }

  async function markPaid(ids, action = 'mark_paid') {
    if (!ids.length) return
    const verb = action === 'mark_paid' ? 'Mark paid' : 'Mark unpaid'
    if (!window.confirm(`${verb} ${ids.length} payout${ids.length === 1 ? '' : 's'}?`)) return
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ ids, action }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showSaveMsg(err.error || 'Update failed')
        return
      }
      const data = await res.json()
      showSaveMsg(`${data.updated} payout${data.updated === 1 ? '' : 's'} updated.`)
      await fetchAll()
    } catch {
      showSaveMsg('Network error')
    }
  }

  async function deletePayout(id) {
    if (!window.confirm('Permanently delete this payout? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/admin/payouts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showSaveMsg(err.error || 'Delete failed')
        return
      }
      showSaveMsg('Payout deleted.')
      await fetchAll()
    } catch {
      showSaveMsg('Network error')
    }
  }

  async function createManual(e) {
    e.preventDefault()
    if (!manualForm.affiliate_id || !manualForm.amount) {
      showSaveMsg('Affiliate and amount required.')
      return
    }
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          affiliate_id: manualForm.affiliate_id,
          payout_type: manualForm.payout_type,
          amount: Number(manualForm.amount),
          period: manualForm.period || null,
          notes: manualForm.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showSaveMsg(err.error || 'Create failed')
        return
      }
      showSaveMsg('Payout created.')
      setShowManualForm(false)
      setManualForm(emptyManualForm())
      await fetchAll()
    } catch {
      showSaveMsg('Network error')
    }
  }

  function exportCSV() {
    const headers = ['Created', 'Affiliate', 'Code', 'Type', 'Period', 'Amount', 'Trigger Affiliate', 'Notes', 'Status', 'Paid At']
    const rows = payouts.map((p) => [
      fmtDate(p.created_at),
      p.affiliate?.name || '',
      p.affiliate?.code || '',
      p.payout_type,
      p.period || '',
      Number(p.amount).toFixed(2),
      p.trigger_affiliate?.code || '',
      p.notes || '',
      p.paid_at ? 'Paid' : 'Pending',
      p.paid_at ? fmtDate(p.paid_at) : '',
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payouts-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totals = useMemo(() => {
    const t = { pending: 0, paid: 0, override: 0, royalty: 0, manual: 0 }
    for (const p of payouts) {
      const amt = Number(p.amount || 0)
      if (p.paid_at) t.paid += amt
      else t.pending += amt
      t[p.payout_type] = (t[p.payout_type] || 0) + amt
    }
    return t
  }, [payouts])

  const allChecked = payouts.length > 0 && payouts.every((p) => selected.has(p.id))
  const someChecked = selected.size > 0 && !allChecked

  function toggleAll() {
    if (allChecked) setSelected(new Set())
    else setSelected(new Set(payouts.map((p) => p.id)))
  }

  function toggleOne(id) {
    const n = new Set(selected)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setSelected(n)
  }

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Payouts</h2>
          <p className="opp-meta-mono mt-1 m-0">
            Cron-driven overrides + royalties, plus any manual entries. Mark paid as you disburse.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-outline text-xs px-4 py-2" onClick={exportCSV}>Export CSV</button>
          <button className="btn-outline text-xs px-4 py-2" onClick={fetchAll}>Refresh</button>
          <button
            className="btn-primary text-xs px-4 py-2"
            onClick={() => {
              setManualForm(emptyManualForm())
              setShowManualForm(!showManualForm)
            }}
          >
            {showManualForm ? 'Cancel' : '+ Manual Payout'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-5">
        <Stat value={fmtUsd(totals.pending)} label="Pending" tone="warn" />
        <Stat value={fmtUsd(totals.paid)} label="Paid" tone="success" />
        <Stat value={fmtUsd(totals.override)} label="Overrides" />
        <Stat value={fmtUsd(totals.royalty)} label="Royalties" />
        <Stat value={fmtUsd(totals.manual)} label="Manual" />
      </div>

      {/* Royalty tracker — live current-month projection + per-period history */}
      {royalty && (
        <div className="card-premium p-5 mb-5">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h3 className="font-display font-semibold text-base m-0 text-ink">Royalty tracker</h3>
            <div className="opp-meta-mono uppercase">{royalty.pct}% of OPP gross · accrues live, paid after month-end</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-4">
            <Stat value={fmtUsd(royalty.projected.royalty)} label={`${fmtPeriod(royalty.current_period)} projected`} tone="success" />
            <Stat value={fmtUsd(royalty.projected.opp_gross)} label="OPP gross MTD" />
            <Stat value={fmtUsd(royalty.pending)} label="Pending royalty" tone="warn" />
            <Stat value={fmtUsd(royalty.lifetime_paid)} label="Lifetime paid" tone="success" />
          </div>
          {royalty.history.length > 0 && (
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surfaceAlt">
                <tr>
                  {['Period', 'OPP gross', `Royalty (${royalty.pct}%)`, 'Recipient', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {royalty.history.map((h) => (
                  <tr key={h.period} className="border-t border-line hover:bg-surfaceAlt/50">
                    <td className="px-3 py-2 font-mono">{fmtPeriod(h.period)}</td>
                    <td className="px-3 py-2">{fmtUsd(h.opp_gross)}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{fmtUsd(h.payout_amount ?? h.royalty)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{h.recipient || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROYALTY_STATUS_TONES[h.status]}`}>
                        {ROYALTY_STATUS_LABELS[h.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {royalty.history.some((h) => h.status === 'not_generated') && (
            <p className="opp-meta-mono mt-3 text-danger">
              ⚠ &quot;Not generated&quot; = a past month had revenue but no royalty payout was created by the monthly cron. Investigate / backfill that period.
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card-premium p-4 mb-5 flex flex-wrap gap-3 items-end">
        <Field label="Status">
          <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="all">All</option>
          </select>
        </Field>
        <Field label="Type">
          <select className="input-field" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="override">Override</option>
            <option value="royalty">Royalty</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        <Field label="Affiliate">
          <select className="input-field" value={affiliateFilter} onChange={(e) => setAffiliateFilter(e.target.value)}>
            <option value="">All affiliates</option>
            {affiliates.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
            ))}
          </select>
        </Field>
        <Field label="Period (YYYY-MM)">
          <input
            type="text"
            placeholder="e.g. 2026-04"
            pattern="\d{4}-\d{2}"
            className="input-field font-mono"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
          />
        </Field>
        {(typeFilter || affiliateFilter || periodFilter || statusFilter !== 'pending') && (
          <button
            className="btn-outline text-xs px-3 py-2"
            onClick={() => {
              setStatusFilter('pending')
              setTypeFilter('')
              setAffiliateFilter('')
              setPeriodFilter('')
            }}
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Manual create form */}
      {showManualForm && (
        <div className="card-premium p-6 mb-5">
          <h3 className="font-display font-semibold text-base mb-4 text-ink">Create manual payout</h3>
          <p className="opp-meta-mono text-ink-mute mb-4">
            One-off entry — corrections, off-cycle bonuses, anything not from the monthly cron. Type defaults to <code>manual</code>.
          </p>
          <form onSubmit={createManual}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
              <Field label="Affiliate *">
                <select
                  className="input-field"
                  value={manualForm.affiliate_id}
                  onChange={(e) => setManualForm({ ...manualForm, affiliate_id: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {affiliates.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select
                  className="input-field"
                  value={manualForm.payout_type}
                  onChange={(e) => setManualForm({ ...manualForm, payout_type: e.target.value })}
                >
                  <option value="manual">Manual</option>
                  <option value="override">Override</option>
                  <option value="royalty">Royalty</option>
                </select>
              </Field>
              <Field label="Amount * ($)">
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                  required
                />
              </Field>
              <Field label="Period (YYYY-MM)">
                <input
                  type="text"
                  pattern="\d{4}-\d{2}"
                  placeholder="optional"
                  className="input-field font-mono"
                  value={manualForm.period}
                  onChange={(e) => setManualForm({ ...manualForm, period: e.target.value })}
                />
              </Field>
              <Field label="Notes">
                <input
                  className="input-field"
                  value={manualForm.notes}
                  onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                  placeholder="e.g. Q1 retention bonus, correction for missed Apr override"
                />
              </Field>
            </div>
            <button type="submit" className="btn-primary">Create payout</button>
          </form>
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="card-premium p-3 mb-4 flex justify-between items-center bg-accent/5">
          <div className="opp-meta-mono uppercase">
            {selected.size} selected
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-xs px-3 py-1.5" onClick={() => markPaid(Array.from(selected), 'mark_paid')}>
              Mark Paid
            </button>
            <button className="btn-outline text-xs px-3 py-1.5" onClick={() => markPaid(Array.from(selected), 'mark_unpaid')}>
              Mark Unpaid
            </button>
            <button className="btn-outline text-xs px-3 py-1.5" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-ink-mute text-sm">Loading…</div>
        ) : payouts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[15px] text-ink-soft m-0">No payouts match your filters</p>
            <p className="opp-meta-mono mt-1 m-0">
              {statusFilter === 'pending' ? "Nothing pending. Cron runs on the 1st of each month." : 'Adjust filters above.'}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked }}
                    onChange={toggleAll}
                  />
                </th>
                {['Affiliate', 'Type', 'Period', 'Amount', 'Trigger', 'Notes', 'Status', 'Created', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-surfaceAlt/50">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-ink">{p.affiliate?.name || '—'}</div>
                    <div className="opp-meta-mono">{p.affiliate?.code}</div>
                  </td>
                  <td className="px-3 py-2 capitalize">{p.payout_type}</td>
                  <td className="px-3 py-2 font-mono">{fmtPeriod(p.period)}</td>
                  <td className="px-3 py-2 font-semibold text-warning">{fmtUsd(p.amount)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.trigger_affiliate?.code || '—'}</td>
                  <td className="px-3 py-2 text-ink-mute text-xs max-w-xs truncate" title={p.notes || ''}>{p.notes || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      p.paid_at ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                    }`}>
                      {p.paid_at ? 'Paid' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-mute whitespace-nowrap">{fmtDate(p.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5 flex-wrap">
                      {p.paid_at ? (
                        <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-ink hover:bg-surfaceAlt" onClick={() => markPaid([p.id], 'mark_unpaid')}>
                          Unpay
                        </button>
                      ) : (
                        <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-success hover:bg-surfaceAlt" onClick={() => markPaid([p.id], 'mark_paid')}>
                          Pay
                        </button>
                      )}
                      <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-danger hover:bg-surfaceAlt" onClick={() => deletePayout(p.id)}>
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function Stat({ value, label, tone = '' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-ink'
  return (
    <div className="card-premium p-5">
      <div className={`font-display font-semibold tracking-display text-2xl ${toneClass}`}>{value}</div>
      <div className="opp-meta-mono uppercase mt-1">{label}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">{label}</span>
      {children}
    </label>
  )
}
