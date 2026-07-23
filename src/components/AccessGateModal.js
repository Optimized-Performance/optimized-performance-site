import { useEffect } from 'react';
import Link from 'next/link';
import { Icon } from './Primitives';

// Persistent "researcher access required" gate. Fires the moment a non-approved
// visitor tries to buy a restricted item (add-to-cart), so they hit the wall at
// purchase intent — long before checkout. Two ways forward: sign in (a
// grandfathered/approved account) or request access. Client-side only, so
// crawlers still see the underlying catalog (keeps the de-cloaked posture).
export default function AccessGateModal({ open, onClose, loggedIn = false, productId = '' }) {
  const nextPath = productId ? `/products/${encodeURIComponent(productId)}` : '/shop';
  const loginUrl = `/account/login?next=${encodeURIComponent(nextPath)}`;

  // Lock background scroll while the gate is up.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-gate-title"
      onClick={onClose}
    >
      <div className="card-premium w-full max-w-md p-8 md:p-10 text-center my-8" onClick={(e) => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-full bg-accent/10 text-accent-strong flex items-center justify-center mx-auto mb-5">
          <Icon name="lock" size={26} />
        </div>
        <span className="opp-eyebrow">Researcher access required</span>
        <h2 id="access-gate-title" className="font-display font-semibold tracking-display text-2xl m-0 mt-2 mb-3 text-ink">
          Verified researchers only
        </h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-7">
          Restricted research materials can only be purchased by an approved account.
          {loggedIn
            ? ' Your account isn’t approved yet — request access below and we’ll review it.'
            : ' Sign in if you already have access, or request it — reviewed within 1 business day.'}
        </p>

        <div className="flex flex-col gap-3">
          {!loggedIn && (
            <Link href={loginUrl} className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2">
              <Icon name="lock" size={16} /> Sign in
            </Link>
          )}
          <Link
            href="/research-inquiries"
            className={`${loggedIn ? 'btn-primary' : 'btn-outline'} w-full py-3.5 text-base flex items-center justify-center gap-2`}
          >
            <Icon name="doc" size={16} /> Request access
          </Link>
        </div>

        {!loggedIn && (
          <p className="opp-meta-mono text-ink-mute mt-5 m-0 leading-relaxed">
            Ordered with us before? Your email is likely already approved — just{' '}
            <Link href={loginUrl} className="text-accent-strong hover:underline">sign in</Link>.
          </p>
        )}

        <button onClick={onClose} className="mt-6 text-[12px] text-ink-mute hover:text-ink-soft underline-offset-2 hover:underline">
          Keep browsing
        </button>
      </div>
    </div>
  );
}
