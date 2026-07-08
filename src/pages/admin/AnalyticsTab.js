import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar, BarChart,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, LabelList,
} from 'recharts';

// Operator analytics dashboard. Money KPIs w/ prior-period deltas, revenue +
// orders trend, visitor funnel, acquisition-by-source (revenue), product
// performance (by name + revenue), customers, and rail mix. Data from
// /api/admin/analytics. (Payment completion/fall-off by rail lives in the
// separate Payment-Funnel tab — this is the revenue/marketing view.)

// Brand palette (dark admin theme) — hex approximations of the cyan accent + tokens.
const C = {
  accent: '#22B8CF', accentDeep: '#1098AD', gold: '#F0B456', green: '#4FD48A',
  red: '#F07A6A', ink: '#F5F3EC', inkSoft: '#B6B4AC', inkMute: '#6E6D68',
  border: '#24272D', surface: '#121418', surfaceAlt: '#1A1D23',
};
const PIE_COLORS = [C.accent, C.green, C.gold, C.red, C.inkSoft, C.accentDeep];

const RANGES = [{ days: 7, label: '7d' }, { days: 14, label: '14d' }, { days: 30, label: '30d' }, { days: 90, label: '90d' }];

// Events-only stages (one consistent source). Order/paid outcomes live in the
// KPIs/trend — they come from the orders table, which has more history than the
// events table, so they can't share this funnel's denominator.
const FUNNEL_STEPS = [
  { key: 'visits', label: 'Visits' },
  { key: 'product_viewers', label: 'Viewed product' },
  { key: 'carts', label: 'Added to cart' },
  { key: 'checkouts', label: 'Started checkout' },
  { key: 'payment_attempts', label: 'Payment attempt' },
];

const fmtMoney = (n, dp = 0) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US');
const fmtPct = (n) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);

function delta(cur, prev) {
  if (prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const tooltipStyle = { background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.ink };

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
    } catch { setData(null); }
    setLoading(false);
  }, [authHeaders, days]);

  useEffect(() => { load(); }, [load]);

  const k = data?.kpis;
  const f = data?.funnel;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="font-display font-semibold text-xl text-ink m-0">Analytics</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 text-[12px] rounded-opp border ${days === r.days ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:text-ink'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[13px] text-ink-soft m-0 mb-6">
        Revenue, funnel + sources. Deltas vs the prior {days} days.
        {data?.truncated && <span className="text-warning"> (data capped — range too large)</span>}
      </p>

      {loading ? (
        <p className="text-[13px] text-ink-mute">Loading…</p>
      ) : !data ? (
        <p className="text-[13px] text-danger">Couldn&rsquo;t load analytics.</p>
      ) : (
        <>
          {/* KPI ROW */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
            <Kpi label="Revenue" value={fmtMoney(k.revenue.value)} d={delta(k.revenue.value, k.revenue.prev)} />
            <Kpi label="Orders" value={fmtNum(k.orders.value)} d={delta(k.orders.value, k.orders.prev)} />
            <Kpi label="AOV" value={fmtMoney(k.aov.value, 2)} d={delta(k.aov.value, k.aov.prev)} />
            <Kpi label="Conversion" value={fmtPct(k.conversion.value)} d={delta(k.conversion.value, k.conversion.prev)} />
            <Kpi label="Repeat rate" value={fmtPct(k.repeat_rate.value)} d={null} sub={`${data.refunds.count} refunds · ${fmtPct(data.refunds.rate)}`} />
          </div>

          {/* TAKE-HOME ESTIMATE — after restocks + taxes, split per owner */}
          {data.takehome && <TakeHome t={data.takehome} days={days} />}

          {/* HOUSE ORDERS — the margin lever */}
          {data.house && (
            <Panel title="House orders — commission-free reorders we recaptured">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="House % of revenue" value={fmtPct(data.house.share)} d={delta(data.house.share, data.house.prev_share)} />
                <Kpi label="Reorder capture" value={fmtPct(data.house.reorder_capture)} d={null} sub={`of ${fmtNum(data.house.returning_orders)} returning orders`} />
                <Kpi label="House orders" value={fmtNum(data.house.orders)} d={null} sub="recovery / replenishment" />
                <Kpi label="House revenue" value={fmtMoney(data.house.revenue)} d={null} sub="≈70% margin vs ~37%" />
              </div>
              <p className="opp-meta-mono text-ink-mute mt-4 pt-3 border-t border-line leading-relaxed">
                House orders are reorders we won via our own recovery/replenishment email (15% off, <strong className="text-ink-soft">no affiliate commission</strong>) — ≈70% margin vs ~37% on a commissioned order. <strong className="text-ink-soft">Reorder capture</strong> (house ÷ returning orders) is the single lever that lifts blended margin; affiliate-driven new orders are untouched.
              </p>
            </Panel>
          )}

          {/* REVENUE + ORDERS TREND */}
          <Panel title="Revenue & orders">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: C.inkMute, fontSize: 11 }} tickFormatter={(d) => d.slice(5)} axisLine={{ stroke: C.border }} tickLine={false} />
                <YAxis yAxisId="rev" tick={{ fill: C.inkMute, fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} axisLine={false} tickLine={false} width={48} />
                <YAxis yAxisId="ord" orientation="right" tick={{ fill: C.inkMute, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => (n === 'revenue' ? fmtMoney(v) : v)} labelStyle={{ color: C.inkSoft }} />
                <Area yAxisId="rev" type="monotone" dataKey="revenue" stroke={C.accent} strokeWidth={2} fill="url(#revGrad)" name="revenue" />
                <Line yAxisId="ord" type="monotone" dataKey="orders" stroke={C.gold} strokeWidth={2} dot={false} name="orders" />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            {/* FUNNEL — horizontal bars (robust to noisy/non-monotonic data) */}
            <Panel title="Visitor funnel">
              <div className="flex flex-col gap-2">
                {FUNNEL_STEPS.map((step, i) => {
                  const val = f[step.key] || 0;
                  const prev = i > 0 ? (f[FUNNEL_STEPS[i - 1].key] || 0) : val;
                  const topVal = f[FUNNEL_STEPS[0].key] || 0;
                  const widthPct = topVal ? Math.max(3, (val / topVal) * 100) : 3;
                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <div className="w-32 shrink-0 text-[12px] text-ink-soft">{step.label}</div>
                      <div className="flex-1 bg-surfaceAlt rounded-opp h-7 relative overflow-hidden">
                        <div className="h-full rounded-opp" style={{ width: `${widthPct}%`, background: C.accent }} />
                        <span className="absolute inset-y-0 left-3 flex items-center text-[12px] font-semibold text-ink">{fmtNum(val)}</span>
                      </div>
                      <div className="w-14 shrink-0 text-right opp-meta-mono text-ink-mute">{i === 0 ? '' : fmtPct(prev ? (val / prev) * 100 : null)}</div>
                    </div>
                  );
                })}
              </div>
              <p className="opp-meta-mono text-ink-mute mt-3 pt-3 border-t border-line leading-relaxed">
                On-site sessions since tracking began (Jun 6). Off-site Venmo/Zelle orders + pre-tracking history aren&rsquo;t here — see the KPIs for total orders &amp; revenue.
              </p>
            </Panel>

            {/* RAIL MIX */}
            <Panel title="Revenue by rail">
              {data.rail_mix.length === 0 ? <Empty>No paid orders in range.</Empty> : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(v)} />
                    <Pie data={data.rail_mix} dataKey="revenue" nameKey="method" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {data.rail_mix.map((e, i) => <Cell key={e.method} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      <LabelList dataKey="method" position="outside" fill={C.inkSoft} fontSize={11} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* ACQUISITION BY SOURCE */}
          <Panel title="Acquisition by source">
            <Table
              cols={['Source', 'Visits', 'Orders', 'Revenue', 'AOV', 'Conv']}
              rows={data.by_ref.map((r) => [r.ref, fmtNum(r.visits), r.paid, fmtMoney(r.revenue), fmtMoney(r.aov, 2), r.conv == null ? '—' : `${r.conv}%`])}
              empty="No source data yet."
            />
          </Panel>

          {/* TOP PRODUCTS — revenue bar + table */}
          <Panel title="Top products by revenue">
            {data.top_products.length === 0 ? <Empty>No product data yet.</Empty> : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(120, Math.min(data.top_products.length, 8) * 34)}>
                  <BarChart data={data.top_products.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                    <XAxis type="number" tick={{ fill: C.inkMute, fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fill: C.inkSoft, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtMoney(v)} cursor={{ fill: C.surfaceAlt }} />
                    <Bar dataKey="revenue" fill={C.accent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <Table
                  cols={['Product', 'Revenue', 'Bought', 'Carts', 'Views']}
                  rows={data.top_products.map((p) => [p.name, fmtMoney(p.revenue), p.purchases, p.carts, fmtNum(p.views)])}
                  empty=""
                />
              </>
            )}
          </Panel>

          {/* CUSTOMERS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title="New vs returning (orders)">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Pie
                    data={[{ name: 'New', value: data.customers.new_orders }, { name: 'Returning', value: data.customers.returning_orders }]}
                    dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    <Cell fill={C.accent} /><Cell fill={C.green} />
                    <LabelList dataKey="name" position="outside" fill={C.inkSoft} fontSize={11} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="text-[13px] text-ink-soft text-center mt-1">Repeat-customer rate: <strong className="text-ink">{fmtPct(data.customers.repeat_rate)}</strong></div>
            </Panel>
            <Panel title="Top customers by spend">
              <Table
                cols={['Customer', 'Spend', 'Orders']}
                rows={data.customers.top.map((c) => [c.email, fmtMoney(c.spend), c.orders])}
                empty="No paid customers in range."
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, d, sub }) {
  const up = d != null && d >= 0;
  return (
    <div className="card-premium p-4">
      <div className="opp-meta-mono uppercase text-ink-mute">{label}</div>
      <div className="font-display font-semibold tracking-display text-2xl text-ink mt-1 leading-none">{value}</div>
      {d != null ? (
        <div className={`opp-meta-mono mt-1.5 ${up ? 'text-success' : 'text-danger'}`}>{up ? '▲' : '▼'} {Math.abs(d)}% <span className="text-ink-mute">vs prev</span></div>
      ) : (
        <div className="opp-meta-mono mt-1.5 text-ink-mute">{sub || '—'}</div>
      )}
    </div>
  );
}

function TakeHome({ t, days }) {
  const rate = (r) => `${+(r * 100).toFixed(1)}%`;
  const cogsLabel = t.cogsBasis === 'vendor'
    ? `Restock / COGS · vendor cost${t.cogsCoverage != null && t.cogsCoverage < 99 ? ` (${t.cogsCoverage}% mapped)` : ''}`
    : `Restock / COGS · ${rate(t.rates.cogs)}`;
  const lines = [
    { label: 'Gross revenue', val: t.gross, strong: true },
    { label: cogsLabel, val: -t.deductions.cogs },
    { label: `Shipping · ${rate(t.rates.shipping)}`, val: -t.deductions.shipping },
    { label: 'Processing fees · by rail', val: -t.deductions.processing },
    { label: `Affiliate commissions · ${rate(t.rates.commission)}`, val: -t.deductions.commissions },
    { label: `Operating overhead · ${rate(t.rates.ops)}`, val: -t.deductions.ops },
    { label: 'Pre-tax net', val: t.preTaxNet, strong: true },
    { label: `Estimated tax · ${rate(t.rates.tax)}`, val: -t.tax },
    { label: 'After-tax profit', val: t.afterTax, strong: true, total: true },
  ];
  return (
    <Panel title="Take-home estimate — after restocks & taxes">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Kpi label="After-tax profit" value={fmtMoney(t.afterTax)} d={null} sub={`${fmtPct(t.marginPct)} net margin · last ${days}d`} />
        <div className="card-premium p-4" style={{ borderColor: C.gold }}>
          <div className="opp-meta-mono uppercase text-ink-mute">Take-home / partner</div>
          <div className="font-display font-semibold tracking-display text-2xl mt-1 leading-none" style={{ color: C.gold }}>{fmtMoney(t.perPartner)}</div>
          <div className="opp-meta-mono mt-1.5 text-ink-mute">Matt / Tris 50/50 ({t.ownerCount}-way)</div>
        </div>
      </div>
      <div className="border border-line rounded-opp overflow-hidden">
        <table className="w-full text-[13px]">
          <tbody>
            {lines.map((l, i) => {
              const neg = l.val < 0;
              return (
                <tr key={i} className={`border-t border-line first:border-t-0 ${l.total ? 'bg-surfaceAlt' : ''}`}>
                  <td className={`px-4 py-2.5 text-left ${l.strong ? 'text-ink font-semibold' : 'text-ink-soft'}`}>{l.label}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${l.total ? 'text-ink font-semibold' : neg ? 'text-danger' : 'text-ink'}`}>
                    {neg ? '−' : ''}{fmtMoney(Math.abs(l.val))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="opp-meta-mono text-ink-mute mt-4 pt-3 border-t border-line leading-relaxed">
        Planning estimate on the last {days}d of <strong className="text-ink-soft">paid Syngyn orders</strong>. Restock/COGS uses real per-SKU vendor cost; processing fees use the actual rail mix; shipping, commissions, overhead &amp; tax ({rate(t.rates.tax)}) are tunable assumptions (SOB margin model) in <span className="text-ink-soft">takehome-config.js</span>. Not accounting.
      </p>
    </Panel>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-surface border border-line rounded-opp-lg p-5 mb-5">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute m-0 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-[13px] text-ink-mute m-0">{children}</p>;
}

function Table({ cols, rows, empty }) {
  if (!rows || rows.length === 0) return empty ? <Empty>{empty}</Empty> : null;
  return (
    <div className="border border-line rounded-opp overflow-hidden overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-surfaceAlt text-ink-mute">
          <tr>{cols.map((c, i) => <th key={c} className={`font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-line">
              {row.map((cell, ci) => <td key={ci} className={`px-4 py-2.5 ${ci === 0 ? 'text-left text-ink font-mono text-[12px] truncate max-w-[220px]' : 'text-right text-ink-soft'}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
