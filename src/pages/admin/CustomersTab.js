import { useState } from 'react';

// Customer lookup + per-account VIP discount. Search by email, set a permanent
// discount % that applies ONLY when that customer is logged in at checkout
// (so it can't be shared as a code). Set 0 to clear.
export default function CustomersTab({ token, showSaveMsg }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [drafts, setDrafts] = useState({}); // id -> pct string being edited
  const [savingId, setSavingId] = useState(null);

  function authHeaders() {
    return { 'Content-Type': 'application/json', 'x-admin-token': token || '' };
  }
  function msg(m) { if (typeof showSaveMsg === 'function') showSaveMsg(m); }

  async function search(e) {
    if (e) e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders() });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setRows(d.customers || []);
        setDrafts(Object.fromEntries((d.customers || []).map((c) => [c.id, String(c.discount_pct ?? 0)])));
      } else { msg(d.error || 'Search failed'); }
    } catch { msg('Search failed'); }
    setLoading(false);
  }

  async function verifyCustomer(c) {
    setSavingId(c.id);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ id: c.id, verify: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { msg(d.error || 'Verify failed'); setSavingId(null); return; }
      msg(d.message || 'Verified');
      setRows((rs) => rs.map((r) => (r.id === c.id ? { ...r, email_verified: true } : r)));
    } catch { msg('Verify failed'); }
    setSavingId(null);
  }

  async function setDiscount(c) {
    const pct = Number(drafts[c.id]);
    if (!Number.isFinite(pct) || pct < 0 || pct > 90) { msg('Discount must be 0–90.'); return; }
    setSavingId(c.id);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ id: c.id, discountPct: pct }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { msg(d.error || 'Save failed'); setSavingId(null); return; }
      msg(d.message || 'Saved');
      setRows((rs) => rs.map((r) => (r.id === c.id ? { ...r, discount_pct: d.customer.discount_pct } : r)));
    } catch { msg('Save failed'); }
    setSavingId(null);
  }

  return (
    <div className="max-w-3xl">
      <h2 className="font-display font-semibold text-xl text-ink m-0 mb-1">Customers</h2>
      <p className="text-[13px] text-ink-soft m-0 mb-5">
        Look up a customer and set a permanent per-account discount. It applies only when they&rsquo;re
        <strong className="text-ink"> logged into their verified account</strong> at checkout — no code, so it can&rsquo;t be shared. Set 0 to clear.
      </p>

      <form onSubmit={search} className="flex gap-2 mb-5">
        <input
          className="input-field flex-1" placeholder="Search by email…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn-primary text-xs px-5 py-2" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searched && !loading && rows.length === 0 && (
        <p className="text-[13px] text-ink-mute">No customers match that email. (They need a registered account for a discount to apply.)</p>
      )}

      {rows.length > 0 && (
        <div className="border border-line rounded-opp overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-surfaceAlt text-ink-mute">
              <tr>
                <th className="font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 text-left">Email</th>
                <th className="font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 text-center">Verified</th>
                <th className="font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 text-center">Discount %</th>
                <th className="font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-2.5 text-ink font-mono text-[12px] truncate max-w-[280px]">
                    {c.email}
                    {Number(c.discount_pct) > 0 && <span className="ml-2 text-[10px] font-semibold text-accent-strong">VIP {c.discount_pct}%</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {c.email_verified
                      ? <span className="text-success font-semibold">✓</span>
                      : (
                        <button
                          className="text-[11px] px-2.5 py-1 rounded-opp border border-warning bg-warning text-surface hover:bg-warning/90 font-semibold"
                          disabled={savingId === c.id}
                          onClick={() => verifyCustomer(c)}
                          title="Manually verify this account (unlocks order history; doesn't affect purchasing)."
                        >
                          {savingId === c.id ? '…' : 'Verify'}
                        </button>
                      )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="number" min="0" max="90" step="1"
                      className="input-field w-20 text-center"
                      value={drafts[c.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      className="btn-outline text-xs px-4 py-1.5" disabled={savingId === c.id}
                      onClick={() => setDiscount(c)}
                    >
                      {savingId === c.id ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
