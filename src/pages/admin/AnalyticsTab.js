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

  // Sales-by-period table (independent of the KPI window above) — its own range
  // switcher, its own fetch to /api/admin/sales-summary.
  const [salesRange, setSalesRange] = useState('this_month');
  const [sales, setSales] = useState(null);
  const [salesLoading, setSalesLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { headers: authHeaders() });
      setData(res.ok ? await res.json() : null);
    } catch { setData(null); }
    setLoading(false);
  }, [authHeaders, days]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const res = await fetch(`/api/admin/sales-summary?range=${salesRange}`, { headers: authHeaders() });
      setSales(res.ok ? await res.json() : null);
    } catch { setSales(null); }
    setSalesLoading(false);
  }, [authHeaders, salesRange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSales(); }, [loadSales]);

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

      {/* TODAY / WTD / MTD — live sales pulse (LA time), independent of the
          KPI window; always visible even while the heavier analytics load. */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Kpi label="Today's sales" value={fmtMoney(sales?.today?.revenue ?? 0)} d={null} sub={sales ? `${fmtNum(sales.today.orders)} orders · ${sales.today_la}` : 'Loading…'} />
        <Kpi label="This week" value={fmtMoney(sales?.wtd?.revenue ?? 0)} d={null} sub={sales ? `${fmtNum(sales.wtd.orders)} orders · since Mon` : ''} />
        <Kpi label="This month" value={fmtMoney(sales?.mtd?.revenue ?? 0)} d={null} sub={sales ? `${fmtNum(sales.mtd.orders)} orders` : ''} />
      </div>

      {/* SALES BY PERIOD — switchable table (weeks this month, etc.) */}
      <SalesBreakdown sales={sales} loading={salesLoading} range={salesRange} setRange={setSalesRange} />

      {loading ? (
        <p className="text-[13px] text-ink-mute">Loading…</p>
      ) : !data ? (
        <p className="text-[13px] text-danger">Couldn&rsquo;t load analytics.</p>
      ) : (
        <>
          {/* KPI ROW — order-based only (on-site conversion dropped with the events scan) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <Kpi label="Revenue" value={fmtMoney(k.revenue.value)} d={delta(k.revenue.value, k.revenue.prev)} />
            <Kpi label="Orders" value={fmtNum(k.orders.value)} d={delta(k.orders.value, k.orders.prev)} />
            <Kpi label="AOV" value={fmtMoney(k.aov.value, 2)} d={delta(k.aov.value, k.aov.prev)} />
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

          {/* RAIL MIX (visitor funnel removed with the events scan) */}
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

          {/* SALES BY SOURCE (order-attributed) */}
          <Panel title="Sales by source">
            <Table
              cols={['Source', 'Orders', 'Revenue', 'AOV']}
              rows={data.by_ref.filter((r) => r.paid > 0).map((r) => [r.ref, r.paid, fmtMoney(r.revenue), fmtMoney(r.aov, 2)])}
              empty="No attributed sales yet."
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
                  cols={['Product', 'Revenue', 'Bought']}
                  rows={data.top_products.map((p) => [p.name, fmtMoney(p.revenue), p.purchases])}
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

function SalesBreakdown({ sales, loading, range, setRange }) {
  const ranges = sales?.ranges || [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'last_4_weeks', label: 'Last 4 weeks' },
    { key: 'last_7_days', label: 'Last 7 days' },
    { key: 'ytd', label: 'Year to date' },
  ];
  const buckets = sales?.buckets || [];
  const maxRev = Math.max(1, ...buckets.map((b) => b.revenue));
  const groupLabel = sales?.group === 'month' ? 'Month' : sales?.group === 'day' ? 'Day' : 'Week';
  return (
    <Panel title="Sales by period">
      <div className="flex gap-1 flex-wrap mb-4">
        {ranges.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 text-[12px] rounded-opp border ${range === r.key ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:text-ink'}`}>
            {r.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-[13px] text-ink-mute m-0">Loading…</p>
      ) : !sales || buckets.length === 0 ? (
        <p className="text-[13px] text-ink-mute m-0">No sales in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="opp-meta-mono uppercase text-ink-mute">
                <th className="text-left font-medium py-2 pr-3">{groupLabel}</th>
                <th className="text-right font-medium py-2 px-3">Revenue</th>
                <th className="text-right font-medium py-2 px-3">Orders</th>
                <th className="text-right font-medium py-2 pl-3">AOV</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.key} className="border-t border-line">
                  <td className="py-2.5 pr-3">
                    <div className="text-ink font-semibold">{b.label}</div>
                    {b.sub && <div className="opp-meta-mono text-ink-mute">{b.sub}</div>}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="text-ink font-mono">{fmtMoney(b.revenue)}</div>
                    <div className="mt-1 h-1 rounded-full bg-line overflow-hidden ml-auto" style={{ maxWidth: 120 }}>
                      <div className="h-full rounded-full" style={{ width: `${(b.revenue / maxRev) * 100}%`, background: C.accent }} />
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-ink-soft">{fmtNum(b.orders)}</td>
                  <td className="py-2.5 pl-3 text-right font-mono text-ink-soft">{fmtMoney(b.aov, 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line">
                <td className="py-2.5 pr-3 text-ink font-semibold">Total</td>
                <td className="py-2.5 px-3 text-right font-mono text-ink font-semibold">{fmtMoney(sales.totals.revenue)}</td>
                <td className="py-2.5 px-3 text-right font-mono text-ink font-semibold">{fmtNum(sales.totals.orders)}</td>
                <td className="py-2.5 pl-3 text-right font-mono text-ink-soft">{fmtMoney(sales.totals.aov, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="opp-meta-mono text-ink-mute mt-4 pt-3 border-t border-line leading-relaxed">
        Paid orders bucketed by Pacific-time date. Independent of the range selector up top.
      </p>
    </Panel>
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
  // Other 50/50 ventures (GymThingz) join the pot before tax and the split.
  const ventures = Array.isArray(t.ventures) ? t.ventures : [];
  const multi = ventures.length > 0;
  const lines = [
    { label: multi ? 'Syngyn gross revenue' : 'Gross revenue', val: t.gross, strong: true },
    { label: cogsLabel, val: -t.deductions.cogs },
    { label: `Shipping · ${rate(t.rates.shipping)}`, val: -t.deductions.shipping },
    { label: 'Processing fees · by rail', val: -t.deductions.processing },
    { label: `Affiliate commissions · ${rate(t.rates.commission)}`, val: -t.deductions.commissions },
    { label: `Operating overhead · ${rate(t.rates.ops)}`, val: -t.deductions.ops },
    { label: `${multi ? 'Syngyn pre-tax net' : 'Pre-tax net'} · ${fmtPct(t.preTaxMarginPct)} margin`, val: t.preTaxNet, strong: true, total: !multi },
    ...ventures.map((v) => ({
      label: `${v.name} net · on ${fmtMoney(v.gross)} gross, ${v.orders} order${v.orders === 1 ? '' : 's'}`,
      val: v.preTaxNet, strong: true,
    })),
    ...(multi ? [{ label: `Combined pre-tax net · ${fmtPct(t.combinedPreTaxMarginPct)} margin`, val: t.combinedPreTax, strong: true, total: true }] : []),
  ];
  return (
    <Panel title="Pre-tax net — after restocks, before taxes & owner split">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Kpi label="Pre-tax net" value={fmtMoney(t.combinedPreTax)} d={null} sub={`${fmtPct(multi ? t.combinedPreTaxMarginPct : t.preTaxMarginPct)} pre-tax margin`} />
        <div className="card-premium p-4" style={{ borderColor: C.gold }}>
          <div className="opp-meta-mono uppercase text-ink-mute">Combined gross</div>
          <div className="font-display font-semibold tracking-display text-2xl mt-1 leading-none" style={{ color: C.gold }}>{fmtMoney(t.combinedGross)}</div>
          <div className="opp-meta-mono mt-1.5 text-ink-mute">{multi ? `Syngyn + ${ventures.map((v) => v.name).join(' + ')}` : 'Syngyn'} · last {days}d paid</div>
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
        Planning estimate on the last {days}d of <strong className="text-ink-soft">paid Syngyn orders</strong>{multi ? <> + <strong className="text-ink-soft">paid GymThingz orders</strong> (live feed; real commission $ + rail mix, apparel COGS/shipping rates)</> : ''}. Restock/COGS uses real per-SKU vendor cost; processing fees use the actual rail mix; shipping, commissions &amp; overhead are tunable assumptions (SOB margin model) in <span className="text-ink-soft">takehome-config.js</span>. <strong className="text-ink-soft">Taxes and the owner split are deliberately not modeled</strong> (7/12: per-owner rates differ and the OPP/GymThingz splits differ — allocate from this pre-tax pot with Jason). Not accounting.
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
