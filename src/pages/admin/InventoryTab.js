import { useEffect, useState } from 'react';

const LOW_STOCK_THRESHOLD = 20;

export default function InventoryTab({ products = [], showSaveMsg, token }) {
  const [inventory, setInventory] = useState({});
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    try {
      const res = await fetch('/api/inventory', { headers: { 'x-admin-token': token || '' } });
      const data = await res.json();
      setInventory(data);
      setEdits(data);
    } catch {
      /* fail */
    }
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch('/api/inventory/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token || '', updates: edits }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInventory(updated);
      setEdits(updated);
      showSaveMsg('Inventory saved.');
    } else {
      showSaveMsg('Save failed. Please try again.');
    }
    setSaving(false);
  }

  function handleEdit(id, val) {
    setEdits((prev) => ({ ...prev, [id]: Math.max(0, Number(val) || 0) }));
  }

  const baseProducts = products.filter((p) => !p.isKit);
  const totalUnits = Object.values(edits).reduce((a, b) => a + b, 0);
  const totalValue = baseProducts.reduce((sum, p) => sum + (edits[p.id] ?? p.stock ?? 0) * p.price, 0);
  const lowStockItems = baseProducts.filter(
    (p) => (edits[p.id] ?? p.stock ?? 0) > 0 && (edits[p.id] ?? p.stock ?? 0) <= LOW_STOCK_THRESHOLD
  );
  const outOfStockItems = baseProducts.filter((p) => (edits[p.id] ?? p.stock ?? 0) === 0);

  const fmtMoney = (n) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Inventory</h2>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-4 py-2">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-5">
        <Stat value={baseProducts.length} label="Total SKUs" />
        <Stat value={totalUnits} label="Units in Stock" />
        <Stat value={`$${fmtMoney(totalValue)}`} label="Inventory Value" />
        <Stat value={lowStockItems.length} label="Low Stock" tone={lowStockItems.length > 0 ? 'warn' : ''} />
        <Stat value={outOfStockItems.length} label="Out of Stock" tone={outOfStockItems.length > 0 ? 'danger' : ''} />
      </div>

      {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
        <div className="flex flex-col gap-2 mb-5">
          {outOfStockItems.map((p) => (
            <div key={p.id} className="px-4 py-2.5 rounded-opp border border-danger/30 bg-danger/10 text-danger text-[13px]">
              <strong>OUT OF STOCK:</strong> {p.name} {p.dosage}
            </div>
          ))}
          {lowStockItems.map((p) => (
            <div key={p.id} className="px-4 py-2.5 rounded-opp border border-warning/30 bg-warning/10 text-warning text-[13px]">
              <strong>LOW STOCK:</strong> {p.name} {p.dosage} — {edits[p.id]} units remaining
            </div>
          ))}
        </div>
      )}

      <div className="card-premium overflow-hidden">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-surfaceAlt">
            <tr>
              {['Product', 'SKU', 'Category', 'Price', 'Stock Qty', 'Status', 'Value'].map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute border-b border-line ${
                    i >= 4 && i !== 6 ? 'text-center' : i === 6 ? 'text-right' : 'text-left'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baseProducts.map((p) => {
              const qty = edits[p.id] ?? p.stock ?? 0;
              const status = qty === 0 ? 'out' : qty <= LOW_STOCK_THRESHOLD ? 'low' : 'in';
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{p.name}</div>
                    <div className="opp-meta-mono mt-0.5">{p.dosage}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{p.sku}</td>
                  <td className="px-4 py-3">
                    <span className="opp-meta-mono bg-surfaceAlt px-2 py-0.5 rounded-full">{p.category}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">${p.price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      min="0"
                      value={qty}
                      onChange={(e) => handleEdit(p.id, e.target.value)}
                      className="w-20 px-2 py-1 border border-line rounded-opp bg-paper font-mono font-semibold text-center outline-none focus:border-ink"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">${fmtMoney(qty * p.price)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-surfaceAlt">
              <td colSpan={4} className="px-4 py-3 font-bold font-mono text-[11px] tracking-[0.14em] uppercase text-ink">
                TOTALS
              </td>
              <td className="px-4 py-3 text-center font-bold text-ink">{totalUnits} units</td>
              <td />
              <td className="px-4 py-3 text-right font-bold text-ink">${fmtMoney(totalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function Stat({ value, label, tone = '' }) {
  const toneClass = tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="card-premium p-5">
      <div className={`font-display font-semibold tracking-display text-2xl ${toneClass}`}>{value}</div>
      <div className="opp-meta-mono uppercase mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    out: 'bg-danger/10 text-danger border-danger/30',
    low: 'bg-warning/10 text-warning border-warning/30',
    in: 'bg-success/10 text-success border-success/30',
  };
  const label = status === 'out' ? 'Out of Stock' : status === 'low' ? 'Low Stock' : 'In Stock';
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${map[status]}`}>{label}</span>;
}
