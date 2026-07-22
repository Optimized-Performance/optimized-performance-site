import { useState } from 'react';
import Link from 'next/link';
import { Logo } from './Primitives';
import { BRAND, RESEARCH_MODE } from '../lib/brand';

// Show the "Research inquiries" footer link only when explicitly enabled via
// env var. Default is OFF — the /research-inquiries page is still reachable
// by direct URL for affiliates and existing customers, but isn't surfaced in
// site navigation. Flip NEXT_PUBLIC_SHOW_INQUIRY_SURFACE=true on Vercel and
// redeploy to make the link visible in the footer.
const SHOW_INQUIRY_SURFACE = process.env.NEXT_PUBLIC_SHOW_INQUIRY_SURFACE === 'true';

export default function Footer() {
  const brand = BRAND;
  return (
    <footer className="mt-20 border-t border-line bg-surfaceAlt">
      <div className="max-w-container mx-auto px-8 pt-16 pb-10 grid gap-12 md:grid-cols-[2fr_1fr_1fr_1fr] grid-cols-1">
        <div>
          <div className="flex items-center gap-3 mb-4 text-ink">
            <Logo size={24} />
            <span className="flex flex-col leading-none">
              <span className="font-display font-semibold text-[14px] tracking-[0.08em]">
                {brand.name.toUpperCase()}
              </span>
              <span className="font-mono text-[10px] text-ink-mute tracking-[0.12em] uppercase mt-1">
                {brand.tagline}
              </span>
            </span>
          </div>
          <p className="text-ink-soft text-sm max-w-md leading-relaxed mb-4">
            {brand.footerBlurb}
          </p>
          <div className="flex flex-col gap-1.5 text-sm mb-6">
            <a
              href={`mailto:${brand.email}`}
              className="text-ink-soft hover:text-accent-strong transition-colors"
            >
              {brand.email}
            </a>
            <a
              href={`tel:${brand.phoneTel}`}
              className="text-ink-soft hover:text-accent-strong transition-colors font-mono tracking-wide"
            >
              {brand.phoneDisplay}
            </a>
          </div>
          <NewsletterSignup />
        </div>

        <FooterCol title="Shop">
          <FooterLink href="/shop">All products</FooterLink>
          <FooterLink href="/shop?cat=GLPs">GLPs</FooterLink>
          <FooterLink href="/shop?cat=Combos">Combos</FooterLink>
          <FooterLink href="/shop?cat=Supplements">Supplements</FooterLink>
        </FooterCol>

        <FooterCol title="Resources">
          <FooterLink href="/faq">FAQ</FooterLink>
          <FooterLink href="/shipping">Shipping &amp; Returns</FooterLink>
          <FooterLink href="/compliance">Compliance</FooterLink>
          <FooterLink href="/coa-documentation">CoA &amp; Lot Testing</FooterLink>
          <a
            href="/sample-coa.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-ink text-sm py-1.5 hover:text-accent-strong transition-colors"
          >
            Sample CoA
          </a>
          <a
            href="/shipping-label.png"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-ink text-sm py-1.5 hover:text-accent-strong transition-colors"
          >
            Shipping label
          </a>
          {SHOW_INQUIRY_SURFACE && (
            <FooterLink href="/research-inquiries">Research inquiries</FooterLink>
          )}
        </FooterCol>

        <FooterCol title="Company">
          <FooterLink href="/privacy">Privacy Policy</FooterLink>
          <FooterLink href="/terms">Terms of Service</FooterLink>
          <FooterLink href="/affiliate/login">Affiliate Login</FooterLink>
        </FooterCol>
      </div>

      <div className="border-t border-line max-w-container mx-auto px-8 py-6 flex flex-col gap-4">
        <div className="flex gap-3.5 items-start">
          {RESEARCH_MODE ? (
            <>
              <span className="opp-ruo-tag">RUO</span>
              <p className="text-xs text-ink-soft leading-relaxed m-0">
                All products are intended strictly for in-vitro research, laboratory, and identification purposes only.
                They are not drugs, foods, or cosmetics and are not intended for human or animal consumption, dosing,
                injection, or ingestion. Purchasers must be 21 years of age or older.
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-soft leading-relaxed m-0">
              Laboratory supplies, consumables, and analytical reference standards for research and calibration use.
              Third-party verified where applicable. Shipped from the United States.
            </p>
          )}
        </div>
        <div className="flex justify-between font-mono text-[11px] text-ink-mute tracking-wide">
          <span>© {new Date().getFullYear()} {brand.legalName}</span>
          <span>Made in the USA</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }) {
  return (
    <div>
      <h4 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-4">{title}</h4>
      {children}
    </div>
  );
}

function FooterLink({ href, children }) {
  return (
    <Link
      href={href}
      className="block text-ink text-sm py-1.5 hover:text-accent-strong transition-colors"
    >
      {children}
    </Link>
  );
}

// Footer email capture. POSTs to /api/newsletter/subscribe and renders
// success / already-subscribed / error inline. Deliberately minimal — one
// input, one button, one status line. Server treats already-subscribed as
// success so we never tell a stranger whether an email is in our list.
function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'submitting' | 'success' | 'error'
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'footer' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Could not subscribe. Try again.');
        return;
      }
      setStatus('success');
      setMessage(
        data.alreadySubscribed
          ? "You're already on the list — thanks!"
          : "You're in — we'll be in touch."
      );
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Could not subscribe. Try again.');
    }
  }

  return (
    <div>
      <h4 className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-3">
        Stock updates &amp; newsletter
      </h4>
      <form onSubmit={handleSubmit} className="flex gap-2 max-w-md">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input-field flex-1 text-sm"
          aria-label="Email address"
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          className="btn-primary text-xs px-4 py-2 whitespace-nowrap"
          disabled={status === 'submitting'}
        >
          {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
      {message && (
        <p
          className={`opp-meta-mono mt-2 m-0 ${
            status === 'success' ? 'text-success' : 'text-danger'
          }`}
        >
          {message}
        </p>
      )}
      <p className="opp-meta-mono text-ink-mute mt-2 m-0">
        Restock alerts + new SKU drops. No spam.
      </p>
    </div>
  );
}
