import { useEffect, useState } from 'react';

function generateLotNumber(productId) {
  const prefix = productId.replace(/-/g, '').toUpperCase().slice(0, 4);
  const d = new Date();
  const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getFullYear()).slice(2)}`;
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${prefix}-${dateStr}-${seq}`;
}

export default function SupplyTab({ products = [], token }) {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm(products));
  const [value, setValue] = useState(null); // held-inventory valuation

  useEffect(() => {
    fetchLots();
    fetchValue();
  }, []);

  async function fetchValue() {
    try {
      const res = await fetch('/api/admin/inventory-value', { headers: authHeaders() });
      if (res.ok) setValue(await res.json());
    } catch { /* leave prior value */ }
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-admin-token': token || '',
    };
  }

  async function fetchLots() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/lots', { headers: authHeaders() });
      if (res.ok) setLots(await res.json());
    } catch { /* fail */ }
    setLoading(false);
  }

  function emptyForm() {
    return {
      productId: products[0]?.id || '',
      lotNumber: '',
      supplierLot: '',
      dateReceived: new Date().toISOString().split('T')[0],
      qtyVials: '',
      qtyRemaining: '',
      coaOnFile: false,
      notes: '',
    };
  }

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = {
      productId: form.productId,
      lotNumber: form.lotNumber,
      supplierLot: form.supplierLot,
      dateReceived: form.dateReceived,
      qtyVials: parseInt(form.qtyVials) || 0,
      qtyRemaining: parseInt(form.qtyRemaining) || parseInt(form.qtyVials) || 0,
      coaOnFile: form.coaOnFile,
      notes: form.notes,
    };
    const method = editingId ? 'PATCH' : 'POST';
    if (editingId) body.id = editingId;

    try {
      await fetch('/api/admin/lots', { method, headers: authHeaders(), body: JSON.stringify(body) });
      await fetchLots();
      await fetchValue();
      resetForm();
      setShowForm(false);
    } catch { /* fail */ }
  }

  function handleEdit(lot) {
    setForm({
      productId: lot.product_id,
      lotNumber: lot.lot_number,
      supplierLot: lot.supplier_lot || '',
      dateReceived: lot.date_received,
      qtyVials: String(lot.qty_vials),
      qtyRemaining: String(lot.qty_remaining),
      coaOnFile: lot.coa_on_file,
      notes: lot.notes || '',
    });
    setEditingId(lot.id);
    setShowForm(true);
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this lot entry?')) return;
    try {
      await fetch('/api/admin/lots', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
      await fetchLots();
      await fetchValue();
    } catch { /* fail */ }
  }

  function getName(id) {
    const p = products.find((p) => p.id === id);
    return p ? p.name : id;
  }

  const totalVials = lots.reduce((sum, l) => sum + (l.qty_remaining || 0), 0);

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Lot Tracking</h2>
          <p className="opp-meta-mono mt-1 m-0">Track supplier lots, COAs, and vial inventory.</p>
        </div>
        <button
          className="btn-primary text-xs px-4 py-2"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
        >
          {showForm ? 'Cancel' : '+ New Lot'}
        </button>
      </div>

      {/* Inventory VALUE — what's sitting on the shelf, held (awaiting testing)
          vs verified (COA on file). Read from supply_lots; separate from
          sellable stock, so nothing here is purchasable. Both retail + cost. */}
      {value && (
        <div className="mb-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <ValueStat
              label="Held — awaiting testing"
              retail={value.held.retail}
              cost={value.held.cost}
              vials={value.held.vials}
              accent
            />
            <ValueStat
              label="Verified — COA on file"
              retail={value.verified.retail}
              cost={value.verified.cost}
              vials={value.verified.vials}
            />
            <ValueStat
              label="Total on hand"
              retail={value.total.retail}
              cost={value.total.cost}
              vials={value.total.vials}
            />
          </div>
          {value.heldByProduct?.length > 0 && (
            <details className="mt-3 card-premium p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                Held stock breakdown ({value.heldByProduct.length} SKU{value.heldByProduct.length === 1 ? '' : 's'} awaiting testing)
              </summary>
              <table className="w-full text-[13px] mt-3">
                <thead>
                  <tr className="text-left text-ink-mute border-b border-line">
                    <th className="py-1.5 pr-3 font-mono text-[10px] uppercase tracking-wider">Product</th>
                    <th className="py-1.5 pr-3 font-mono text-[10px] uppercase tracking-wider text-right">Vials</th>
                    <th className="py-1.5 pr-3 font-mono text-[10px] uppercase tracking-wider text-right">Retail value</th>
                    <th className="py-1.5 font-mono text-[10px] uppercase tracking-wider text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {value.heldByProduct.map((r) => (
                    <tr key={r.id} className="border-b border-line/50 text-ink">
                      <td className="py-1.5 pr-3">{r.name}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.vials}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">${r.retail.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink-soft">${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="opp-meta-mono text-ink-mute mt-2 m-0">
                Retail = catalog price × vials. Cost = vendor-cost map (same basis as commissions). Held = lots without a COA on file yet — not sellable.
              </p>
            </details>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
        <Stat value={lots.length} label="Total Lots" />
        <Stat value={totalVials} label="Vials Remaining" />
        <Stat value={lots.filter((l) => l.coa_on_file).length} label="COAs on File" />
        <Stat value={new Set(lots.map((l) => l.product_id)).size} label="Products Tracked" />
      </div>

      {showForm && (
        <div className="card-premium p-6 mb-5">
          <h3 className="font-display font-semibold text-base mb-4 text-ink">
            {editingId ? 'Edit Lot' : 'Add New Lot'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
              <Field label="Product">
                <select className="input-field" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  {products.filter((p) => !p.isKit).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} {p.dosage}</option>
                  ))}
                </select>
              </Field>
              <Field label="Your Lot #">
                <div className="flex gap-1.5">
                  <input className="input-field flex-1 font-mono font-semibold" value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })} placeholder="e.g. GLP3-040626-001" required />
                  <button type="button" className="btn-outline text-xs px-3 py-2" onClick={() => setForm({ ...form, lotNumber: generateLotNumber(form.productId) })}>Auto</button>
                </div>
              </Field>
              <Field label="Supplier Lot #">
                <input className="input-field" value={form.supplierLot} onChange={(e) => setForm({ ...form, supplierLot: e.target.value })} placeholder="From supplier COA" />
              </Field>
              <Field label="Date Received">
                <input type="date" className="input-field" value={form.dateReceived} onChange={(e) => setForm({ ...form, dateReceived: e.target.value })} required />
              </Field>
              <Field label="Qty Vials (Total)">
                <input type="number" className="input-field" value={form.qtyVials} onChange={(e) => setForm({ ...form, qtyVials: e.target.value, qtyRemaining: form.qtyRemaining || e.target.value })} min="0" required />
              </Field>
              <Field label="Qty Remaining">
                <input type="number" className="input-field" value={form.qtyRemaining} onChange={(e) => setForm({ ...form, qtyRemaining: e.target.value })} min="0" required />
              </Field>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 opp-meta-mono uppercase cursor-pointer m-0">
                  <input type="checkbox" checked={form.coaOnFile} onChange={(e) => setForm({ ...form, coaOnFile: e.target.checked })} />
                  COA on File
                </label>
              </div>
              <Field label="Notes">
                <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </Field>
            </div>
            <button type="submit" className="btn-primary">{editingId ? 'Update Lot' : 'Add Lot'}</button>
          </form>
        </div>
      )}

      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-ink-mute m-0">Loading…</p>
          </div>
        ) : lots.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[15px] text-ink-soft m-0">No lots tracked yet</p>
            <p className="opp-meta-mono mt-1 m-0">Click &quot;+ New Lot&quot; to add your first supply entry</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surfaceAlt">
              <tr>
                {['Product', 'Your Lot #', 'Supplier Lot', 'Received', 'Total', 'Remaining', 'COA', 'Notes', 'Actions'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line ${
                      i >= 4 && i <= 6 ? 'text-center' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const low = lot.qty_remaining <= Math.ceil((lot.qty_vials || 1) * 0.2);
                return (
                  <tr key={lot.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <span className="opp-meta-mono bg-surfaceAlt px-2 py-0.5 rounded-full">{getName(lot.product_id)}</span>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-ink">{lot.lot_number}</td>
                    <td className="px-4 py-3 font-mono text-ink-soft">{lot.supplier_lot}</td>
                    <td className="px-4 py-3 text-ink-soft">{lot.date_received}</td>
                    <td className="px-4 py-3 text-center">{lot.qty_vials}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${low ? 'bg-warning/10 text-warning border-warning/30' : 'bg-success/10 text-success border-success/30'}`}>
                        {lot.qty_remaining}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${lot.coa_on_file ? 'text-success' : 'text-danger'}`}>
                        {lot.coa_on_file ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft">{lot.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-accent-strong hover:bg-surfaceAlt" onClick={() => handleEdit(lot)}>Edit</button>
                        <button className="text-[11px] px-2.5 py-1 rounded-opp border border-line text-danger hover:bg-surfaceAlt" onClick={() => handleDelete(lot.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ value, label }) {
  return (
    <div className="card-premium p-5">
      <div className="font-display font-semibold tracking-display text-2xl text-ink">{value}</div>
      <div className="opp-meta-mono uppercase mt-1">{label}</div>
    </div>
  );
}

function ValueStat({ label, retail, cost, vials, accent }) {
  const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return (
    <div className={`card-premium p-5 ${accent ? 'border border-accent/50' : ''}`}>
      <div className="opp-meta-mono uppercase">{label}</div>
      <div className={`font-display font-semibold tracking-display text-3xl mt-1.5 ${accent ? 'text-accent-strong' : 'text-ink'}`}>
        {money(retail)}
      </div>
      <div className="opp-meta-mono text-ink-mute mt-1">
        retail · {money(cost)} cost · {Number(vials || 0).toLocaleString()} vials
      </div>
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
