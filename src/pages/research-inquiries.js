import Link from 'next/link';
import SEO from '../components/SEO';
import { Icon } from '../components/Primitives';
import { getPrivateInquiryUrl } from '../data/catalog-client';

// Public-facing "research inquiry" surface.
//
// This page is always available at /research-inquiries by direct URL, but the
// footer link to it is only rendered when NEXT_PUBLIC_SHOW_INQUIRY_SURFACE is
// "true". That separation lets you (a) keep the URL useful for affiliates and
// existing community members at all times and (b) only expose it broadly when
// you decide the catalog has been pared back enough to need a public path
// to private-channel sourcing.
//
// Deliberately generic — no specific compounds named, no GLP/HGH references,
// no claims that could trigger underwriter or regulatory attention. The
// underlying message is: "we have more available; ask us."
export default function ResearchInquiries() {
  const inquiryUrl = getPrivateInquiryUrl();

  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO
        title="Research Inquiries"
        description="Inquiries for research compounds outside our public catalog."
        path="/research-inquiries"
      />

      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Inquiries</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Research Inquiries
        </h1>
        <p className="text-ink-soft text-sm m-0">
          Compounds, quantities, and configurations not listed in our public catalog.
        </p>
      </div>

      <div className="max-w-narrow mx-auto pt-12">
        <div className="card-premium p-8 md:p-12">
          <p className="text-ink-soft leading-relaxed mb-5">
            Our public catalog reflects the SKUs we&apos;ve made publicly available. For other
            research compounds, bulk quantities, or specific configurations not shown
            on the catalog, reach out directly. We&apos;ll confirm availability and provide
            current batch and pricing details on a per-inquiry basis.
          </p>

          <p className="text-ink-soft leading-relaxed mb-8">
            All inquiries are handled within 24 hours.
          </p>

          <a
            href={inquiryUrl}
            className="btn-primary inline-flex items-center gap-2 px-6 py-3.5 text-base"
            target={inquiryUrl.startsWith('http') ? '_blank' : undefined}
            rel={inquiryUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
          >
            <Icon name="doc" size={16} /> Contact for research inquiry
          </a>

          <div className="mt-10 pt-8 border-t border-line">
            <div className="opp-meta-mono text-ink-mute mb-3">What to include in your inquiry</div>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li>Your research context (institution, project, end-use nature)</li>
              <li>Specific compound or category of interest</li>
              <li>Approximate quantity</li>
              <li>Preferred contact method for follow-up</li>
            </ul>
          </div>

          <div className="mt-10 pt-8 border-t border-line">
            <div className="opp-meta-mono text-ink-mute mb-3">What to expect</div>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft leading-relaxed">
              <li>Confirmation of availability within 24 hours</li>
              <li>Current Certificate of Analysis (COA) from third-party testing</li>
              <li>Pricing specific to quantity and current batch</li>
              <li>Standard shipping and fulfillment terms (see{' '}
                <Link href="/shipping" className="text-accent-strong hover:underline">
                  Shipping &amp; Returns
                </Link>
                )
              </li>
            </ul>
          </div>

          <p className="font-mono text-[11px] text-ink-mute leading-relaxed mt-12 m-0">
            All compounds are supplied strictly for in-vitro research and laboratory use only.
            Not drugs, foods, or cosmetics. Not intended for human or animal consumption.
            Must be 21 years of age or older. See our{' '}
            <Link href="/terms" className="text-accent-strong hover:underline">Terms of Service</Link>{' '}
            for full research-use commitments.
          </p>
        </div>

        <div className="text-center mt-8">
          <Link href="/shop" className="text-sm text-ink-soft hover:text-ink transition-colors">
            ← Back to public catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
