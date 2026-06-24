import { Icon } from './Primitives';

// Unified payment-method selector. The CARD tile is the prominent, full-width
// primary (our durable rail) and sits on top; the remaining rails sit in a row
// beneath it. Crypto/Zelle show the alt-pay discount as a cheaper price + a SAVE
// badge — a perk, not a caveat. If card isn't available, all rails render in the
// row grid (no prominent tile).
//
// Props:
//   methods      [{ key, label, price, perk?, sub? }]
//   activeMethod  string — currently selected rail key
//   onSelect      (key) => void
export default function PaymentMethodTiles({ methods, activeMethod, onSelect }) {
  const card = methods.find((m) => m.key === 'card');
  const rest = methods.filter((m) => m.key !== 'card');

  const tile = (m, big = false) => {
    const active = activeMethod === m.key;
    return (
      <button
        key={m.key}
        type="button"
        onClick={() => onSelect(m.key)}
        className={`relative w-full text-left rounded-opp-lg border-2 transition ${big ? 'p-5' : 'p-3.5'} ${active ? 'border-accent-strong bg-accent-soft' : 'border-line bg-surface hover:border-ink-mute'}`}
        aria-pressed={active}
      >
        {m.perk && (
          <span className="absolute top-2 right-2.5 opp-meta-mono text-[9px] text-success font-semibold">{m.perk}</span>
        )}
        <div className={`flex items-center gap-1.5 text-ink font-semibold ${big ? 'text-base' : 'text-sm'}`}>
          {active && <Icon name="check" size={big ? 16 : 14} className="text-accent-strong" />}
          {m.label}
        </div>
        <div className={`opp-meta-mono mt-1 text-ink-soft ${big ? 'text-sm' : ''}`}>${m.price.toFixed(2)}</div>
        {big && (
          <div className="opp-meta-mono text-[10px] text-ink-mute mt-1">
            Visa · Mastercard · Amex · Discover · Apple&nbsp;Pay · Google&nbsp;Pay
          </div>
        )}
        {m.sub && <div className="text-[10px] text-ink-mute mt-0.5 leading-tight">{m.sub}</div>}
      </button>
    );
  };

  return (
    <div className="mb-5 flex flex-col gap-2.5">
      {card && tile(card, true)}
      {rest.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {rest.map((m) => tile(m))}
        </div>
      )}
    </div>
  );
}
