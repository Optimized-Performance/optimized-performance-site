// Prominent "save with crypto/Zelle" callout. Rendered in two spots on the
// checkout (header banner + under the order summary) to push volume toward the
// un-freezable rails. `amount` is the dollar savings on the current cart.
export default function AltPaySaveBanner({ pct, amount, label, className = '' }) {
  return (
    <div className={`rounded-opp-lg border-2 border-accent-strong bg-accent-soft px-5 py-4 text-center ${className}`}>
      <div className="font-display font-semibold tracking-display text-accent-strong text-[clamp(18px,2.2vw,24px)] leading-tight">
        Save {pct}% with {label}
      </div>
      <div className="opp-meta-mono text-accent-strong mt-1.5">
        {amount > 0 ? `−$${amount.toFixed(2)} on this order` : `Extra ${pct}% off`} when you pay by {label.toLowerCase()}
      </div>
    </div>
  );
}
