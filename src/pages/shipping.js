import SEO from '../components/SEO';

export default function ShippingReturns() {
  return (
    <div className="min-h-[60vh]">
      <SEO
        title="Shipping & Returns"
        description="Optimized Performance shipping policy — processing times, carriers, tracking, and return policy for research peptide orders."
        path="/shipping"
      />
      <div className="bg-brand-navy py-14 px-6 text-center">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-brand-cyan uppercase mb-2">Policies</p>
        <h1 className="text-3xl font-heading font-bold text-brand-cream mb-2">Shipping & Returns</h1>
        <p className="text-sm text-brand-muted">Fast, discrete shipping on all orders</p>
      </div>

      <div className="max-w-narrow mx-auto px-6 py-12">
        <div className="card-premium p-8 md:p-10">

          <Section title="Order Processing">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-platinum leading-relaxed">
              <li>Orders are processed and shipped within <strong className="text-brand-cream">1 business day</strong> of payment confirmation.</li>
              <li>Orders placed on weekends or holidays will be processed the next business day.</li>
              <li>You will receive a shipping confirmation email with tracking information once your order ships.</li>
            </ul>
          </Section>

          <Section title="Shipping Methods & Delivery">
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-3 bg-brand-navy text-brand-cream text-[11px] uppercase tracking-wide">Method</th>
                    <th className="text-left p-3 bg-brand-navy text-brand-cream text-[11px] uppercase tracking-wide">Estimated Delivery</th>
                    <th className="text-left p-3 bg-brand-navy text-brand-cream text-[11px] uppercase tracking-wide">Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/[0.06]">
                    <td className="p-3 text-brand-cream font-medium">Standard Shipping</td>
                    <td className="p-3 text-brand-platinum">3–5 business days</td>
                    <td className="p-3 text-brand-platinum">USPS Priority Mail</td>
                  </tr>
                  <tr className="border-b border-white/[0.06]">
                    <td className="p-3 text-brand-cream font-medium">Expedited Shipping</td>
                    <td className="p-3 text-brand-platinum">1–2 business days</td>
                    <td className="p-3 text-brand-platinum">USPS Priority Mail Express (when available)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-platinum leading-relaxed">
              <li>All orders ship from within the United States.</li>
              <li>We currently ship to <strong className="text-brand-cream">US addresses only</strong>.</li>
              <li>Shipping times are estimates and not guaranteed.</li>
            </ul>
          </Section>

          <Section title="Packaging">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-platinum leading-relaxed">
              <li>All orders are shipped in <strong className="text-brand-cream">discrete, unbranded packaging</strong>.</li>
              <li>Lyophilized products are packaged to maintain stability during transit.</li>
              <li>Products requiring cold chain shipping will include appropriate insulation.</li>
            </ul>
          </Section>

          <Section title="Tracking Your Order">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-platinum leading-relaxed">
              <li>Tracking numbers are provided via email once your order ships.</li>
              <li>Track your package through the USPS website using the tracking number provided.</li>
              <li>If you have not received tracking within 2 business days, please contact us.</li>
            </ul>
          </Section>

          <Section title="Returns & Refunds">
            <p className="text-sm text-brand-platinum leading-relaxed mb-3">Due to the nature of our products, we have a limited return policy:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-platinum leading-relaxed">
              <li><strong className="text-brand-cream">Damaged or defective products:</strong> Contact us within 48 hours of delivery with photos.</li>
              <li><strong className="text-brand-cream">Incorrect items:</strong> Contact us within 48 hours. We will ship the correct item at no charge.</li>
              <li><strong className="text-brand-cream">Missing packages:</strong> Contact us within 72 hours if tracking shows delivered but not received.</li>
              <li><strong className="text-brand-cream">Change of mind:</strong> All sales are final once shipped.</li>
              <li><strong className="text-brand-cream">Opened products:</strong> Cannot be returned for safety and integrity reasons.</li>
            </ul>
          </Section>

          <Section title="Refund Processing">
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-brand-platinum leading-relaxed">
              <li>Approved refunds are processed within 3–5 business days.</li>
              <li>Refunds are issued to the original payment method (USDC via MoonPay).</li>
              <li>MoonPay processing fees are non-refundable.</li>
            </ul>
          </Section>

          <Section title="Contact Us">
            <p className="text-sm text-brand-platinum leading-relaxed mb-2">
              For any shipping or returns questions, contact us at:<br />
              <strong className="text-brand-cyan">contact@optimizedperformanceinc.com</strong>
            </p>
            <p className="text-sm text-brand-platinum leading-relaxed">
              Please include your order number and a description of the issue. We aim to respond within 24 hours.
            </p>
          </Section>

          <div className="mt-8 p-4 bg-brand-dark/50 rounded-lg border border-red-500/10 text-center">
            <p className="text-[11px] text-red-500/60 font-medium leading-relaxed">
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
  return (
    <section className="mb-8">
      <h2 className="text-base font-heading font-bold text-brand-cream mb-3">{title}</h2>
      {children}
    </section>
  );
}
