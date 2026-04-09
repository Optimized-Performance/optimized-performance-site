import Link from 'next/link';
import ProductCard from '../components/ProductCard';
import products from '../data/products';
import SEO from '../components/SEO';
import Logo from '../components/Logo';

export default function Home() {
  const featured = products.slice(0, 3);

  return (
    <div>
      <SEO
        path="/"
        description="Optimized Performance — research-grade peptides with 99% purity. BPC-157, TB-500, GLP-3, Ipamorelin, and more. Third-party tested, US owned & operated. Fast shipping."
      />

      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-navy to-brand-dark text-center py-24 px-6 relative overflow-hidden">
        <div className="max-w-2xl mx-auto relative z-10">
          <div className="flex justify-center">
            <Logo size={240} full={true} />
          </div>
          <h1 className="mt-8 text-4xl md:text-5xl font-heading font-extrabold text-brand-cream tracking-tight leading-tight">
            Optimized Performance Peptides
          </h1>
          <p className="mt-3 text-brand-cyan font-heading text-sm tracking-premium">
            Premium Research Peptides
          </p>
          <p className="mt-5 text-brand-muted text-[15px] leading-relaxed max-w-lg mx-auto">
            99% pure lyophilized peptides for research purposes.
            US owned and operated. Third-party tested and ensured. Fast shipping.
          </p>
          <Link href="/shop" className="btn-primary inline-block mt-8 px-10 py-3.5 text-[15px]">
            Browse Products
          </Link>
        </div>
      </section>

      {/* Trust indicators — understated strip */}
      <section className="border-b border-white/[0.06] bg-brand-navy/50">
        <div className="max-w-container mx-auto px-6 py-6 flex justify-center gap-8 md:gap-14 flex-wrap">
          {[
            { icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', label: '99% Purity' },
            { icon: 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 9 9 9 9 0 0 1-9 9 9 9 0 0 1-9-9z', label: 'US Owned' },
            { icon: 'M1 3h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H1', sub: 'M16 8h4l3 3v5h-7', label: 'Fast Shipping' },
          ].map(({ label }) => (
            <span key={label} className="text-xs font-medium text-brand-platinum/70 tracking-wide">
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-20 px-6">
        <div className="max-w-container mx-auto">
          <h2 className="text-2xl font-heading font-bold text-brand-cream text-center mb-10">
            Featured Products
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/shop" className="btn-outline inline-block">
              View All Products
            </Link>
          </div>
        </div>
      </section>

      {/* RUO Banner */}
      <section className="bg-brand-navy">
        <div className="max-w-narrow mx-auto py-8 px-6 text-center">
          <p className="text-[11px] text-red-500/70 font-medium tracking-wide uppercase mb-2">
            Research Use Only
          </p>
          <p className="text-[11px] text-brand-muted leading-relaxed">
            All products sold by Optimized Performance Inc. are intended strictly for
            in-vitro research and laboratory use only. They are not drugs, foods, or
            cosmetics and are not intended for human or animal consumption. Purchasers
            must be 21 years of age or older.
          </p>
        </div>
      </section>
    </div>
  );
}
