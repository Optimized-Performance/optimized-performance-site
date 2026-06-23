import SEO from '../components/SEO';

export default function PrivacyPolicy() {
  const lastUpdated = 'May 7, 2026';
  const companyName = 'Syngyn';
  const contactEmail = 'support@syngyn.co';
  const contactPhone = '+1 (831) 218-5147';
  const contactPhoneHref = '+18312185147';
  const siteUrl = 'syngyn.co';

  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO title="Privacy Policy" description="Syngyn privacy policy — how we collect, use, and protect your data." path="/privacy" />

      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Legal</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Privacy Policy
        </h1>
        <p className="text-ink-soft text-sm m-0">Last updated: {lastUpdated}</p>
      </div>

      <div className="max-w-narrow mx-auto pt-12">
        <div className="card-premium p-8 md:p-12">
          <section className="mb-8">
            <p className="text-sm text-ink-soft leading-relaxed">
              {companyName} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates {siteUrl} (the &ldquo;Site&rdquo;). This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you visit our Site or make a purchase.
              Please read this policy carefully. By using the Site, you consent to the practices described herein.
            </p>
          </section>

          <Section title="1. Information We Collect">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">We may collect the following types of information:</p>
            <Subsection title="Personal Information You Provide">
              <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed">
                <li>Name and shipping address</li>
                <li>Email address</li>
                <li>Phone number (if provided)</li>
                <li>Order history and preferences</li>
              </ul>
            </Subsection>
            <Subsection title="Payment Information">
              <p className="text-sm text-ink-soft leading-relaxed">
                We do not directly collect or store payment card or bank information. All payment processing is
                handled by third-party payment service providers — a PCI-compliant card processor for
                credit/debit card transactions and <strong className="text-ink">NOWPayments</strong> for cryptocurrency
                transactions (when enabled). When you complete a purchase, you are subject to the terms of service
                and privacy policy of the relevant processor. We receive only a confirmation of payment and the
                last four digits of the card used; we do not have access to your full card or bank details.
              </p>
            </Subsection>
            <Subsection title="Automatically Collected Information">
              <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed">
                <li>IP address and approximate location</li>
                <li>Browser type and version</li>
                <li>Pages visited and time spent on the Site</li>
                <li>Referring URLs</li>
                <li>Device type and operating system</li>
              </ul>
            </Subsection>
          </Section>

          <Section title="2. How We Use Your Information">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed mb-3">
              <li>Process and fulfill your orders</li>
              <li>Send order confirmations and shipping notifications</li>
              <li>Respond to customer service inquiries</li>
              <li>Comply with legal obligations</li>
              <li>Improve our Site and product offerings</li>
              <li>Prevent fraud and unauthorized transactions</li>
              <li>Send transactional emails related to your purchases</li>
            </ul>
            <p className="text-sm text-ink-soft leading-relaxed">
              We do not sell, rent, or trade your personal information to third parties for marketing purposes.
            </p>
          </Section>

          <Section title="3. Payment Processing">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              We use third-party payment processors to handle all payment transactions. By completing a purchase,
              you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed mb-3">
              <li>Your payment information is transmitted directly and securely to the processor (a PCI-compliant card processor for cards, NOWPayments for cryptocurrency)</li>
              <li>The processor may require identity verification as part of their regulatory or fraud-prevention obligations</li>
              <li>The processor may collect, store, and process your personal and financial data per their privacy policy</li>
              <li>We receive only a confirmation of payment and partial card metadata (last four digits, BIN); we do not have access to your full card or bank details</li>
            </ul>
            <p className="text-sm text-ink-soft leading-relaxed">
              For questions about how each processor handles your data, review their privacy policies directly.
              Cryptocurrency payments are processed by NOWPayments at{' '}
              <a href="https://nowpayments.io/privacy-policy" className="text-accent-strong hover:underline" target="_blank" rel="noopener noreferrer">
                nowpayments.io/privacy-policy
              </a>.
            </p>
          </Section>

          <Section title="4. Sharing of Information">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">We may share your information with:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed mb-3">
              <li><strong className="text-ink">Payment processors</strong> (our card processor and NOWPayments) — for payment processing and fraud prevention</li>
              <li><strong className="text-ink">Shipping carriers</strong> (USPS, UPS, FedEx) — to fulfill and track your order</li>
              <li><strong className="text-ink">Shipping software</strong> (e.g., ShipCheer) — to generate shipping labels and tracking</li>
              <li><strong className="text-ink">Email and SMS service providers</strong> (SendGrid, Twilio) — to send transactional notifications</li>
              <li><strong className="text-ink">Hosting and database providers</strong> (Vercel, Supabase) — to operate the Site</li>
              <li><strong className="text-ink">Law enforcement</strong> — when required by law or to protect our legal rights</li>
            </ul>
            <p className="text-sm text-ink-soft leading-relaxed">
              We do not sell, rent, or trade your personal information, and we do not share it with any other
              third parties for marketing purposes.
            </p>
          </Section>

          <Section title="5. Cookies and Tracking Technologies">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              We use a small number of first-party cookies to operate the Site. We do not use cookies for
              advertising, behavioral tracking, or selling information to third parties. The cookies we set are:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed mb-3">
              <li><strong className="text-ink">opp_cohort</strong> — signed cookie (90-day expiry) that records access to the full product catalog when you arrive via a referral or invitation link. Required for the Site to remember your access between visits.</li>
              <li><strong className="text-ink">opp_ref</strong> — readable cookie (90-day expiry) that records the affiliate code from a referral link so commission attribution and discounts apply correctly at checkout.</li>
              <li><strong className="text-ink">opp_age_ack</strong> — localStorage entry recording that you confirmed you are 21 or older. Required for compliance with our age policy.</li>
              <li><strong className="text-ink">opp_sid</strong> — anonymous first-party identifier (1-year expiry) used only to measure our own site funnel (e.g. how many visitors reach checkout). Not linked to your identity while browsing, not shared with any third party, and never used for advertising.</li>
              <li><strong className="text-ink">Session cookies</strong> for the admin and affiliate dashboards (only set if you log into those).</li>
            </ul>
            <p className="text-sm text-ink-soft leading-relaxed">
              You may disable or delete cookies through your browser settings. Doing so may prevent referral
              attribution and require you to re-acknowledge the age gate on each visit, but will not otherwise
              affect your ability to browse or purchase.
            </p>
          </Section>

          <Section title="6. Data Retention">
            <p className="text-sm text-ink-soft leading-relaxed">
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this
              policy. Order records are typically retained for a minimum of 7 years for tax and accounting purposes.
            </p>
          </Section>

          <Section title="7. Data Security">
            <p className="text-sm text-ink-soft leading-relaxed">
              We implement industry-standard security measures including SSL/TLS encryption for data in transit.
              However, no method of transmission over the internet is 100% secure.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-ink-soft leading-relaxed mb-3">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of certain data processing activities</li>
            </ul>
            <p className="text-sm text-ink-soft leading-relaxed">
              To exercise any of these rights, contact us at <a href={`mailto:${contactEmail}`} className="text-accent-strong hover:underline">{contactEmail}</a>.
            </p>
          </Section>

          <Section title="9. California Privacy Rights (CCPA)">
            <p className="text-sm text-ink-soft leading-relaxed">
              If you are a California resident, you have the right to know what personal information we collect
              and request deletion. We do not sell personal information. Contact us at{' '}
              <a href={`mailto:${contactEmail}`} className="text-accent-strong hover:underline">{contactEmail}</a>.
            </p>
          </Section>

          <Section title="10. Age Requirement & Minors' Privacy">
            <p className="text-sm text-ink-soft leading-relaxed">
              Our Site is intended solely for adults aged 21 and older. We do not knowingly collect personal
              information from individuals under 21. If you believe a minor has provided us with personal
              information, please contact us and we will delete it.
            </p>
          </Section>

          <Section title="11. Research Use Only Disclaimer">
            <p className="text-sm text-ink-soft leading-relaxed">
              All products sold on this Site are for <strong className="text-ink">research use only (RUO)</strong> and are not intended
              for human or veterinary use. We do not collect or store any information related to the end use of research products.
            </p>
          </Section>

          <Section title="12. Third-Party Links">
            <p className="text-sm text-ink-soft leading-relaxed">
              Our Site may contain links to third-party websites. We are not responsible for the privacy practices
              of those sites and encourage you to review their privacy policies.
            </p>
          </Section>

          <Section title="13. Changes to This Policy">
            <p className="text-sm text-ink-soft leading-relaxed">
              We reserve the right to update this Privacy Policy at any time. Changes will be posted on this page
              with a revised &ldquo;Last Updated&rdquo; date.
            </p>
          </Section>

          <Section title="14. Contact Us">
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <div className="bg-surfaceAlt border border-line rounded-opp p-5">
              <p className="text-sm text-ink font-medium mb-1 m-0">{companyName}</p>
              <p className="text-sm text-ink-soft mb-1 m-0">
                Email: <a href={`mailto:${contactEmail}`} className="text-accent-strong hover:underline">{contactEmail}</a>
              </p>
              <p className="text-sm text-ink-soft m-0">
                Phone: <a href={`tel:${contactPhoneHref}`} className="text-accent-strong hover:underline font-mono">{contactPhone}</a>
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

function Subsection({ title, children }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-ink mb-2">{title}</h3>
      {children}
    </div>
  );
}
