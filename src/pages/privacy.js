import SEO from '../components/SEO';

export default function PrivacyPolicy() {
  const lastUpdated = 'April 3, 2025';
  const companyName = 'Optimized Performance Inc.';
  const contactEmail = 'contact@optimizedperformanceinc.com';
  const siteUrl = 'optimizedperformanceinc.com';

  return (
    <div className="min-h-screen">
      <SEO title="Privacy Policy" description="Optimized Performance privacy policy — how we collect, use, and protect your data." path="/privacy" />
      <div className="bg-brand-navy py-14 px-6 text-center">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-brand-cyan uppercase mb-2">Legal</p>
        <h1 className="text-3xl font-heading font-bold text-brand-cream mb-2">Privacy Policy</h1>
        <p className="text-sm text-brand-muted">Last updated: {lastUpdated}</p>
      </div>

      <div className="max-w-[860px] mx-auto px-6 py-12">
        <div className="card-premium p-8 md:p-12">

          <section className="mb-8">
            <p className="text-sm text-brand-platinum leading-relaxed">
              {companyName} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates {siteUrl} (the &ldquo;Site&rdquo;). This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you visit our Site or make a purchase.
              Please read this policy carefully. By using the Site, you consent to the practices described herein.
            </p>
          </section>

          <Section title="1. Information We Collect">
            <p className="text-sm text-brand-platinum leading-relaxed mb-3">We may collect the following types of information:</p>
            <Subsection title="Personal Information You Provide">
              <ul className="list-disc pl-5 space-y-1 text-sm text-brand-platinum leading-relaxed">
                <li>Name and shipping address</li>
                <li>Email address</li>
                <li>Phone number (if provided)</li>
                <li>Order history and preferences</li>
              </ul>
            </Subsection>
            <Subsection title="Payment Information">
              <p className="text-sm text-brand-platinum leading-relaxed">
                We do not directly collect or store payment card information. All payment processing is handled by
                <strong className="text-brand-cream"> MoonPay</strong>, a third-party payment service provider. When you complete a purchase,
                you are subject to MoonPay&apos;s own terms of service and privacy policy, available at{' '}
                <a href="https://www.moonpay.com/legal/privacy_policy" className="text-brand-cyan hover:text-brand-cyan-light transition-colors" target="_blank" rel="noopener noreferrer">
                  moonpay.com/legal/privacy_policy
                </a>.
              </p>
            </Subsection>
            <Subsection title="Automatically Collected Information">
              <ul className="list-disc pl-5 space-y-1 text-sm text-brand-platinum leading-relaxed">
                <li>IP address and approximate location</li>
                <li>Browser type and version</li>
                <li>Pages visited and time spent on the Site</li>
                <li>Referring URLs</li>
                <li>Device type and operating system</li>
              </ul>
            </Subsection>
          </Section>

          <Section title="2. How We Use Your Information">
            <p className="text-sm text-brand-platinum leading-relaxed mb-3">We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-brand-platinum leading-relaxed mb-3">
              <li>Process and fulfill your orders</li>
              <li>Send order confirmations and shipping notifications</li>
              <li>Respond to customer service inquiries</li>
              <li>Comply with legal obligations</li>
              <li>Improve our Site and product offerings</li>
              <li>Prevent fraud and unauthorized transactions</li>
              <li>Send transactional emails related to your purchases</li>
            </ul>
            <p className="text-sm text-brand-platinum leading-relaxed">
              We do not sell, rent, or trade your personal information to third parties for marketing purposes.
            </p>
          </Section>

          <Section title="3. MoonPay Payment Processing">
            <p className="text-sm text-brand-platinum leading-relaxed mb-3">
              Our Site uses MoonPay to process payments. By completing a purchase, you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-brand-platinum leading-relaxed mb-3">
              <li>Your payment information is transmitted directly and securely to MoonPay</li>
              <li>MoonPay may require identity verification (KYC) as part of their regulatory obligations</li>
              <li>MoonPay may collect, store, and process your personal and financial data per their privacy policy</li>
              <li>We receive only a confirmation of payment and do not have access to your card or bank details</li>
            </ul>
            <p className="text-sm text-brand-platinum leading-relaxed">
              For questions about how MoonPay handles your data, review their privacy policy at{' '}
              <a href="https://www.moonpay.com/legal/privacy_policy" className="text-brand-cyan hover:text-brand-cyan-light transition-colors" target="_blank" rel="noopener noreferrer">
                moonpay.com/legal/privacy_policy
              </a>.
            </p>
          </Section>

          <Section title="4. Sharing of Information">
            <p className="text-sm text-brand-platinum leading-relaxed mb-3">We may share your information with:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-brand-platinum leading-relaxed mb-3">
              <li><strong className="text-brand-cream">MoonPay</strong> — for payment processing</li>
              <li><strong className="text-brand-cream">Shipping carriers</strong> (USPS, UPS, FedEx) — to fulfill and track your order</li>
              <li><strong className="text-brand-cream">Email service providers</strong> — to send transactional emails</li>
              <li><strong className="text-brand-cream">Law enforcement</strong> — when required by law or to protect our legal rights</li>
            </ul>
            <p className="text-sm text-brand-platinum leading-relaxed">
              We do not share your information with any other third parties without your explicit consent.
            </p>
          </Section>

          <Section title="5. Cookies and Tracking Technologies">
            <p className="text-sm text-brand-platinum leading-relaxed mb-3">
              Our Site may use cookies and similar tracking technologies to enhance your browsing experience
              and analyze Site traffic. You may disable cookies through your browser settings.
            </p>
            <p className="text-sm text-brand-platinum leading-relaxed">
              We do not use cookies for advertising or behavioral tracking purposes.
            </p>
          </Section>

          <Section title="6. Data Retention">
            <p className="text-sm text-brand-platinum leading-relaxed">
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this
              policy. Order records are typically retained for a minimum of 7 years for tax and accounting purposes.
            </p>
          </Section>

          <Section title="7. Data Security">
            <p className="text-sm text-brand-platinum leading-relaxed">
              We implement industry-standard security measures including SSL/TLS encryption for data in transit.
              However, no method of transmission over the internet is 100% secure.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p className="text-sm text-brand-platinum leading-relaxed mb-3">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-brand-platinum leading-relaxed mb-3">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of certain data processing activities</li>
            </ul>
            <p className="text-sm text-brand-platinum leading-relaxed">
              To exercise any of these rights, contact us at <a href={`mailto:${contactEmail}`} className="text-brand-cyan hover:text-brand-cyan-light transition-colors">{contactEmail}</a>.
            </p>
          </Section>

          <Section title="9. California Privacy Rights (CCPA)">
            <p className="text-sm text-brand-platinum leading-relaxed">
              If you are a California resident, you have the right to know what personal information we collect
              and request deletion. We do not sell personal information. Contact us at{' '}
              <a href={`mailto:${contactEmail}`} className="text-brand-cyan hover:text-brand-cyan-light transition-colors">{contactEmail}</a>.
            </p>
          </Section>

          <Section title="10. Children's Privacy">
            <p className="text-sm text-brand-platinum leading-relaxed">
              Our Site is intended for adults aged 18 and older. We do not knowingly collect personal information
              from individuals under 18. If you believe a minor has provided us with personal information, please contact us.
            </p>
          </Section>

          <Section title="11. Research Use Only Disclaimer">
            <p className="text-sm text-brand-platinum leading-relaxed">
              All products sold on this Site are for <strong className="text-brand-cream">research use only (RUO)</strong> and are not intended
              for human or veterinary use. We do not collect or store any information related to the end use of research products.
            </p>
          </Section>

          <Section title="12. Third-Party Links">
            <p className="text-sm text-brand-platinum leading-relaxed">
              Our Site may contain links to third-party websites. We are not responsible for the privacy practices
              of those sites and encourage you to review their privacy policies.
            </p>
          </Section>

          <Section title="13. Changes to This Policy">
            <p className="text-sm text-brand-platinum leading-relaxed">
              We reserve the right to update this Privacy Policy at any time. Changes will be posted on this page
              with a revised &ldquo;Last Updated&rdquo; date.
            </p>
          </Section>

          <Section title="14. Contact Us">
            <p className="text-sm text-brand-platinum leading-relaxed mb-3">
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <div className="bg-brand-dark/50 border border-white/[0.06] rounded-lg p-5">
              <p className="text-sm text-brand-cream font-medium mb-1">{companyName}</p>
              <p className="text-sm text-brand-platinum">Email: <a href={`mailto:${contactEmail}`} className="text-brand-cyan hover:text-brand-cyan-light transition-colors">{contactEmail}</a></p>
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
      <h2 className="text-base font-heading font-bold text-brand-cream mb-3 pb-2 border-b border-white/[0.06]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Subsection({ title, children }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-brand-cream mb-2">{title}</h3>
      {children}
    </div>
  );
}
