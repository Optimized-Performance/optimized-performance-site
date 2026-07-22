import SEO from '../components/SEO';

export default function ShippingReturns() {
  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO
        title="Shipping & Returns"
        description="Syngyn shipping policy — processing times, carriers, tracking, and return policy for research peptide orders."
        path="/shipping"
      />

      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Policies</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Shipping &amp; Returns
        </h1>
        <p className="text-ink-soft text-sm m-0">Fast, protected, carrier-tracked shipping on all orders.</p>
      </div>

      <div className="max-w-narrow mx-auto pt-12">
        <div className="card-premium p-8 md:p-12">
          <Section title="Order Processing">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li>Orders are processed and shipped within <strong className="text-ink">1 business day</strong> of payment confirmation.</li>
              <li>Orders placed on weekends or holidays will be processed the next business day.</li>
              <li>You will receive a shipping confirmation email with tracking information once your order ships.</li>
            </ul>
          </Section>

          <Section title="Shipping Methods & Delivery">
            <div className="overflow-x-auto mb-4 border border-line rounded-opp-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surfaceAlt">
                    <th className="text-left px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">Method</th>
                    <th className="text-left px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">Cost</th>
                    <th className="text-left px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">Estimated Delivery</th>
                    <th className="text-left px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line">
                    <td className="px-4 py-3 text-ink font-medium">Ground</td>
                    <td className="px-4 py-3 text-ink-soft font-mono">$9.95</td>
                    <td className="px-4 py-3 text-ink-soft">4–5 business days</td>
                    <td className="px-4 py-3 text-ink-soft">UPS Ground · insulated mailer + ice pack · FREE on orders $250+</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="px-4 py-3 text-ink font-medium">2-Day</td>
                    <td className="px-4 py-3 text-ink-soft font-mono">$17.95</td>
                    <td className="px-4 py-3 text-ink-soft">2 business days</td>
                    <td className="px-4 py-3 text-ink-soft">UPS 2nd Day Air · insulated mailer + ice pack</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="px-4 py-3 text-ink font-medium">Overnight</td>
                    <td className="px-4 py-3 text-ink-soft font-mono">$59.95</td>
                    <td className="px-4 py-3 text-ink-soft">Next business day</td>
                    <td className="px-4 py-3 text-ink-soft">UPS Next Day Air · insulated mailer + ice pack</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li>Choose your speed at checkout — <strong className="text-ink">every order ships in an insulated mailer with an ice pack</strong> regardless of tier.</li>
              <li><strong className="text-ink">Free Ground shipping on orders $250+</strong> (after any affiliate or promo discount). Free shipping applies to the Ground tier; 2-Day and Overnight are always at their listed rate.</li>
              <li>Where UPS doesn&apos;t serve the selected speed to your address, we ship the equivalent USPS service (Priority / Priority Express) at the same rate.</li>
              <li>All orders ship from within the United States.</li>
              <li>We ship to <strong className="text-ink">US and Canadian addresses</strong>.</li>
              <li>Shipping times are estimates and not guaranteed.</li>
            </ul>
          </Section>

          <Section title="Shipping to Canada">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li><strong className="text-ink">Flat $50 international shipping</strong> on all Canadian orders, regardless of order size. The free-shipping threshold and promotional shipping offers do not apply to international orders.</li>
              <li>Canadian orders can be paid by <strong className="text-ink">card or crypto</strong>.</li>
              <li><strong className="text-ink">Customs, duties, and import risk are entirely the customer&apos;s responsibility.</strong> Cross-border shipments may be delayed, inspected, held, or seized by customs or border authorities. We have no control over, and assume no responsibility for, customs processing in any form.</li>
              <li><strong className="text-ink">No refunds or replacements for customs-related loss.</strong> By placing a Canadian order you expressly acknowledge and agree — via a required checkbox at checkout — that no refund, replacement, or credit will be issued for any order that is delayed, held, or seized by customs or otherwise fails to clear the border, and you waive any right to a refund or chargeback on that basis. Ordering across the border is entirely at your own risk.</li>
              <li>Any duties, taxes, or brokerage fees assessed by Canadian authorities are the customer&apos;s sole responsibility.</li>
            </ul>
          </Section>

          <Section title="Packaging & Cold Chain">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li>All orders are shipped in <strong className="text-ink">plain, protective packaging</strong> appropriate for laboratory materials, with carrier tracking.</li>
              <li>Orders ship in an <strong className="text-ink">insulated thermal mailer</strong> built for short-transit temperature protection. The reflective interior insulation moderates package temperature through the 2-day transit window nationwide.</li>
              <li>Lyophilized peptides are stable for short periods at room temperature, and our packaging plus 2-day service are selected so vials arrive in good condition under typical transit conditions. Once received, vials should be stored at 2–8 °C until reconstitution.</li>
            </ul>
          </Section>

          <Section title="Tracking Your Order">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li>Tracking numbers are provided via email once your order ships.</li>
              <li>Track your package on the carrier&apos;s site (UPS or USPS) using the tracking number provided.</li>
              <li>If you have not received tracking within 2 business days, please contact us.</li>
            </ul>
          </Section>

          <Section title="Returns & Refunds">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              We want every order to land right. The policy below is straightforward — email <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">support@syngyn.co</a> or call <a href="tel:+18312185147" className="text-accent-strong hover:underline font-mono">(831) 218-5147</a> the moment something is off and we&apos;ll work it out.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li><strong className="text-ink">Damaged, defective, or incorrect items:</strong> Contact us within 7 days of delivery with photos. We replace at no charge or issue a full refund — your call.</li>
              <li><strong className="text-ink">Unopened products, change of mind:</strong> Return within 30 days of delivery for a full refund of the product price. You cover return shipping. Original outbound shipping is non-refundable. Items must be unopened with tamper-evident seals intact.</li>
              <li><strong className="text-ink">Missing packages:</strong> Contact us within 72 hours if tracking shows delivered but you haven&apos;t received the package. We file the carrier claim and replace once confirmed lost.</li>
              <li><strong className="text-ink">Opened products:</strong> Cannot be returned for resale due to research-product integrity standards, but if there&apos;s a quality concern (purity, sterility, mislabeling), reach out and we&apos;ll make it right.</li>
            </ul>
          </Section>

          <Section title="Refund Processing">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li>Approved refunds are issued to your original payment method within 3–5 business days of approval.</li>
              <li>Card payments are refunded through our card processor; the credit usually posts to your statement within 5–10 business days after that, depending on your bank.</li>
              <li>Crypto payments are refunded in the original cryptocurrency at the prevailing exchange rate at refund time. Crypto network fees and processor fees are non-refundable.</li>
              <li>If you don&apos;t see your refund within the windows above, email us with your order number and we&apos;ll look it up directly.</li>
            </ul>
          </Section>

          <Section title="Why we'd rather work it out than have you dispute">
            <p className="text-sm text-ink-soft leading-relaxed">
              If something goes wrong with your order — anything at all — please email or call us first. Refunds processed directly are faster (a few days vs. a few weeks for a chargeback), don&apos;t involve your bank, and don&apos;t put us in a bad spot with our payment processor. We&apos;d rather refund you in 24 hours than fight a dispute for 60 days. Reach out and we&apos;ll handle it.
            </p>
          </Section>

          <Section title="Contact Us">
            <p className="text-sm text-ink-soft leading-relaxed mb-2">
              For any shipping or returns questions, contact us:
            </p>
            <div className="bg-surfaceAlt border border-line rounded-opp p-5 mb-3">
              <p className="text-sm text-ink-soft mb-1 m-0">
                Email:{' '}
                <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline font-semibold">
                  support@syngyn.co
                </a>
              </p>
              <p className="text-sm text-ink-soft m-0">
                Phone:{' '}
                <a href="tel:+18312185147" className="text-accent-strong hover:underline font-semibold font-mono">
                  +1 (831) 218-5147
                </a>
              </p>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed">
              Please include your order number and a description of the issue. We aim to respond within 24 hours.
            </p>
          </Section>

          <div className="mt-8 p-4 bg-surfaceAlt border border-line rounded-opp text-center">
            <p className="font-mono text-[11px] text-danger font-medium leading-relaxed m-0">
              All products are sold strictly for in-vitro research and laboratory use only.
              Not for human consumption. Not for veterinary use.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  // Build an anchor id from the title so external links (e.g. /shipping#refunds)
  // can deep-link to specific sections.
  const id = String(title)
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (
    <section id={id} className="mb-8 scroll-mt-24">
      <h2 className="font-display font-semibold tracking-display text-[22px] leading-snug mb-3 pb-2 border-b border-line text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}
