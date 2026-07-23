import { useEffect, useState, useCallback } from 'react';

// Researcher-access request queue — approve/deny applications (backup to, and
// history for, the email one-tap). Approve adds the email to the gated
// allowlist + emails the applicant; deny just records the decision.
export default function AccessRequestsTab({ token, showSaveMsg }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const authHeaders = useCallback(() => ({ 'Content-Type': 'application/json', 'x-admin-token': token || '' }), [token]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/research-access', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRows(data.requests || []);
      else showSaveMsg?.(`Could not load requests: ${data.error || res.status}`);
    } catch (e) {
      showSaveMsg?.(`Could not load requests: ${e.message}`);
    }
    setLoading(false);
  }, [authHeaders, showSaveMsg]);

  useEffect(() => { load(); }, [load]);

  async function decide(row, action) {
    if (busyId) return;
    if (action === 'deny' && !window.confirm(`Deny access for ${row.email}?`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/research-access', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ id: row.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: data.status } : r)));
        showSaveMsg?.(action === 'approve' ? `Approved ${row.email} — allowlisted + emailed.` : `Denied ${row.email}.`);
      } else {
        showSaveMsg?.(`Failed: ${data.error || res.status}`);
      }
    } catch (e) {
      showSaveMsg?.(`Failed: ${e.message}`);
    }
    setBusyId(null);
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending');

  const badge = (s) => s === 'approved'
    ? 'bg-success/15 text-success border-success/30'
    : s === 'denied' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-warning/10 text-warning border-warning/30';

  const Card = ({ r, actions }) => (
    <div className="border border-line rounded-opp p-4 bg-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-ink">{r.name || '—'} <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge(r.status)}`}>{r.status}</span></div>
          <div className="text-[13px] text-ink-soft font-mono">{r.email}</div>
          <div className="opp-meta-mono text-ink-mute mt-1">{r.institution || '—'}{r.role ? ` · ${r.role}` : ''}</div>
          {r.intended_use && <div className="text-[13px] text-ink-soft mt-2 leading-relaxed">{r.intended_use}</div>}
        </div>
        {actions}
      </div>
    </div>
  );

  if (loading) return <div className="text-ink-soft text-sm py-8">Loading requests…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="opp-eyebrow mb-3">Pending ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="text-ink-mute text-sm">No pending applications.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((r) => (
              <Card key={r.id} r={r} actions={
                <div className="flex flex-col gap-2 shrink-0">
                  <button disabled={busyId === r.id} onClick={() => decide(r, 'approve')}
                    className="btn-primary text-xs px-4 py-2 disabled:opacity-40">{busyId === r.id ? '…' : 'Approve'}</button>
                  <button disabled={busyId === r.id} onClick={() => decide(r, 'deny')}
                    className="text-xs px-4 py-2 rounded-opp border border-line text-ink-soft hover:text-danger hover:border-danger/40 disabled:opacity-40">Deny</button>
                </div>
              } />
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div>
          <div className="opp-eyebrow mb-3">History ({decided.length})</div>
          <div className="flex flex-col gap-3 opacity-80">
            {decided.map((r) => <Card key={r.id} r={r} actions={null} />)}
          </div>
        </div>
      )}
    </div>
  );
}
