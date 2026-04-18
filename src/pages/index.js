import Link from 'next/link';
import { useRouter } from 'next/router';
import products from '../data/products';
import ProductCard from '../components/ProductCard';
import SEO from '../components/SEO';
import { Vial, Icon } from '../components/Primitives';

const METHOD_STEPS = [
  { n: '01', k: 'Synthesis', v: 'Solid-phase synthesis at an ISO-certified partner facility. Raw material logged by lot.' },
  { n: '02', k: 'HPLC & MS', v: 'Every batch analyzed by reverse-phase HPLC and mass spectrometry. Third-party verified.' },
  { n: '03', k: 'Lyophilization', v: 'Freeze-dried under vacuum, sealed under inert atmosphere, stored at −20°C.' },
  { n: '04', k: 'Fulfillment', v: 'Packed with care and shipped discreetly within 1 business day.' },
];

const TRUST = [
  { icon: 'shield', k: '99% Purity', v: 'Third-party tested — purity, mass, identity confirmed.' },
  { icon: 'doc', k: 'Signed COAs', v: 'Traceable by batch. Available on request.' },
  { icon: 'truck', k: '24h Shipping', v: 'US owned & operated. Orders ship within 1 business day.' },
  { icon: 'lock', k: 'Secure Checkout', v: 'Card payments processed securely by MoonPay.' },
];

export default function Home() {
  const router = useRouter();
  const featured = products.filter((p) => p.badge === 'HERO').slice(0, 3);
  const activeSkus = products.filter((p) => !p.isKit).length;

  return (
    <div className="max-w-container mx-auto px-8">
      <SEO path="/" />

      {/* Hero */}
      <section className="py-16 md:py-20">
        <div className="grid md:grid-cols-[1.2fr_1fr] gap-16 items-center">
          <div>
            <div className="flex items-center gap-3 mb-7">
              <span className="opp-eyebrow">Est. 2024 · USA</span>
              <span className="text-ink-mute">/</span>
              <span className="opp-eyebrow">Research Use Only</span>
            </div>
            <h1 className="font-display font-semibold tracking-display leading-[0.98] text-balance text-[clamp(42px,6vw,88px)] m-0 mb-7 text-ink">
              High-purity<br />
              <em className="not-italic font-normal text-accent">research peptides,</em><br />
              verified per batch.
            </h1>
            <p className="text-[17px] leading-relaxed text-ink-soft max-w-[500px] m-0 mb-9">
              Lyophilized powders for in-vitro research. 99% pure, US owned &amp; operated,
              shipped discreetly within 24 hours.
            </p>
            <div className="flex gap-3 mb-14">
              <button className="btn-primary px-5 py-3.5 text-sm" onClick={() => router.push('/shop')}>
                Browse catalog <Icon name="arrow" size={16} />
              </button>
              <button className="btn-outline px-5 py-3.5 text-sm" onClick={() => router.push('/faq')}>
                Read FAQ
              </button>
            </div>
            <dl className="grid grid-cols-3 gap-6 border-t border-line pt-6 m-0">
              <div>
                <dt className="opp-meta-mono uppercase mb-2">Average purity</dt>
                <dd className="font-display font-semibold text-[36px] tracking-display leading-none text-ink m-0">99%</dd>
              </div>
              <div>
                <dt className="opp-meta-mono uppercase mb-2">Active SKUs</dt>
                <dd className="font-display font-semibold text-[36px] tracking-display leading-none text-ink m-0">{activeSkus}</dd>
              </div>
              <div>
                <dt className="opp-meta-mono uppercase mb-2">Ship window</dt>
                <dd className="font-display font-semibold text-[36px] tracking-display leading-none text-ink m-0">&lt; 24h</dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col items-center gap-8">
            <div className="p-8 bg-surface border border-line rounded-opp-lg opp-grid-bg-lg">
              <Vial label="GLP-3" dosage="10mg" size={280} purity={99.4} sku="OP-GLP3-10MG" subtitle="Triple Agonist Peptide" />
            </div>
            <div className="w-full max-w-[320px] px-5 py-4 bg-surface border border-line rounded-opp flex flex-col gap-2 opp-meta-mono">
              <SpecLine k="SKU" v="OP-GLP3-10MG" />
              <SpecLine k="CLASS" v="GLPs / Triple Agonist" />
              <SpecLine k="PURITY" v="99.4%" />
              <SpecLine k="FORMAT" v="Lyophilized / 2mL Vial" />
              <SpecLine k="STORAGE" v="-20°C" />
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t border-b border-line py-8">
        <div className="grid md:grid-cols-4 grid-cols-2 gap-8">
          {TRUST.map((t) => (
            <div key={t.k} className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-opp flex items-center justify-center bg-accent-soft text-accent-strong shrink-0">
                <Icon name={t.icon} size={20} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink mb-1">{t.k}</div>
                <div className="text-[13px] text-ink-soft leading-snug">{t.v}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured */}
      <section className="py-20">
        <div className="flex justify-between items-end mb-10 gap-8">
          <div>
            <span className="opp-eyebrow">Catalog · featured</span>
            <h2 className="font-display font-semibold tracking-display text-[clamp(28px,3.5vw,48px)] leading-tight max-w-xl m-0 mt-2.5 text-balance text-ink">
              In circulation now.
            </h2>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-sm text-ink font-medium py-2 border-b border-line hover:border-ink transition-all"
          >
            View all <Icon name="arrow" size={14} />
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Method */}
      <section className="py-20">
        <div className="mb-10">
          <span className="opp-eyebrow">Method</span>
          <h2 className="font-display font-semibold tracking-display text-[clamp(28px,3.5vw,48px)] leading-tight max-w-xl m-0 mt-2.5 text-balance text-ink">
            How a vial gets to your bench.
          </h2>
        </div>
        <ol className="grid md:grid-cols-4 grid-cols-2 border-t border-line list-none p-0 m-0">
          {METHOD_STEPS.map((s, i) => (
            <li
              key={s.n}
              className={`p-8 pr-6 flex flex-col gap-3 ${i !== METHOD_STEPS.length - 1 ? 'md:border-r border-line' : ''} ${i === 0 ? 'md:pl-0' : ''}`}
            >
              <div className="opp-meta-mono">{s.n}</div>
              <div className="font-display font-semibold text-[22px] tracking-display text-ink">{s.k}</div>
              <div className="text-sm text-ink-soft leading-relaxed">{s.v}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* Manifesto */}
      <section className="my-10 mb-20 bg-surface border border-line text-ink p-20 px-8 md:px-20 rounded-opp-lg">
        <div className="max-w-3xl mx-auto">
          <span className="opp-eyebrow" style={{ color: 'var(--accent)' }}>No. 001</span>
          <p className="font-display font-semibold tracking-display text-[clamp(24px,3vw,40px)] leading-snug m-0 mt-4 text-balance">
            Research deserves honest material. 99% purity, third-party verified, shipped the next business day.
            <span className="text-accent"> If a batch doesn&apos;t meet spec, it doesn&apos;t ship.</span>
          </p>
        </div>
      </section>
    </div>
  );
}

function SpecLine({ k, v }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-ink-mute">{k}</span>
      <span className="text-ink">{v}</span>
    </div>
  );
}
