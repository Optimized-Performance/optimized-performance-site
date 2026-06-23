import SEO from '../components/SEO';

export default function Compliance() {
  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO
        title="Compliance & Research-Use Policy"
        description="Syngyn supplies analytical-grade reference materials exclusively for in-vitro laboratory research. Research-use-only scope, qualified-buyer requirements, and prohibited uses."
        path="/compliance"
      />
      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Compliance</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Compliance &amp; Research-Use Policy
        </h1>
        <p className="text-ink-soft text-sm m-0">
          Analytical reference materials for in-vitro research use only
        </p>
      </div>
      <div className="max-w-narrow mx-auto pt-12">
        <div className="card-premium p-8 md:p-12">
          <Section title="Research-Use-Only Scope">
            <p className={P}>
              All products supplied by Syngyn are analytical-grade reference materials
              intended exclusively for in-vitro research, analytical method development, identity verification,
              and laboratory evaluation. They are <strong>not</strong> intended for human or animal consumption,
              therapeutic use, clinical use, diagnostic use, dietary supplementation, dosing, injection, ingestion,
              or administration of any kind.
            </p>
            <p className={P}>
              Our products are not drugs, foods, dietary supplements, or cosmetics, and no claim of safety or
              efficacy for any in-vivo use is made or implied.
            </p>
          </Section>

          <Section title="Qualified Buyers">
            <p className={P}>
              Products are offered to qualified researchers and institutional buyers — laboratories, academic
              institutions, biotechnology companies, and contract research organizations — purchasing for legitimate
              in-vitro research. At checkout, every buyer must affirmatively confirm qualified-buyer status, the
              research-use-only scope, that they are 21 years of age or older, and that the materials are not being
              purchased for consumption or administration.
            </p>
          </Section>

          <Section title="Prohibited Uses">
            <p className={P}>The following are strictly prohibited:</p>
            <ul className={UL}>
              <li>Human or animal consumption, ingestion, injection, or administration.</li>
              <li>Any therapeutic, clinical, diagnostic, or disease-prevention use.</li>
              <li>Representation or resale of the materials as drugs, supplements, foods, or cosmetics.</li>
              <li>Resale or transfer for human or animal use.</li>
            </ul>
            <p className={P}>
              Buyers are solely responsible for ensuring their handling and use of these materials complies with all
              applicable laws and institutional requirements.
            </p>
          </Section>

          <Section title="Analytical Reference Materials">
            <p className={P}>
              Materials are supplied as lyophilized reference standards characterized on a per-lot basis. Product
              listings describe identity, purity, and presentation for analytical reference purposes only. No dosing,
              reconstitution-for-administration, protocol, or usage guidance is provided.
            </p>
          </Section>

          <Section title="Certificate of Analysis &amp; Lot Testing">
            <p className={P}>
              Each lot is independently tested by a third-party, ISO/IEC&nbsp;17025-accredited laboratory. A
              lot-specific Certificate of Analysis is available for every product. See{' '}
              <a className={A} href="/coa-documentation">CoA &amp; Lot Testing Documentation</a> for how lot
              testing is performed and how to access a Certificate of Analysis.
            </p>
          </Section>

          <Section title="Age Requirement">
            <p className={P}>
              Purchasers must be 21 years of age or older. A 21+ acknowledgment is required before any purchase.
            </p>
          </Section>

          <Section title="Restricted Catalog">
            <p className={P}>
              Certain materials are made available only to verified research contacts through direct inquiry and are
              not listed for general purchase. For availability of materials not shown in the catalog, contact{' '}
              <a className={A} href="mailto:support@syngyn.co">
                support@syngyn.co
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
