import SEO from '../components/SEO';

export default function TermsOfService() {
  const lastUpdated = 'April 4, 2026';
  const companyName = 'Optimized Performance Inc.';
  const contactEmail = 'admin@optimizedperformancepeptides.com';
  const contactPhone = '+1 (831) 218-5147';
  const contactPhoneHref = '+18312185147';
  const siteUrl = 'optimizedperformancepeptides.com';

  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO title="Terms of Service" description="Optimized Performance terms of service — research use only disclaimer, ordering terms, and policies." path="/terms" />

      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Legal</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Terms of Service
        </h1>
        <p className="text-ink-soft text-sm m-0">Last updated: {lastUpdated}</p>
      </div>

      <div className="max-w-narrow mx-auto pt-12">
        <div className="card-premium p-8 md:p-12">
          <section className="mb-8">
            <p className="text-sm text-ink-soft leading-relaxed">
              Welcome to {siteUrl} (the &ldquo;Site&rdquo;), operated by {companyName} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
              By accessing or using this Site, placing an order, or purchasing any product, you agree to be bound by
              these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms, do not use this Site.
            </p>
          </section>

          <Section title="1. Research Use Only">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              <strong className="text-ink">All products sold on this Site are strictly for in-vitro research and laboratory use only.</strong> Products
              are not intended for human consumption, veterinary use, therapeutic use, or any diagnostic purpose.
            </p>
            <p className="text-sm text-ink-soft leading-relaxed mb-3">By purchasing, you represent and warrant that:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed">
              <li>You are purchasing products solely for legitimate research purposes</li>
              <li>You will not use, administer, or distribute products for human or animal consumption</li>
              <li>You understand and accept the research-use-only nature of all products</li>
              <li>You will comply with all applicable laws regarding purchase, handling, and use of research compounds</li>
            </ul>
          </Section>

          <Section title="2. Eligibility">
            <p className="text-sm text-ink-soft leading-relaxed">
              You must be at least 21 years of age to purchase products. By placing an order, you
              confirm that you meet this age requirement. We reserve the right to refuse service to anyone.
            </p>
          </Section>

          <Section title="3. Product Information and Accuracy">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              We make reasonable efforts to ensure product descriptions are accurate. All products are provided
              &ldquo;as is&rdquo; for research purposes.
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">
              Certificates of Analysis (COAs) are available upon request and reflect testing by independent
              third-party laboratories. Results are specific to the batch tested.
            </p>
          </Section>

          <Section title="4. Orders, Pricing, and Payment">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              All prices are in U.S. dollars and subject to change without notice.
            </p>
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              Payments are processed through third-party payment processors. By completing a purchase, you agree to the applicable processor&apos;s terms of service.
              We do not store or have access to your full payment card or banking information.
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">
              See our <a href="/shipping#returns-refunds" className="text-accent-strong hover:underline">Returns &amp; Refunds policy</a> for the full refund process. We strongly prefer direct refund requests over card disputes — direct refunds are faster, simpler, and don&apos;t involve your bank.
            </p>
          </Section>

          <Section title="5. Shipping and Delivery">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              Orders are processed and shipped within 1-2 business days. Estimated delivery times are
              not guaranteed. {companyName} is not responsible for carrier delays.
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">
              Risk of loss and title pass to you upon delivery to the carrier. All shipments include
              discrete packaging.
            </p>
          </Section>

          <Section title="6. Returns, Refunds, and Cancellations">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              All sales are final. We do not accept returns on opened products. For damaged or incorrect products,
              contact us within 7 days at{' '}
              <a href={`mailto:${contactEmail}`} className="text-accent-strong hover:underline">{contactEmail}</a> with
              photos and your order number.
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">
              Orders may be cancelled prior to shipment. Once shipped, orders cannot be cancelled.
            </p>
          </Section>

          <Section title="7. Limitation of Liability">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              To the maximum extent permitted by law, {companyName} shall not be liable for any indirect,
              incidental, special, or consequential damages arising from your use of this Site or purchase of products.
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">
              Total liability shall not exceed the amount you paid for the specific product giving rise to the claim.
            </p>
          </Section>

          <Section title="8. Indemnification">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              You agree to indemnify and hold harmless {companyName} from claims arising from:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed">
              <li>Your use of any product purchased from this Site</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any applicable law or regulation</li>
              <li>Any misuse, mishandling, or improper storage of products</li>
              <li>Any third-party claim related to your use of our products</li>
            </ul>
          </Section>

          <Section title="9. Intellectual Property">
            <p className="text-sm text-ink-soft leading-relaxed">
              All content on this Site is the property of {companyName} and is protected by intellectual property laws.
              You may not reproduce, distribute, or create derivative works without our prior written consent.
            </p>
          </Section>

          <Section title="10. Prohibited Uses">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">You agree not to use this Site or products to:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed mb-3">
              <li>Manufacture products for human or animal consumption</li>
              <li>Resell products as drugs, supplements, or therapeutic agents</li>
              <li>Make health, medical, or therapeutic claims about our products</li>
              <li>Violate any federal, state, or local law</li>
              <li>Engage in fraudulent activity</li>
            </ul>
            <p className="text-sm text-ink-soft leading-relaxed">
              Violations may result in order cancellation and referral to law enforcement.
            </p>
          </Section>

          <Section title="11. Disclaimer of Warranties">
            <p className="text-sm text-ink-soft leading-relaxed">
              Products are provided &ldquo;as is&rdquo; without warranties of any kind, including implied warranties
              of merchantability or fitness for a particular purpose.
            </p>
          </Section>

          <Section title="12. Governing Law">
            <p className="text-sm text-ink-soft leading-relaxed">
              These Terms shall be governed by the laws of the State in which {companyName} is incorporated.
              Disputes shall be resolved through binding arbitration per the American Arbitration Association rules.
            </p>
          </Section>

          <Section title="13. Modifications to Terms">
            <p className="text-sm text-ink-soft leading-relaxed">
              We reserve the right to modify these Terms at any time. Changes will be posted with a revised date.
              Continued use of the Site constitutes acceptance of updated Terms.
            </p>
          </Section>

          <Section title="14. Severability">
            <p className="text-sm text-ink-soft leading-relaxed">
              If any provision of these Terms is found unenforceable, it shall be limited to the minimum extent
              necessary, and remaining provisions shall remain in full force.
            </p>
          </Section>

          <Section title="15. Contact Us">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              Questions about these Terms? Contact us:
            </p>
            <div className="bg-surfaceAlt border border-line rounded-opp p-5">
              <p className="text-sm text-ink font-medium mb-1 m-0">{companyName}</p>
              <p className="text-sm text-ink-soft mb-1 m-0">
                Email: <a href={`mailto:${contactEmail}`} className="text-accent-strong hover:underline">{contactEmail}</a>
              </p>
              <p className="text-sm text-ink-soft mb-1 m-0">
                Phone: <a href={`tel:${contactPhoneHref}`} className="text-accent-strong hover:underline font-mono">{contactPhone}</a>
              </p>
              <p className="text-sm text-ink-soft m-0">
                Website: <a href={`https://${siteUrl}`} className="text-accent-strong hover:underline">{siteUrl}</a>
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="font-display font-semibold tracking-display text-[22px] leading-snug mb-3 pb-2 border-b border-line text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}
