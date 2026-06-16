import SEO from '../components/SEO';

export default function CoaDocumentation() {
  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO
        title="Certificate of Analysis & Lot Testing"
        description="How Optimized Performance Inc. tests every lot through a third-party ISO/IEC 17025-accredited laboratory, and how to access the lot-specific Certificate of Analysis for any product."
        path="/coa-documentation"
      />
      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Documentation</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Certificate of Analysis &amp; Lot Testing
        </h1>
        <p className="text-ink-soft text-sm m-0">
          Independent, per-lot analytical verification
        </p>
      </div>
      <div className="max-w-narrow mx-auto pt-12">
        <div className="card-premium p-8 md:p-12">
          <Section title="Independent Testing">
            <p className={P}>
              Every product lot is independently analyzed by a third-party laboratory accredited to
              ISO/IEC&nbsp;17025. Optimized Performance Inc. does not perform its own release testing — verification
              is external so the analytical record is independent of the supplier.
            </p>
          </Section>

          <Section title="What Each Lot Is Tested For">
            <ul className={UL}>
              <li><strong>Identity &amp; purity</strong> — confirmation of the reference compound and percent purity.</li>
              <li><strong>Quantity / content</strong> — verification of stated content per vial.</li>
              <li><strong>Sterility</strong> (USP&nbsp;71) and <strong>endotoxin</strong> screening, where applicable to the format.</li>
              <li><strong>Heavy metals.</strong></li>
              <li><strong>Vial-to-vial variance characterization</strong> across the lot.</li>
            </ul>
            <p className={P}>
              Oral-solution and small-molecule reference materials are tested under the analytical panel appropriate
              to their format (identity, purity, content, and microbial/residual-solvent screening as applicable).
            </p>
          </Section>

          <Section title="Accessing a Certificate of Analysis">
            <p className={P}>
              Each vial label carries a lot number and a scannable QR code. Scanning the code — or visiting{' '}
              <code className={CODE}>/coa/&#123;sku&#125;/&#123;lot&#125;</code> — resolves to the lot-specific
              Certificate of Analysis for that exact production lot. Product pages also link to the current lot&apos;s
              Certificate of Analysis.
            </p>
            <p className={P}>
              If a lot&apos;s full certificate is still in process, the page indicates that preliminary results are
              pending and the final certificate will be posted on receipt.
            </p>
          </Section>

          <Section title="What a Certificate Shows">
            <p className={P}>
              Each certificate identifies the product, the lot number, the testing laboratory, the analytical methods
              used, and the measured results for the panel above. Certificates are provided for analytical reference
              and documentation purposes.
            </p>
          </Section>

          <Section title="Questions">
            <p className={P}>
              For documentation requests or questions about a specific lot, contact{' '}
              <a className={A} href="mailto:admin@optimizedperformancepeptides.com">
                admin@optimizedperformancepeptides.com
              </a>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

const P = 'text-ink-soft text-[15px] leading-relaxed mb-3';
const UL = 'text-ink-soft text-[15px] leading-relaxed mb-3 list-disc pl-5 space-y-1';
const A = 'text-accent-strong hover:underline';
const CODE = 'font-mono text-[13px] text-ink bg-surfaceAlt px-1.5 py-0.5 rounded';

function Section({ title, children }) {
  const id = String(title)
    .toLowerCase()
    .replace(/&amp;/g, '')
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
