import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar, BarChart,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
  FunnelChart, Funnel, LabelList,
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

const FUNNEL_STEPS = [
  { key: 'visits', label: 'Visits' },
  { key: 'product_viewers', label: 'Viewed product' },
  { key: 'carts', label: 'Added to cart' },
  { key: 'checkouts', label: 'Started checkout' },
  { key: 'orders', label: 'Order created' },
  { key: 'paid', label: 'Paid' },
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
            {/* FUNNEL */}
            <Panel title="Visitor funnel">
              <ResponsiveContainer width="100%" height={230}>
                <FunnelChart>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Funnel dataKey="value" data={FUNNEL_STEPS.map((s, i) => ({ name: s.label, value: f[s.key] || 0, fill: PIE_COLORS[i % PIE_COLORS.length] }))} isAnimationActive>
                    <LabelList position="right" fill={C.inkSoft} stroke="none" dataKey="name" fontSize={12} />
                    <LabelList position="left" fill={C.ink} stroke="none" dataKey="value" fontSize={12} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
              <div className="text-[13px] text-ink-soft mt-2 pt-3 border-t border-line">
                Visit → paid: <strong className="text-ink">{fmtPct(f.visits ? Math.round((f.paid / f.visits) * 1000) / 10 : null)}</strong>
              </div>
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
