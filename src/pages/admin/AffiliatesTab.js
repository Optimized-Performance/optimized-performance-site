import { useEffect, useState } from 'react';

export default function AffiliatesTab({ showSaveMsg, token }) {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [passwordModal, setPasswordModal] = useState(null); // { affiliate, password, login_url } | null

  useEffect(() => {
    fetchAffiliates();
  }, []);

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
    };
  }

  async function fetchAffiliates() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/affiliates', { headers: authHeaders() });
      if (res.ok) setAffiliates(await res.json());
    } catch { /* fail */ }
    setLoading(false);
  }

  function emptyForm() {
    return { name: '', email: '', code: '', discountPct: 10, commissionPct: 5, active: true, notes: '', parentAffiliateId: '', isFlatRate: false, recruiterOverridePct: 0 };
  }

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const code = form.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return;
    const body = { ...form, code };
    const method = editingId ? 'PATCH' : 'POST';
    if (editingId) body.id = editingId;

    try {
      const res = await fetch('/api/admin/affiliates', { method, headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        showSaveMsg(err.error || 'Save failed');
        return;
      }
      await fetchAffiliates();
      resetForm();
      setShowForm(false);
      showSaveMsg(editingId ? 'Affiliate updated.' : 'Affiliate created.');
    } catch {
      showSaveMsg('Save failed');
    }
  }

  function handleEdit(aff) {
    setForm({
      name: aff.name,
      email: aff.email,
      code: aff.code,
      discountPct: aff.discount_pct,
      commissionPct: aff.commission_pct,
      active: aff.active,
      notes: aff.notes || '',
      parentAffiliateId: aff.parent_affiliate_id || '',
      isFlatRate: aff.is_flat_rate || false,
      recruiterOverridePct: aff.recruiter_override_pct || 0,
    });
    setEditingId(aff.id);
    setShowForm(true);
  }

  async function toggleActive(aff) {
    try {
      await fetch('/api/admin/affiliates', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: aff.id, active: !aff.active }),
      });
      await fetchAffiliates();
    } catch { /* fail */ }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this affiliate?')) return;
    try {
      await fetch('/api/admin/affiliates', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
      await fetchAffiliates();
    } catch { /* fail */ }
  }

  async function handleSetPassword(aff) {
    const isReset = !!aff.login_password_hash;
    const verb = isReset ? 'Reset' : 'Set';
    if (!window.confirm(`${verb} login password for ${aff.name}? This will ${isReset ? 'invalidate the current password and ' : ''}generate a new one.`)) return;
    try {
      const res = await fetch('/api/admin/affiliate-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: aff.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showSaveMsg(err.error || 'Failed to set password');
        return;
      }
      const data = await res.json();
      setPasswordModal(data);
      await fetchAffiliates();
    } catch {
      showSaveMsg('Network error setting password');
    }
  }

  function copyToClipboard(s) {
    navigator.clipboard.writeText(s).then(() => showSaveMsg('Copied to clipboard'));
  }

  function exportCSV() {
    const headers = ['Name', 'Email', 'Code', 'Discount %', 'Commission %', 'Active', 'Total Sales', 'Total Revenue', 'Total Commission', 'Created'];
    const rows = affiliates.map((a) => [
      a.name, a.email, a.code, a.discount_pct, a.commission_pct, a.active ? 'Yes' : 'No',
      a.total_sales || 0, Number(a.total_revenue || 0).toFixed(2), Number(a.total_commission || 0).toFixed(2),
      new Date(a.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliates-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalRevenue = affiliates.reduce((s, a) => s + Number(a.total_revenue || 0), 0);
  const totalCommOwed = affiliates.reduce((s, a) => s + Number(a.total_commission || 0), 0);
  const totalSales = affiliates.reduce((s, a) => s + (a.total_sales || 0), 0);

  return (
    <>
      {passwordModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="card-premium p-6 max-w-md w-full">
            <h3 className="font-display font-semibold text-lg text-ink mb-2">Login credentials</h3>
            <p className="text-sm text-ink-soft mb-4">
              Show this to <strong>{passwordModal.affiliate.name}</strong> ({passwordModal.affiliate.email}) once. Closing this dialog without copying = generate a new one.
            </p>
            <div className="bg-surfaceAlt rounded-opp p-4 mb-4 space-y-3">
              <div>
                <div className="opp-meta-mono uppercase mb-1">Email (username)</div>
                <div className="flex gap-2 items-center">
                  <code className="font-mono text-sm flex-1 truncate">{passwordModal.affiliate.email}</code>
                  <button className="text-[11px] btn-outline px-2 py-1" onClick={() => copyToClipboard(passwordModal.affiliate.email)}>Copy</button>
                </div>
              </div>
              <div>
                <div className="opp-meta-mono uppercase mb-1">Password</div>
                <div className="flex gap-2 items-center">
                  <code className="font-mono text-base font-bold text-accent-strong flex-1">{passwordModal.password}</code>
                  <button className="text-[11px] btn-outline px-2 py-1" onClick={() => copyToClipboard(passwordModal.password)}>Copy</button>
                </div>
              </div>
              <div>
                <div className="opp-meta-mono uppercase mb-1">Login URL</div>
                <div className="flex gap-2 items-center">
                  <code className="font-mono text-xs flex-1 truncate">{passwordModal.login_url}</code>
                  <button className="text-[11px] btn-outline px-2 py-1" onClick={() => copyToClipboard(passwordModal.login_url)}>Copy</button>
                </div>
              </div>
            </div>
            <button
              className="btn-primary w-full"
              onClick={() => copyToClipboard(`Login at ${passwordModal.login_url}\nEmail: ${passwordModal.affiliate.email}\nPassword: ${passwordModal.password}`)}
            >
              Copy all (paste-ready handoff)
            </button>
            <button className="btn-outline w-full mt-2" onClick={() => setPasswordModal(null)}>Close</button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Affiliates</h2>
          <p className="opp-meta-mono mt-1 m-0">Manage affiliate codes, commissions, and performance.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline text-xs px-4 py-2" onClick={exportCSV}>Export CSV</button>
          <button
            className="btn-primary text-xs px-4 py-2"
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
          >
            {showForm ? 'Cancel' : '+ New Affiliate'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-5">
        <Stat value={affiliates.length} label="Affiliates" />
        <Stat value={affiliates.filter((a) => a.active).length} label="Active" />
        <Stat value={totalSales} label="Total Sales" />
        <Stat value={`$${totalRevenue.toFixed(2)}`} label="Revenue Generated" tone="success" />
        <Stat value={`$${totalCommOwed.toFixed(2)}`} label="Commission Owed" tone="warn" />
      </div>

      {showForm && (
        <div className="card-premium p-6 mb-5">
          <h3 className="font-display font-semibold text-base mb-4 text-ink">
            {editingId ? 'Edit Affiliate' : 'Create Affiliate'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
              <Field label="Affiliate Name"><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
              <Field label="Email"><input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
              <Field label="Promo Code">
                <input className="input-field uppercase font-mono font-semibold" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. MATT10" required />
              </Field>
              <Field label="Customer Discount %"><input type="number" step="0.5" min="0" max="50" className="input-field" value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} /></Field>
              <Field label="Affiliate Commission %"><input type="number" step="0.5" min="0" max="50" className="input-field" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} /></Field>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 opp-meta-mono uppercase cursor-pointer m-0">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  Active
                </label>
              </div>
              <Field label="Notes"><input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>
            </div>

            {/* Network / recruiter setup — replaces the manual Supabase SQL */}
            <div className="border-t border-line pt-4 mb-2">
              <p className="opp-meta-mono uppercase text-ink-mute mb-3">Network (recruiter / recruit setup)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <Field label="Recruiter (parent)">
                  <select className="input-field" value={form.parentAffiliateId} onChange={(e) => setForm({ ...form, parentAffiliateId: e.target.value })}>
                    <option value="">None (direct affiliate)</option>
                    {affiliates.filter((a) => a.id !== editingId).map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Recruiter override % (if they recruit)">
                  <input type="number" step="0.5" min="0" max="50" className="input-field" value={form.recruiterOverridePct} onChange={(e) => setForm({ ...form, recruiterOverridePct: e.target.value })} />
                </Field>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 opp-meta-mono uppercase cursor-pointer m-0">
                    <input type="checkbox" checked={form.isFlatRate} onChange={(e) => setForm({ ...form, isFlatRate: e.target.checked })} />
                    Flat rate (lock — no tier ratchet)
                  </label>
                </div>
              </div>
            </div>

            {form.parentAffiliateId && !form.isFlatRate && (
              <p className="text-warning text-[13px] mb-4">
                ⚠ Recruit selected but <strong>not flat-rate</strong>: the monthly cron will <strong>subtract the recruiter&apos;s override from this affiliate&apos;s rate</strong> (clawing it down). For the additive model — recruit keeps their full rate, recruiter earns the override on top — turn ON &quot;Flat rate&quot;.
              </p>
            )}

            <button type="submit" className="btn-primary">{editingId ? 'Update Affiliate' : 'Create Affiliate'}</button>
          </form>
        </div>
      )}

      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="text-center py-12"><p className="text-sm text-ink-mute m-0">Loading…</p></div>
        ) : affiliates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[15px] text-ink-soft m-0">No affiliates yet</p>
            <p className="opp-meta-mono mt-1 m-0">Click &quot;+ New Affiliate&quot; to create your first affiliate code</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                {['Affiliate', 'Code', 'Discount', 'Commission', 'Sales', 'Revenue', 'Comm. Owed', 'Status', 'Actions'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line ${
                      (i >= 2 && i <= 4) || i === 7 ? 'text-center' : i === 5 || i === 6 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {affiliates.map((aff) => (
                <tr key={aff.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{aff.name}</div>
                    <div className="opp-meta-mono mt-0.5">{aff.email}</div>
                    {aff.parent_affiliate_id && (
                      <div className="opp-meta-mono text-accent-strong mt-0.5">
                        ↳ recruit of {affiliates.find((x) => x.id === aff.parent_affiliate_id)?.code || '?'}
                        {aff.is_flat_rate ? ' · flat' : ' · ⚠ not flat'}
                      </div>
                    )}
                    {Number(aff.recruiter_override_pct || 0) > 0 && (
                      <div className="opp-meta-mono text-ink-mute mt-0.5">recruiter · {aff.recruiter_override_pct}% override</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-accent-strong">{aff.code}</td>
                  <td className="px-4 py-3 text-center">{aff.discount_pct}%</td>
                  <td className="px-4 py-3 text-center">{aff.commission_pct}%</td>
                  <td className="px-4 py-3 text-center font-semibold">{aff.total_sales || 0}</td>
                  <td className="px-4 py-3 text-right font-semibold">${Number(aff.total_revenue || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-warning">${Number(aff.total_commission || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(aff)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                        aff.active ? 'bg-success/10 text-success border-success/30' : 'bg-danger/10 text-danger border-danger/30'
                      }`}
                    >
                      {aff.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-accent-strong hover:bg-surfaceAlt" onClick={() => handleEdit(aff)}>Edit</button>
                      <button
                        className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-ink hover:bg-surfaceAlt"
                        onClick={() => handleSetPassword(aff)}
                        title={aff.login_password_hash ? 'Reset login password' : 'Set login password'}
                      >
                        {aff.login_password_hash ? 'Reset PW' : 'Set PW'}
                      </button>
                      <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-danger hover:bg-surfaceAlt" onClick={() => handleDelete(aff.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ value, label, tone = '' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-ink';
  return (
    <div className="card-premium p-5">
      <div className={`font-display font-semibold tracking-display text-2xl ${toneClass}`}>{value}</div>
      <div className="opp-meta-mono uppercase mt-1">{label}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">{label}</span>
      {children}
    </label>
  );
}
