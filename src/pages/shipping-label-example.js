import SEO from '../components/SEO';
import { BRAND } from '../lib/brand';

// Public shipping-label example. Serves as the shipping_label_url evidence for
// MCC-5169 / payment pre-vet review (linked in the footer): a representative
// outbound label whose contents line frames the parcel as analytical reference
// materials for research use only. Brand-rendered mock — no OPP imagery.
export default function ShippingLabelExample() {
  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO
        title="Shipping Label Example"
        description={`Representative ${BRAND.name} outbound shipping label — parcels are described as analytical reference materials for research use only, in plain packaging with no product claims.`}
        path="/shipping-label-example"
      />
      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Documentation</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Shipping Label Example
        </h1>
        <p className="text-ink-soft text-sm m-0">
          Representative outbound parcel label — research-use contents framing
        </p>
      </div>

      <div className="max-w-narrow mx-auto pt-12">
        {/* Representative shipping label */}
        <div className="mx-auto max-w-md bg-paper text-ink border-2 border-ink rounded-md overflow-hidden font-mono text-[12px] leading-snug">
          <div className="flex items-center justify-between px-4 py-2 bg-ink text-paper">
            <span className="font-display font-semibold tracking-[0.1em] text-sm">{BRAND.name.toUpperCase()}</span>
            <span className="tracking-[0.18em] text-[11px]">USPS · PRIORITY</span>
          </div>

          <div className="px-4 py-3 border-b border-dashed border-ink/40">
            <div className="opp-meta-mono text-[10px] text-ink-mute mb-0.5">FROM</div>
            <div>{BRAND.name}</div>
            <div>20 Paso del Rio</div>
            <div>Carmel Valley, CA 93924</div>
          </div>

          <div className="px-4 py-3 border-b border-dashed border-ink/40">
            <div className="opp-meta-mono text-[10px] text-ink-mute mb-0.5">SHIP TO</div>
            <div>Research Recipient</div>
            <div>Laboratory / Institution</div>
            <div>123 Example Way, Suite 100</div>
            <div>Anytown, ST 00000</div>
          </div>

          {/* barcode + tracking */}
          <div className="px-4 py-3 border-b border-dashed border-ink/40">
            <div
              className="h-12 w-full"
              aria-hidden="true"
              style={{
                background:
                  'repeating-linear-gradient(90deg, var(--ink) 0 2px, transparent 2px 4px, var(--ink) 4px 5px, transparent 5px 9px, var(--ink) 9px 12px, transparent 12px 14px)',
              }}
            />
            <div className="tracking-[0.15em] text-center mt-1.5">9400&nbsp;1000&nbsp;0000&nbsp;0000&nbsp;0000&nbsp;00</div>
          </div>

          <div className="px-4 py-3">
            <div className="opp-meta-mono text-[10px] text-ink-mute mb-0.5">CONTENTS</div>
            <div className="leading-relaxed">
              Analytical reference materials — for in-vitro research use only.
              Not for human or animal consumption, therapeutic, clinical, or diagnostic use.
            </div>
          </div>
        </div>

        <p className="opp-meta-mono text-[10px] text-ink-mute text-center mt-4 max-w-md mx-auto leading-relaxed">
          Representative example. Every shipment is described as analytical reference materials for research use
          only; outer packaging is plain with no product names, imagery, or claims. Each item inside carries its
          lot number and a QR code to that lot&apos;s{' '}
          <a className="text-accent-strong hover:underline" href="/coa/glp3-10mg/260430">Certificate of Analysis</a>.
        </p>
      </div>
    </div>
  );
}
