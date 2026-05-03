import { useEffect, useState, useCallback } from 'react'

const STATUS_LABELS = {
  new: 'New',
  auto_replied: 'Auto-replied',
  draft_pending: 'Draft pending',
  sent: 'Sent',
  archived: 'Archived',
  spam: 'Spam',
  escalated: 'Escalated',
}
const STATUS_TONES = {
  new: 'bg-warning/10 text-warning border-warning/30',
  auto_replied: 'bg-success/10 text-success border-success/30',
  draft_pending: 'bg-accent-soft text-accent-strong border-accent/30',
  sent: 'bg-ink/10 text-ink border-ink/30',
  archived: 'bg-ink/10 text-ink-mute border-ink/30',
  spam: 'bg-danger/10 text-danger border-danger/30',
  escalated: 'bg-danger/20 text-danger border-danger/30 font-bold',
}
const CLASSIFICATION_LABELS = {
  order_status: 'Order status',
  tracking: 'Tracking',
  refund_request: 'Refund request',
  partnership: 'Partnership',
  legal_compliance: 'Legal / compliance',
  spam: 'Spam',
  other: 'Other',
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function InboxTab({ showSaveMsg, token }) {
  const [list, setList] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('draft_pending')
  const [selected, setSelected] = useState(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [busy, setBusy] = useState(false)

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-token': token || '',
  }), [token])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/admin/inbox?${params.toString()}`, { headers: authHeaders() }),
        fetch('/api/admin/inbox?stats=1', { headers: authHeaders() }),
      ])
      if (listRes.ok) setList(await listRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
    } catch { /* fail */ }
    setLoading(false)
  }, [authHeaders, statusFilter])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function openDetail(item) {
    try {
      const res = await fetch(`/api/admin/inbox?id=${encodeURIComponent(item.id)}`, { headers: authHeaders() })
      if (!res.ok) return
      const detail = await res.json()
      setSelected(detail)
      setEditSubject(detail.reply_subject || `Re: ${detail.subject || ''}`)
      setEditBody(detail.reply_body || '')
    } catch { /* fail */ }
  }

  async function sendReply() {
    if (!selected) return
    if (!editBody.trim()) {
      showSaveMsg('Reply body required.')
      return
    }
    if (!window.confirm(`Send this reply to ${selected.from_email}?`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/inbox', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          id: selected.id,
          action: 'send',
          reply_subject: editSubject,
          reply_body: editBody,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showSaveMsg(err.error || 'Send failed')
        setBusy(false)
        return
      }
      showSaveMsg('Reply sent.')
      setSelected(null)
      await fetchAll()
    } catch {
      showSaveMsg('Network error')
    }
    setBusy(false)
  }

  async function updateStatus(id, status) {
    try {
      const res = await fetch('/api/admin/inbox', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showSaveMsg(err.error || 'Update failed')
        return
      }
      if (selected?.id === id) setSelected({ ...selected, status })
      await fetchAll()
    } catch {
      showSaveMsg('Network error')
    }
  }

  async function deleteEmail(id) {
    if (!window.confirm('Permanently delete this email and any draft? Cannot be undone.')) return
    try {
      await fetch(`/api/admin/inbox?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (selected?.id === id) setSelected(null)
      await fetchAll()
    } catch { /* fail */ }
  }

  const stat = (key) => stats?.byStatus?.[key] || 0

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Inbox</h2>
          <p className="opp-meta-mono mt-1 m-0">
            Customer emails forwarded by Workspace. Bot triages and drafts replies; you review and send.
          </p>
        </div>
        <button className="btn-outline text-xs px-4 py-2" onClick={fetchAll}>Refresh</button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3.5 mb-5">
          <Stat value={stat('new')} label="New" tone={stat('new') > 0 ? 'warn' : ''} />
          <Stat value={stat('draft_pending')} label="Drafts" tone={stat('draft_pending') > 0 ? 'warn' : ''} />
          <Stat value={stat('escalated')} label="Escalated" tone={stat('escalated') > 0 ? 'danger' : ''} />
          <Stat value={stat('auto_replied')} label="Auto-replied" tone="success" />
          <Stat value={stat('sent')} label="Sent" />
          <Stat value={stat('archived')} label="Archived" />
          <Stat value={stat('spam')} label="Spam" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['draft_pending', 'escalated', 'new', 'auto_replied', 'sent', 'archived', 'spam', 'all'].map((k) => (
          <button
            key={k}
            onClick={() => setStatusFilter(k)}
            className={`text-xs px-3 py-1.5 rounded-opp border ${
              statusFilter === k ? 'bg-ink text-paper border-ink' : 'border-line text-ink hover:bg-surfaceAlt'
            }`}
          >
            {k === 'all' ? 'All' : STATUS_LABELS[k] || k}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
        {/* List */}
        <div className="card-premium overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-ink-mute text-sm">Loading…</div>
          ) : list.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[15px] text-ink-soft m-0">No emails match this filter</p>
              <p className="opp-meta-mono mt-1 m-0">
                {statusFilter === 'draft_pending' ? 'No drafts pending review.' : 'Try a different filter or wait for inbound.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line max-h-[70vh] overflow-y-auto">
              {list.map((e) => (
                <button
                  key={e.id}
                  onClick={() => openDetail(e)}
                  className={`w-full text-left p-3 hover:bg-surfaceAlt/50 ${selected?.id === e.id ? 'bg-surfaceAlt' : ''}`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <div className="font-semibold text-ink truncate text-sm">{e.from_name || e.from_email}</div>
                    <div className="opp-meta-mono text-ink-mute whitespace-nowrap text-xs">{fmtDate(e.created_at)}</div>
                  </div>
                  <div className="text-sm text-ink-soft truncate mb-1">{e.subject || '(no subject)'}</div>
                  <div className="flex gap-1.5 items-center flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_TONES[e.status] || 'bg-ink/10 text-ink'}`}>
                      {STATUS_LABELS[e.status] || e.status}
                    </span>
                    {e.classification && (
                      <span className="text-[10px] text-ink-mute font-mono">
                        {CLASSIFICATION_LABELS[e.classification] || e.classification}
                      </span>
                    )}
                    {e.related_order_number && (
                      <span className="text-[10px] text-accent-strong font-mono">#{e.related_order_number}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        {selected ? (
          <div className="card-premium p-5 max-h-[70vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display font-semibold text-base text-ink">{selected.from_name || selected.from_email}</div>
                <div className="opp-meta-mono">{selected.from_email}</div>
                <div className="opp-meta-mono text-ink-mute mt-1">{fmtDate(selected.created_at)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_TONES[selected.status] || ''}`}>
                  {STATUS_LABELS[selected.status] || selected.status}
                </span>
                {selected.classification && (
                  <span className="opp-meta-mono text-ink-mute">
                    {CLASSIFICATION_LABELS[selected.classification] || selected.classification}
                  </span>
                )}
                {selected.related_order_number && (
                  <span className="opp-meta-mono text-accent-strong">Order #{selected.related_order_number}</span>
                )}
              </div>
            </div>

            <div className="border-t border-line pt-3 mb-4">
              <div className="opp-meta-mono uppercase mb-1">Subject</div>
              <div className="text-sm text-ink mb-3">{selected.subject || '(no subject)'}</div>
              <div className="opp-meta-mono uppercase mb-1">Body</div>
              <pre className="text-xs text-ink-soft whitespace-pre-wrap font-sans bg-surfaceAlt p-3 rounded-opp max-h-60 overflow-y-auto">
                {selected.body_text || '(no body)'}
              </pre>
            </div>

            {selected.classification_reason && (
              <div className="bg-accent-soft/30 border border-accent/20 rounded-opp p-3 mb-4">
                <div className="opp-meta-mono uppercase mb-1 text-accent-strong">Bot reasoning</div>
                <div className="text-xs text-ink">{selected.classification_reason}</div>
              </div>
            )}

            {/* Reply editor — shown for any non-final status */}
            {!['sent', 'archived', 'spam'].includes(selected.status) && (
              <div className="border-t border-line pt-4">
                <div className="opp-meta-mono uppercase mb-2">
                  {selected.reply_body ? 'Drafted reply (edit + send)' : 'Compose reply'}
                </div>
                <input
                  className="input-field font-mono text-sm mb-2"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Subject"
                />
                <textarea
                  className="input-field text-sm w-full min-h-[180px] font-sans"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Reply body…"
                />
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button className="btn-primary text-xs px-4 py-2" onClick={sendReply} disabled={busy}>
                    {busy ? 'Sending…' : `Send to ${selected.from_email}`}
                  </button>
                  <button className="btn-outline text-xs px-3 py-2" onClick={() => updateStatus(selected.id, 'archived')}>
                    Archive
                  </button>
                  <button className="btn-outline text-xs px-3 py-2" onClick={() => updateStatus(selected.id, 'escalated')}>
                    Escalate
                  </button>
                  <button className="btn-outline text-xs px-3 py-2" onClick={() => updateStatus(selected.id, 'spam')}>
                    Mark spam
                  </button>
                  <button className="text-xs px-3 py-2 text-danger hover:underline ml-auto" onClick={() => deleteEmail(selected.id)}>
                    Delete
                  </button>
                </div>
              </div>
            )}

            {/* Sent — show what went out */}
            {selected.status === 'sent' && selected.reply_body && (
              <div className="border-t border-line pt-4">
                <div className="opp-meta-mono uppercase mb-2">Sent reply</div>
                <div className="text-sm text-ink mb-2">{selected.reply_subject}</div>
                <pre className="text-xs text-ink-soft whitespace-pre-wrap font-sans bg-surfaceAlt p-3 rounded-opp">
                  {selected.reply_body}
                </pre>
                <div className="opp-meta-mono text-ink-mute mt-2">
                  Sent {fmtDate(selected.reply_sent_at)}
                  {selected.reply_edited_by_admin && ' · admin-edited before send'}
                </div>
              </div>
            )}

            {/* Auto-replied — show what bot sent */}
            {selected.status === 'auto_replied' && selected.reply_body && (
              <div className="border-t border-line pt-4">
                <div className="opp-meta-mono uppercase mb-2 text-success">Auto-reply sent by bot</div>
                <div className="text-sm text-ink mb-2">{selected.reply_subject}</div>
                <pre className="text-xs text-ink-soft whitespace-pre-wrap font-sans bg-surfaceAlt p-3 rounded-opp">
                  {selected.reply_body}
                </pre>
                <div className="opp-meta-mono text-ink-mute mt-2">Sent {fmtDate(selected.reply_sent_at)}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="card-premium p-12 text-center text-ink-mute text-sm">
            Select an email to view details + draft.
          </div>
        )}
      </div>
    </>
  )
}

function Stat({ value, label, tone = '' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div className="card-premium p-4">
      <div className={`font-display font-semibold tracking-display text-2xl ${toneClass}`}>{value}</div>
      <div className="opp-meta-mono uppercase mt-1 text-xs">{label}</div>
    </div>
  )
}
