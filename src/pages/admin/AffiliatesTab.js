import { useState, useEffect } from 'react';

const AFFILIATES_KEY = 'op_affiliates';

export default function AffiliatesTab({ showSaveMsg }) {
  const [affiliates, setAffiliates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    const saved = localStorage.getItem(AFFILIATES_KEY);
    if (saved) setAffiliates(JSON.parse(saved));
  }, []);

  function emptyForm() {
    return {
      name: '',
      email: '',
      code: '',
      discountPct: 10,
      commissionPct: 5,
      active: true,
      notes: '',
    };
  }

  function save(updated) {
    setAffiliates(updated);
    localStorage.setItem(AFFILIATES_KEY, JSON.stringify(updated));
  }

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const code = form.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return;

    // Check for duplicate codes
    if (!editingId && affiliates.some(a => a.code === code)) {
      showSaveMsg('Code already exists.');
      return;
    }

    const entry = {
      ...form,
      code,
      id: editingId || Date.now().toString(),
      discountPct: parseFloat(form.discountPct) || 5,
      commissionPct: parseFloat(form.commissionPct) || 2.5,
      createdAt: editingId ? affiliates.find(a => a.id === editingId)?.createdAt : new Date().toISOString(),
      totalSales: editingId ? affiliates.find(a => a.id === editingId)?.totalSales || 0 : 0,
      totalRevenue: editingId ? affiliates.find(a => a.id === editingId)?.totalRevenue || 0 : 0,
      totalCommission: editingId ? affiliates.find(a => a.id === editingId)?.totalCommission || 0 : 0,
    };

    if (editingId) {
      save(affiliates.map(a => a.id === editingId ? entry : a));
    } else {
      save([entry, ...affiliates]);
    }
    resetForm();
    setShowForm(false);
    showSaveMsg(editingId ? 'Affiliate updated.' : 'Affiliate created.');
  }

  function handleEdit(aff) {
    setForm({
      name: aff.name,
      email: aff.email,
      code: aff.code,
      discountPct: aff.discountPct,
      commissionPct: aff.commissionPct,
      active: aff.active,
      notes: aff.notes || '',
    });
    setEditingId(aff.id);
    setShowForm(true);
  }

  function toggleActive(id) {
    save(affiliates.map(a => a.id === id ? { ...a, active: !a.active } : a));
  }

  function handleDelete(id) {
    if (window.confirm('Delete this affiliate?')) {
      save(affiliates.filter(a => a.id !== id));
    }
  }

  function exportCSV() {
    const headers = ['Name', 'Email', 'Code', 'Discount %', 'Commission %', 'Active', 'Total Sales', 'Total Revenue', 'Total Commission', 'Created'];
    const rows = affiliates.map(a => [
      a.name, a.email, a.code, a.discountPct, a.commissionPct, a.active ? 'Yes' : 'No',
      a.totalSales || 0, (a.totalRevenue || 0).toFixed(2), (a.totalCommission || 0).toFixed(2),
      new Date(a.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliates-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalRevenue = affiliates.reduce((s, a) => s + (a.totalRevenue || 0), 0);
  const totalCommOwed = affiliates.reduce((s, a) => s + (a.totalCommission || 0), 0);
  const totalSales = affiliates.reduce((s, a) => s + (a.totalSales || 0), 0);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={s.sectionTitle}>Affiliates</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9AAAB8', fontFamily: f }}>Manage affiliate codes, commissions, and performance</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.exportBtn} onClick={exportCSV}>Export CSV</button>
          <button style={s.btn} onClick={() => { resetForm(); setShowForm(!showForm); }}>
            {showForm ? 'Cancel' : '+ New Affiliate'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={s.statsRow}>
        <div style={s.statCard}><div style={s.statValue}>{affiliates.length}</div><div style={s.statLabel}>Affiliates</div></div>
        <div style={s.statCard}><div style={s.statValue}>{affiliates.filter(a => a.active).length}</div><div style={s.statLabel}>Active</div></div>
        <div style={s.statCard}><div style={s.statValue}>{totalSales}</div><div style={s.statLabel}>Total Sales</div></div>
        <div style={s.statCard}><div style={{ ...s.statValue, color: '#16a34a' }}>${totalRevenue.toFixed(2)}</div><div style={s.statLabel}>Revenue Generated</div></div>
        <div style={s.statCard}><div style={{ ...s.statValue, color: '#d97706' }}>${totalCommOwed.toFixed(2)}</div><div style={s.statLabel}>Commission Owed</div></div>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ ...s.tableWrap, padding: 24, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#0D1B2A', fontFamily: f }}>
            {editingId ? 'Edit Affiliate' : 'Create Affiliate'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
              <div><label style={s.label}>Affiliate Name</label><input style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
              <div><label style={s.label}>Email</label><input type="email" style={s.input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
              <div>
                <label style={s.label}>Promo Code</label>
                <input style={{ ...s.input, textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 600 }} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. MATT10" required />
              </div>
              <div><label style={s.label}>Customer Discount %</label><input type="number" step="0.5" min="0" max="50" style={s.input} value={form.discountPct} onChange={e => setForm({ ...form, discountPct: e.target.value })} /></div>
              <div><label style={s.label}>Affiliate Commission %</label><input type="number" step="0.5" min="0" max="50" style={s.input} value={form.commissionPct} onChange={e => setForm({ ...form, commissionPct: e.target.value })} /></div>
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                <label style={{ ...s.label, margin: 0, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} style={{ marginRight: 8 }} />
                  Active
                </label>
              </div>
              <div><label style={s.label}>Notes</label><input style={s.input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></div>
            </div>
            <button type="submit" style={s.btn}>{editingId ? 'Update Affiliate' : 'Create Affiliate'}</button>
          </form>
        </div>
      )}

      {/* Table */}
      <div style={s.tableWrap}>
        {affiliates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ fontSize: 15, color: '#5A7D9A', margin: 0 }}>No affiliates yet</p>
            <p style={{ fontSize: 12, color: '#9AAAB8', marginTop: 4 }}>Click "+ New Affiliate" to create your first affiliate code</p>
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Affiliate</th>
                <th style={s.th}>Code</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Discount</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Commission</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Sales</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Revenue</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Comm. Owed</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((aff, i) => (
                <tr key={aff.id} style={{ ...s.tr, backgroundColor: i % 2 === 0 ? '#fff' : '#F9FBFC' }}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{aff.name}</div>
                    <div style={{ fontSize: 11, color: '#9AAAB8' }}>{aff.email}</div>
                  </td>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#00B4D8' }}>{aff.code}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>{aff.discountPct}%</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>{aff.commissionPct}%</td>
                  <td style={{ ...s.td, textAlign: 'center', fontWeight: 600 }}>{aff.totalSales || 0}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>${(aff.totalRevenue || 0).toFixed(2)}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#d97706' }}>${(aff.totalCommission || 0).toFixed(2)}</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    <span style={{ ...s.statusBadge, backgroundColor: aff.active ? '#dcfce7' : '#fee2e2', color: aff.active ? '#16a34a' : '#dc2626', cursor: 'pointer' }} onClick={() => toggleActive(aff.id)}>
                      {aff.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={s.actionBtn} onClick={() => handleEdit(aff)}>Edit</button>
                      <button style={{ ...s.actionBtn, color: '#dc2626' }} onClick={() => handleDelete(aff.id)}>Del</button>
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

const f = "'Helvetica Neue', Arial, sans-serif";
const s = {
  sectionTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#0D1B2A', fontFamily: f },
  btn: { padding: '9px 20px', borderRadius: 8, border: 'none', backgroundColor: '#00B4D8', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f },
  exportBtn: { padding: '9px 16px', borderRadius: 8, border: '1px solid #E4EDF3', backgroundColor: '#fff', color: '#0D1B2A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f },
  statsRow: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 },
  statCard: { flex: '1 1 140px', backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E4EDF3', padding: '18px 20px' },
  statValue: { fontSize: 26, fontWeight: 700, color: '#0D1B2A', fontFamily: f },
  statLabel: { fontSize: 12, color: '#9AAAB8', marginTop: 2, fontFamily: f, textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#9AAAB8', marginBottom: 4, fontFamily: f, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #E4EDF3', fontSize: 13, fontFamily: f, color: '#0D1B2A', outline: 'none', boxSizing: 'border-box' },
  tableWrap: { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #E4EDF3', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { backgroundColor: '#F4F9FC' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9AAAB8', fontFamily: f, letterSpacing: 0.8, textTransform: 'uppercase', borderBottom: '1px solid #E4EDF3' },
  tr: { borderBottom: '1px solid #F0F4F8' },
  td: { padding: '14px 16px', fontSize: 13, color: '#0D1B2A', fontFamily: f, verticalAlign: 'middle' },
  statusBadge: { fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px', fontFamily: f },
  actionBtn: { background: 'none', border: '1px solid #E4EDF3', borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#0077B6', fontFamily: f, fontWeight: 500 },
};
