import { useRouter } from 'next/router';
import SEO from '../components/SEO';
import { Logo, Icon } from '../components/Primitives';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="max-w-narrow mx-auto px-8 py-24 text-center">
      <SEO title="Not found" description="The page you're looking for doesn't exist." path="" noindex />

      <div className="text-accent-strong mb-6 inline-flex">
        <Logo size={48} />
      </div>

      <span className="opp-eyebrow">Error 404</span>
      <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,56px)] leading-none mt-3 mb-4 text-ink">
        Lost in the lab.
      </h1>
      <p className="text-ink-soft text-[15px] leading-relaxed max-w-md mx-auto mb-8">
        The page you&apos;re looking for doesn&apos;t exist, or the link is from a previous version of the site.
        If you got here from a label QR code, double-check the SKU and lot number.
      </p>

      <div className="flex flex-wrap gap-3 justify-center">
        <button className="btn-primary" onClick={() => router.push('/')}>
          Back to home <Icon name="arrow" size={16} />
        </button>
        <button className="btn-outline" onClick={() => router.push('/shop')}>
          Browse the catalog
        </button>
      </div>

      <div className="mt-12 pt-8 border-t border-line text-left max-w-md mx-auto">
        <div className="opp-meta-mono uppercase mb-2">Common destinations</div>
        <ul className="space-y-1.5 text-sm">
          <li>
            <a href="/shop" className="text-accent-strong hover:underline">Shop</a>
            <span className="text-ink-mute"> — full catalog</span>
          </li>
          <li>
            <a href="/shipping" className="text-accent-strong hover:underline">Shipping &amp; Returns</a>
            <span className="text-ink-mute"> — policies and timelines</span>
          </li>
          <li>
            <a href="/faq" className="text-accent-strong hover:underline">FAQ</a>
            <span className="text-ink-mute"> — common questions</span>
          </li>
          <li>
            <a href="mailto:support@syngyn.co" className="text-accent-strong hover:underline">
              support@syngyn.co
            </a>
            <span className="text-ink-mute"> — contact us</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
