import { useEffect, useState } from 'react'

const REASON_LABELS = {
  fraud: 'Fraud',
  not_received: 'Not received',
  not_as_described: 'Not as described',
  duplicate: 'Duplicate',
  technical: 'Technical',
  other: 'Other',
}
const STATUS_LABELS = {
  open: 'Open',
  responded: 'Responded',
  won: 'Won',
  lost: 'Lost',
  withdrawn: 'Withdrawn',
}
const STATUS_TONES = {
  open: 'bg-warning/10 text-warning border-warning/30',
  responded: 'bg-accent-soft text-accent-strong border-accent/30',
  won: 'bg-success/10 text-success border-success/30',
  lost: 'bg-danger/10 text-danger border-danger/30',
  withdrawn: 'bg-ink/10 text-ink border-ink/30',
}

function fmtUsd(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtPct(n) {
  return `${(Number(n || 0) * 100).toFixed(2)}%`
}
function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function ratioTone(ratio) {
  if (ratio >= 0.01) return 'text-danger'      // ≥1.0% → MATCH territory
  if (ratio >= 0.0075) return 'text-danger'    // ≥0.75% → emergency
  if (ratio >= 0.005) return 'text-warning'    // ≥0.5% → operational ceiling
  return 'text-success'
}

export default function ChargebacksTab({ showSaveMsg, token }) {
  const [list, setList] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())

  useEffect(() => {
    fetchAll()
  }, [statusFilter])

  function authHeaders() {
    return { 'Content-Type': 'application/json', 'x-admin-token': token || '' }
  }

  function emptyForm() {
    return {
      order_number: '',
      reason_category: 'fraud',
      network_reason_code: '',
      amount: '',
      processor: 'bankful',
      processor_case_id: '',
      response_due_at: '',
      customer_email: '',
      notes: '',
    }
  }

  async function fetchAll() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/admin/chargebacks?${params.toString()}`, { headers: authHeaders() }),
        fetch('/api/admin/chargebacks?stats=1', { headers: authHeaders() }),
      ])
      if (listRes.ok) setList(await listRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
    } catch { /* fail */ }
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount) {
      showSaveMsg('Amount required.')
      return
    }
    const body = { ...form, amount: Number(form.amount) }
    if (!body.response_due_at) delete body.response_due_at
    const method = editingId ? 'PATCH' : 'POST'
    if (editingId) body.id = editingId

    try {
      const res = await fetch('/api/admin/chargebacks', {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showSaveMsg(err.error || 'Save failed')
        return
      }
      showSaveMsg(editingId ? 'Chargeback updated.' : 'Chargeback recorded.')
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      await fetchAll()
    } catch {
      showSaveMsg('Network error')
    }
  }

  async function updateStatus(id, status) {
    try {
      const res = await fetch('/api/admin/chargebacks', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showSaveMsg(err.error || 'Update failed')
        return
      }
      await fetchAll()
    } catch {
      showSaveMsg('Network error')
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this chargeback record? Use sparingly — usually you want to mark withdrawn instead.')) return
    try {
      await fetch(`/api/admin/chargebacks?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      await fetchAll()
    } catch { /* fail */ }
  }

  function startEdit(cb) {
    setForm({
      order_number: cb.order_number || '',
      reason_category: cb.reason_category,
      network_reason_code: cb.network_reason_code || '',
      amount: cb.amount,
      processor: cb.processor,
      processor_case_id: cb.processor_case_id || '',
      response_due_at: cb.response_due_at ? cb.response_due_at.slice(0, 10) : '',
      customer_email: cb.customer_email || '',
      notes: cb.notes || '',
    })
    setEditingId(cb.id)
    setShowForm(true)
  }

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Chargebacks</h2>
          <p className="opp-meta-mono mt-1 m-0">
            Track every dispute. Stay below 0.5% to avoid Visa/MC monitoring; 1%+ is MATCH-list territory.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-outline text-xs px-4 py-2" onClick={fetchAll}>Refresh</button>
          <button
            className="btn-primary text-xs px-4 py-2"
            onClick={() => {
              setEditingId(null)
              setForm(emptyForm())
              setShowForm(!showForm)
            }}
          >
            {showForm ? 'Cancel' : '+ Record Chargeback'}
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-5">
          <div className="card-premium p-5">
            <div className={`font-display font-semibold tracking-display text-2xl ${ratioTone(stats.month.ratio)}`}>
              {fmtPct(stats.month.ratio)}
            </div>
            <div className="opp-meta-mono uppercase mt-1">MTD ratio</div>
            <div className="opp-meta-mono text-ink-mute mt-0.5">{stats.month.chargebacks} cb / {stats.month.orders} orders</div>
          </div>
          <div className="card-premium p-5">
            <div className={`font-display font-semibold tracking-display text-2xl ${ratioTone(stats.trailing_90d.ratio)}`}>
              {fmtPct(stats.trailing_90d.ratio)}
            </div>
            <div className="opp-meta-mono uppercase mt-1">Trailing 90d</div>
            <div className="opp-meta-mono text-ink-mute mt-0.5">{stats.trailing_90d.chargebacks} cb / {stats.trailing_90d.orders} orders</div>
          </div>
          <Stat value={stats.open} label="Open" tone="warn" />
          <Stat value={stats.response_due_soon} label="Due in &lt; 3 days" tone={stats.response_due_soon > 0 ? 'warn' : ''} />
          <Stat value={stats.response_overdue} label="Overdue" tone={stats.response_overdue > 0 ? 'danger' : 'success'} />
        </div>
      )}

      {/* Threshold cheatsheet */}
      <div className="card-premium p-4 mb-5 text-xs text-ink-soft">
        <strong className="text-ink">Threshold cheat-sheet:</strong>{' '}
        <span className="text-success">&lt;0.5% target ceiling</span> ·{' '}
        <span className="text-warning">0.5–0.75% review</span> ·{' '}
        <span className="text-warning">0.75–0.9% pre-monitoring</span> ·{' '}
        <span className="text-danger">0.9% Visa VDMP</span> ·{' '}
        <span className="text-danger">1.5% Mastercard ECP</span> ·{' '}
        <span className="text-danger">2%+ MATCH-list risk</span>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card-premium p-6 mb-5">
          <h3 className="font-display font-semibold text-base mb-4 text-ink">
            {editingId ? 'Edit chargeback' : 'Record new chargeback'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
              <Field label="Order # (if known)">
                <input className="input-field font-mono" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} placeholder="OP-..." />
              </Field>
              <Field label="Reason category *">
                <select className="input-field" value={form.reason_category} onChange={(e) => setForm({ ...form, reason_category: e.target.value })} required>
                  {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Network reason code (e.g. 10.4)">
                <input className="input-field font-mono" value={form.network_reason_code} onChange={(e) => setForm({ ...form, network_reason_code: e.target.value })} />
              </Field>
              <Field label="Amount * ($)">
                <input type="number" step="0.01" className="input-field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </Field>
              <Field label="Processor">
                <select className="input-field" value={form.processor} onChange={(e) => setForm({ ...form, processor: e.target.value })}>
                  <option value="bankful">Bankful</option>
                  <option value="elite">Elite</option>
                  <option value="moonpay">MoonPay</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Processor case ID">
                <input className="input-field font-mono" value={form.processor_case_id} onChange={(e) => setForm({ ...form, processor_case_id: e.target.value })} />
              </Field>
              <Field label="Response due">
                <input type="date" className="input-field" value={form.response_due_at} onChange={(e) => setForm({ ...form, response_due_at: e.target.value })} />
              </Field>
              <Field label="Customer email">
                <input type="email" className="input-field" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
              </Field>
              <Field label="Notes">
                <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
            <button type="submit" className="btn-primary">{editingId ? 'Update' : 'Record'}</button>
          </form>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setStatusFilter('')} className={`text-xs px-3 py-1.5 rounded-opp border ${!statusFilter ? 'bg-ink text-paper border-ink' : 'border-line text-ink hover:bg-surfaceAlt'}`}>All</button>
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setStatusFilter(k)}
            className={`text-xs px-3 py-1.5 rounded-opp border ${statusFilter === k ? 'bg-ink text-paper border-ink' : 'border-line text-ink hover:bg-surfaceAlt'}`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-ink-mute text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[15px] text-ink-soft m-0">No chargebacks recorded</p>
            <p className="opp-meta-mono mt-1 m-0">That&apos;s the goal. Keep it that way.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                {['Filed', 'Order', 'Reason', 'Code', 'Amount', 'Processor', 'Status', 'Due', 'Actions'].map((h) => (
                  <th key={h} className="px-3 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((cb) => (
                <tr key={cb.id} className="border-t border-line hover:bg-surfaceAlt/50">
                  <td className="px-3 py-2 text-xs text-ink-mute whitespace-nowrap">{fmtDate(cb.filed_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{cb.order_number || '—'}</td>
                  <td className="px-3 py-2">{REASON_LABELS[cb.reason_category] || cb.reason_category}</td>
                  <td className="px-3 py-2 font-mono text-xs">{cb.network_reason_code || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-warning">{fmtUsd(cb.amount)}</td>
                  <td className="px-3 py-2 capitalize">{cb.processor}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_TONES[cb.status]}`}>
                      {STATUS_LABELS[cb.status] || cb.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {cb.response_due_at ? (
                      <span className={new Date(cb.response_due_at) < new Date() && cb.status === 'open' ? 'text-danger font-semibold' : 'text-ink-soft'}>
                        {fmtDate(cb.response_due_at)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5 flex-wrap">
                      <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-accent-strong hover:bg-surfaceAlt" onClick={() => startEdit(cb)}>Edit</button>
                      {cb.status === 'open' && (
                        <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-ink hover:bg-surfaceAlt" onClick={() => updateStatus(cb.id, 'responded')}>Responded</button>
                      )}
                      {['open', 'responded'].includes(cb.status) && (
                        <>
                          <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-success hover:bg-surfaceAlt" onClick={() => updateStatus(cb.id, 'won')}>Won</button>
                          <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-danger hover:bg-surfaceAlt" onClick={() => updateStatus(cb.id, 'lost')}>Lost</button>
                        </>
                      )}
                      <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-danger hover:bg-surfaceAlt" onClick={() => handleDelete(cb.id)}>Del</button>
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
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-ink'
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
