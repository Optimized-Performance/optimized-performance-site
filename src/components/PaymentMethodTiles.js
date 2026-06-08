import { Icon } from './Primitives';

// Unified payment-method selector. Every available rail is presented as an
// equal, card-grade tile (no primary-card-button vs. demoted-outline-alt
// hierarchy, which signaled the alt rails as a sketchy side-door). Crypto and
// Zelle show the alt-pay discount as a cheaper price + a SAVE badge — a perk, not a caveat.
//
// Props:
//   methods      [{ key, label, price, perk?, sub? }]
//   activeMethod  string — currently selected rail key
//   onSelect      (key) => void
export default function PaymentMethodTiles({ methods, activeMethod, onSelect }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
      {methods.map((m) => {
        const active = activeMethod === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSelect(m.key)}
            className={`relative text-left rounded-opp-lg border-2 p-3.5 transition ${active ? 'border-accent-strong bg-accent-soft' : 'border-line bg-surface hover:border-ink-mute'}`}
            aria-pressed={active}
          >
            {m.perk && (
              <span className="absolute top-2 right-2.5 opp-meta-mono text-[9px] text-success font-semibold">{m.perk}</span>
            )}
            <div className="flex items-center gap-1.5 text-ink font-semibold text-sm">
              {active && <Icon name="check" size={14} className="text-accent-strong" />}
              {m.label}
            </div>
            <div className="opp-meta-mono mt-1 text-ink-soft">${m.price.toFixed(2)}</div>
            {m.sub && <div className="text-[10px] text-ink-mute mt-0.5 leading-tight">{m.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}
