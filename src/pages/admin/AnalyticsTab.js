import { useState, useEffect, useCallback } from 'react';

// First-party funnel analytics. Shows the visitor funnel (the top-of-funnel
// that the orders-based Funnel tab can't see), conversion by source, top
// products, daily traffic, and rail mix. Data from /api/admin/analytics.

const RANGES = [
  { days: 7, label: '7d' },
  { days: 14, label: '14d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

const FUNNEL_STEPS = [
  { key: 'visits', label: 'Visits' },
  { key: 'product_viewers', label: 'Viewed a product' },
  { key: 'carts', label: 'Added to cart' },
  { key: 'checkouts', label: 'Started checkout' },
  { key: 'orders', label: 'Order created' },
  { key: 'paid', label: 'Paid' },
];

function pct(n, d) {
  if (!d) return '—';
  return `${Math.round((n / d) * 1000) / 10}%`;
}

export default function AnalyticsTab({ token }) {
  const authHeaders = useCallback(() => ({ 'x-admin-token': token || '' }), [token]);
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { headers: authHeaders() });
      setData(res.ok ? await res.json() : null);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [authHeaders, days]);

  useEffect(() => { load(); }, [load]);

  const f = data?.funnel;
  const top = f ? f.visits : 0;
  const maxVisitDay = data ? Math.max(1, ...data.daily.map((d) => d.visits)) : 1;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-semibold text-xl text-ink m-0">Analytics</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 text-[12px] rounded-opp border ${days === r.days ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:text-ink'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[13px] text-ink-soft m-0 mb-6">Visitor funnel + sources from first-party events. {data?.truncated && <span className="text-warning">(data capped — range too large)</span>}</p>

      {loading ? (
        <p className="text-[13px] text-ink-mute">Loading…</p>
      ) : !data ? (
        <p className="text-[13px] text-danger">Couldn&rsquo;t load analytics.</p>
      ) : (
        <>
          {/* FUNNEL */}
          <div className="bg-surface border border-line rounded-opp-lg p-6 mb-8">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute m-0 mb-4">Visitor funnel</h3>
            <div className="flex flex-col gap-2">
              {FUNNEL_STEPS.map((step, i) => {
                const val = f[step.key] || 0;
                const prev = i > 0 ? f[FUNNEL_STEPS[i - 1].key] || 0 : val;
                const widthPct = top ? Math.max(2, (val / top) * 100) : 2;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 text-[13px] text-ink-soft">{step.label}</div>
                    <div className="flex-1 bg-surfaceAlt rounded-opp h-7 relative overflow-hidden">
                      <div className="h-full bg-accent-strong/80 rounded-opp" style={{ width: `${widthPct}%` }} />
                      <span className="absolute inset-y-0 left-3 flex items-center text-[12px] font-semibold text-ink">{val.toLocaleString()}</span>
                    </div>
                    <div className="w-28 shrink-0 text-right text-[12px] font-mono text-ink-mute">
                      {i === 0 ? '—' : <>{pct(val, prev)} <span className="text-ink-mute/60">step</span></>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-line text-[13px] text-ink-soft">
              Overall visit → paid conversion: <strong className="text-ink">{pct(f.paid, f.visits)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* BY SOURCE */}
            <div>
              <h3 className="font-display font-semibold text-base text-ink m-0 mb-3">Conversion by source</h3>
              <Table
                cols={['Source', 'Visits', 'Paid', 'Conv']}
                rows={data.by_ref.map((r) => [r.ref, r.visits.toLocaleString(), r.paid, r.conv == null ? '—' : `${r.conv}%`])}
                empty="No source data yet."
              />
            </div>
            {/* TOP PRODUCTS */}
            <div>
              <h3 className="font-display font-semibold text-base text-ink m-0 mb-3">Top products</h3>
              <Table
                cols={['Product', 'Views', 'Carts', 'Bought']}
                rows={data.top_products.map((p) => [p.product_id, p.views.toLocaleString(), p.carts, p.purchases])}
                empty="No product views yet."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* DAILY */}
            <div>
              <h3 className="font-display font-semibold text-base text-ink m-0 mb-3">Daily traffic</h3>
              {data.daily.length === 0 ? (
                <p className="text-[13px] text-ink-mute m-0">No traffic in range.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {data.daily.map((d) => (
                    <div key={d.date} className="flex items-center gap-2 text-[12px]">
                      <span className="w-20 shrink-0 font-mono text-ink-mute">{d.date.slice(5)}</span>
                      <div className="flex-1 bg-surfaceAlt rounded h-4 overflow-hidden">
                        <div className="h-full bg-accent-strong/70" style={{ width: `${(d.visits / maxVisitDay) * 100}%` }} />
                      </div>
                      <span className="w-24 shrink-0 text-right font-mono text-ink-soft">{d.visits}v / {d.orders}o</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* RAIL MIX */}
            <div>
              <h3 className="font-display font-semibold text-base text-ink m-0 mb-3">Paid by rail</h3>
              <Table
                cols={['Rail', 'Paid orders']}
                rows={data.rail_mix.map((r) => [r.method, r.count])}
                empty="No paid orders in range."
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Table({ cols, rows, empty }) {
  if (!rows || rows.length === 0) return <p className="text-[13px] text-ink-mute m-0">{empty}</p>;
  return (
    <div className="border border-line rounded-opp overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-surfaceAlt text-ink-mute">
          <tr>
            {cols.map((c, i) => (
              <th key={c} className={`font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-line">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-4 py-2.5 ${ci === 0 ? 'text-left text-ink font-mono text-[12px]' : 'text-right text-ink-soft'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
