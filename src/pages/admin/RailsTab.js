import { useEffect, useState } from 'react';

// Payment-rail orchestration dashboard. Shows per-rail MTD/DTD utilization vs.
// cap and lets you tune caps live (no deploy) as each rail proves what it
// survives. See docs/rail-orchestration-spec.md.
export default function RailsTab({ showSaveMsg, token }) {
  const [rails, setRails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({}); // rail -> { monthly_cap?, daily_cap? }

  useEffect(() => { fetchRails(); }, []);

  function authHeaders() {
    return { 'Content-Type': 'application/json', 'x-admin-token': token || '' };
  }

  async function fetchRails() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/rails', { headers: authHeaders() });
      if (res.ok) { const d = await res.json(); setRails(d.rails || []); }
    } catch { /* fail */ }
    setLoading(false);
  }

  function fieldVal(r, field) {
    const e = edits[r.rail];
    if (e && e[field] !== undefined) return e[field];
    return r[field] == null ? '' : r[field];
  }
  function setEdit(rail, field, value) {
    setEdits((prev) => ({ ...prev, [rail]: { ...prev[rail], [field]: value } }));
  }
  function isDirty(rail) { return !!edits[rail]; }

  async function patch(rail, body) {
    try {
      const res = await fetch('/api/admin/rails', {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ rail, ...body }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); showSaveMsg(err.error || 'Save failed'); return false; }
      return true;
    } catch { showSaveMsg('Save failed'); return false; }
  }

  async function saveCaps(r) {
    const e = edits[r.rail] || {};
    const ok = await patch(r.rail, { monthly_cap: e.monthly_cap, daily_cap: e.daily_cap });
    if (ok) {
      setEdits((prev) => { const n = { ...prev }; delete n[r.rail]; return n; });
      await fetchRails();
      showSaveMsg(`${r.display_name} caps updated.`);
    }
  }

  async function toggleEnabled(r) {
    const ok = await patch(r.rail, { enabled: !r.enabled });
    if (ok) await fetchRails();
  }

  const fmt = (n) => (n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

  const totalSettled = rails.reduce((s, r) => s + Number(r.mtd || 0), 0);
  const totalInflight = rails.reduce((s, r) => s + Number(r.inflight_mtd || 0), 0);
  const cardMtd = rails.filter((r) => r.rail_type === 'card').reduce((s, r) => s + Number(r.mtd || 0), 0);
  const cardShare = totalSettled > 0 ? Math.round((cardMtd / totalSettled) * 100) : 0;

  return (
    <>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display font-semibold tracking-display text-xl m-0 text-ink">Payment Rails</h2>
          <p className="opp-meta-mono mt-1 m-0">Throttle card volume; route overflow to uncapped crypto/Zelle. Caps tune live.</p>
        </div>
        <button className="btn-outline text-xs px-4 py-2" onClick={fetchRails}>Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
        <Stat value={fmt(totalSettled)} label="MTD settled (all rails)" />
        <Stat value={fmt(totalInflight)} label="In-flight (pending)" tone="warn" />
        <Stat value={fmt(cardMtd)} label="MTD on card rails" />
        <Stat value={`${cardShare}%`} label="Card share of volume" tone={cardShare > 55 ? 'warn' : 'success'} />
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="card-premium text-center py-12"><p className="text-sm text-ink-mute m-0">Loading…</p></div>
        ) : rails.length === 0 ? (
          <div className="card-premium text-center py-12">
            <p className="text-[15px] text-ink-soft m-0">No rails configured</p>
            <p className="opp-meta-mono mt-1 m-0">Run migration v22 (rail_config seed) to populate.</p>
          </div>
        ) : (
          rails.map((r) => {
            const uncapped = r.monthly_cap == null;
            const pct = uncapped ? 0 : Math.min(100, Math.round((Number(r.mtd || 0) / Number(r.monthly_cap)) * 100));
            const barColor = uncapped ? 'bg-success' : pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-success';
            return (
              <div key={r.rail} className="card-premium p-5">
                <div className="flex justify-between items-start gap-4 flex-wrap mb-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="font-semibold text-ink text-[15px]">{r.display_name}</div>
                      <div className="opp-meta-mono mt-0.5">
                        <span className="font-mono">{r.rail}</span> · {r.rail_type}
                      </div>
                    </div>
                    <StatusPill r={r} uncapped={uncapped} />
                  </div>
                  <button
                    onClick={() => toggleEnabled(r)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                      r.enabled ? 'bg-success/10 text-success border-success/30' : 'bg-danger/10 text-danger border-danger/30'
                    }`}
                  >
                    {r.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                {/* Utilization bar */}
                <div className="mb-3">
                  <div className="flex justify-between opp-meta-mono mb-1">
                    <span>MTD {fmt(r.mtd)}{!uncapped && ` / ${fmt(r.monthly_cap)} (${pct}%)`}</span>
                    <span>{uncapped ? 'UNCAPPED' : `${fmt(r.remaining_monthly)} left`}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surfaceAlt overflow-hidden">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: uncapped ? '100%' : `${pct}%` }} />
                  </div>
                  <div className="flex gap-4 opp-meta-mono mt-1.5">
                    <span>Today: {fmt(r.dtd)}{r.daily_cap != null && ` / ${fmt(r.daily_cap)}`}</span>
                    {Number(r.inflight_mtd) > 0 && <span className="text-warning">In-flight: {fmt(r.inflight_mtd)}</span>}
                  </div>
                </div>

                {/* Editable caps */}
                <div className="flex items-end gap-3 flex-wrap pt-3 border-t border-line">
                  <CapField label="Monthly cap ($)" value={fieldVal(r, 'monthly_cap')} onChange={(v) => setEdit(r.rail, 'monthly_cap', v)} placeholder="uncapped" />
                  <CapField label="Daily cap ($)" value={fieldVal(r, 'daily_cap')} onChange={(v) => setEdit(r.rail, 'daily_cap', v)} placeholder="auto (1/30 ×1.5)" />
                  <button
                    className="btn-primary text-xs px-4 py-2 disabled:opacity-40"
                    disabled={!isDirty(r.rail)}
                    onClick={() => saveCaps(r)}
                  >
                    Save
                  </button>
                </div>
                {r.notes && <p className="opp-meta-mono text-ink-mute mt-2 m-0">{r.notes}</p>}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function StatusPill({ r, uncapped }) {
  if (!r.enabled) return <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-danger/10 text-danger border border-danger/30">Off</span>;
  if (uncapped) return <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/30">Release valve</span>;
  if (r.available) return <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/30">Available</span>;
  return <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-danger/10 text-danger border border-danger/30">At capacity</span>;
}

function CapField({ label, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">{label}</span>
      <input
        type="number" min="0" step="1000"
        className="input-field w-40"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
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
