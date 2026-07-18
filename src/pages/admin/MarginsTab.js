import { useEffect, useState } from 'react';

// Per-SKU margin table (Tris visibility). GROSS margin per product — retail vs
// vendor cost. Read-only; the blended realized net (after processing/shipping/
// commissions) is the Analytics take-home panel, linked below.

export default function MarginsTab({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('margin'); // 'margin' | 'price' | 'gp' | 'name'
  const [category, setCategory] = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/margins', {
          headers: { 'Content-Type': 'application/json', 'x-admin-token': token || '' },
        });
        if (res.ok) setData(await res.json());
      } catch { /* leave empty */ }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <p className="opp-meta-mono text-ink-soft">Loading margins…</p>;
  if (!data) return <p className="opp-meta-mono text-ink-soft">Couldn&apos;t load margins.</p>;

  const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const categories = ['all', ...data.byCategory.map((c) => c.category)];

  let rows = category === 'all' ? data.rows : data.rows.filter((r) => r.category === category);
  rows = [...rows].sort((a, b) => {
    if (sort === 'price') return b.price - a.price;
    if (sort === 'gp') return b.gp - a.gp;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return a.marginPct - b.marginPct; // margin: thinnest first
  });

  const marginColor = (m) => (m >= 85 ? 'text-success' : m >= 70 ? 'text-ink' : m >= 50 ? 'text-warning' : 'text-danger');

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl text-ink m-0">Margins</h2>
          <p className="opp-meta-mono text-ink-soft m-0 mt-1">
            Per-SKU gross margin (retail vs vendor cost). Blended net after processing/shipping/commissions is in Analytics.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
        <Stat value={`${data.summary.avgMargin}%`} label="Avg gross margin" />
        <Stat value={data.summary.count} label="SKUs" />
        <Stat
          value={data.summary.lowest ? `${data.summary.lowest.marginPct}%` : '—'}
          label={data.summary.lowest ? `Lowest · ${data.summary.lowest.name}` : 'Lowest'}
        />
        <Stat
          value={data.summary.highest ? `${data.summary.highest.marginPct}%` : '—'}
          label={data.summary.highest ? `Highest · ${data.summary.highest.name}` : 'Highest'}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select className="input-field text-sm py-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
        </select>
        <select className="input-field text-sm py-1.5" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="margin">Sort: Margin (low→high)</option>
          <option value="gp">Sort: Gross profit/unit</option>
          <option value="price">Sort: Retail price</option>
          <option value="name">Sort: Name</option>
        </select>
        {data.summary.estimatedCount > 0 && (
          <span className="opp-meta-mono text-ink-mute">
            {data.summary.estimatedCount} SKU(s) use an <em>estimated</em> cost (no vendor cost mapped)
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft border-b border-line">
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3 text-right">Retail</th>
              <th className="py-2 pr-3 text-right">Cost</th>
              <th className="py-2 pr-3 text-right">GP / unit</th>
              <th className="py-2 pr-3 text-right">Margin</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/50 text-ink">
                <td className="py-2 pr-3">
                  {r.name}
                  {!r.published && <span className="ml-2 opp-meta-mono text-ink-mute">draft</span>}
                </td>
                <td className="py-2 pr-3 text-ink-soft">{r.category}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(r.price)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                  {money(r.cost)}{r.costSource === 'estimated' && <span className="text-ink-mute"> *</span>}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(r.gp)}</td>
                <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${marginColor(r.marginPct)}`}>{r.marginPct}%</td>
                <td className="py-2 w-24">
                  <div className="h-1.5 rounded-full bg-line overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, r.marginPct))}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.summary.estimatedCount > 0 && (
        <p className="opp-meta-mono text-ink-mute mt-3">
          * cost estimated at {/* COGS_PCT */}~10% of retail (no vendor cost in the map yet) — add it in lib/takehome-config for a real number.
        </p>
      )}
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div className="card-premium p-5">
      <div className="font-display font-semibold tracking-display text-2xl text-ink">{value}</div>
      <div className="opp-meta-mono uppercase mt-1 text-[11px] leading-tight">{label}</div>
    </div>
  );
}
