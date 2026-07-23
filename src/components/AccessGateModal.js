import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Primitives';

// Persistent "researcher access required" gate. Fires the moment a non-approved
// visitor tries to buy a restricted item (add-to-cart), so they hit the wall at
// purchase intent — long before checkout. Since 2026-07-23 the application form
// lives INLINE in the modal (no detour to /research-inquiries): the visitor
// signs up, is approved instantly, signed in, and the item they clicked lands
// in their cart via `onUnlocked`. Grandfathered customers still get the sign-in
// fast path. Client-side only, so crawlers still see the underlying catalog
// (keeps the de-cloaked posture).
// Copy tracks the approval mode (instant by default; manual review when
// NEXT_PUBLIC_RESEARCH_ACCESS_MANUAL_REVIEW=true — build-time var).
const instantApproval = process.env.NEXT_PUBLIC_RESEARCH_ACCESS_MANUAL_REVIEW !== 'true';

export default function AccessGateModal({
  open,
  onClose,
  loggedIn = false,
  productId = '',
  productName = '',
  onUnlocked,
}) {
  const nextPath = productId ? `/products/${encodeURIComponent(productId)}` : '/shop';
  const loginUrl = `/account/login?next=${encodeURIComponent(nextPath)}`;

  const [form, setForm] = useState({ name: '', email: '', institution: '', intendedUse: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // null while the form shows; after submit: { approved, signedIn, accountCreated }
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Lock background scroll while the gate is up.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/research-access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Logged-in (but unapproved) users already have an account — no password field shown.
        body: JSON.stringify({ ...form, role: '', password: loggedIn ? '' : form.password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong — please try again.');
        setSubmitting(false);
        return;
      }
      const unlocked = !!data.approved && (loggedIn || !!data.signedIn);
      // Drop the item they were trying to buy straight into the cart — the
      // whole point of the inline flow is not losing the purchase intent.
      if (unlocked && typeof onUnlocked === 'function') {
        try { onUnlocked(); } catch { /* cart add is best-effort */ }
      }
      setResult({ approved: !!data.approved, signedIn: loggedIn || !!data.signedIn, accountCreated: !!data.accountCreated });
    } catch {
      setError('Something went wrong — please try again.');
    }
    setSubmitting(false);
  }

  // ── success / follow-up views ─────────────────────────────────────────────
  let body;
  if (result && result.approved && result.signedIn) {
    const added = typeof onUnlocked === 'function' && productName;
    body = (
      <>
        <span className="opp-eyebrow">Researcher access</span>
        <h2 id="access-gate-title" className="font-display font-semibold tracking-display text-2xl m-0 mt-2 mb-3 text-ink">
          You&rsquo;re approved
        </h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-7">
          {added
            ? <>Purchasing is unlocked and <strong className="text-ink">{productName}</strong> is in your cart.</>
            : 'Purchasing is unlocked for restricted research items.'}
        </p>
        <div className="flex flex-col gap-3">
          {/* Full navigations on purpose — the server re-renders every Access
              button as Add once the session is seen. Cart persists (localStorage). */}
          <button onClick={() => { window.location.href = '/checkout'; }} className="btn-primary w-full py-3.5 text-base">
            {added ? 'Go to checkout' : 'Browse restricted items'}
          </button>
          <button onClick={() => window.location.reload()} className="btn-outline w-full py-3.5 text-base">
            Keep shopping
          </button>
        </div>
      </>
    );
  } else if (result && result.approved && !result.signedIn) {
    body = (
      <>
        <span className="opp-eyebrow">Researcher access</span>
        <h2 id="access-gate-title" className="font-display font-semibold tracking-display text-2xl m-0 mt-2 mb-3 text-ink">
          Approved — sign in to continue
        </h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-7">
          This email already has an account, and purchasing is now unlocked for it.
          Sign in with your existing password to continue (you can reset it from the sign-in page).
        </p>
        <Link href={loginUrl} className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2">
          <Icon name="lock" size={16} /> Sign in
        </Link>
      </>
    );
  } else if (result) {
    body = (
      <>
        <span className="opp-eyebrow">Researcher access</span>
        <h2 id="access-gate-title" className="font-display font-semibold tracking-display text-2xl m-0 mt-2 mb-3 text-ink">
          Application received
        </h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-7">
          We review applications within 1 business day and email you the moment you&rsquo;re approved
          {result.accountCreated ? ' — your account is created and you’re signed in, so purchasing unlocks automatically.' : '.'}
        </p>
        <button onClick={onClose} className="btn-primary w-full py-3.5 text-base">Keep browsing</button>
      </>
    );
  } else {
    // ── inline application form ─────────────────────────────────────────────
    body = (
      <>
        <div className="w-12 h-12 rounded-full bg-accent/10 text-accent-strong flex items-center justify-center mx-auto mb-4">
          <Icon name="lock" size={22} />
        </div>
        <span className="opp-eyebrow">Researcher access required</span>
        <h2 id="access-gate-title" className="font-display font-semibold tracking-display text-2xl m-0 mt-2 mb-2 text-ink">
          Verified researchers only
        </h2>
        <p className="text-ink-soft text-sm leading-relaxed mb-5">
          {loggedIn
            ? `Your account isn’t approved yet — complete the application below${instantApproval ? '; approval is instant.' : ' and we’ll review it.'}`
            : `Restricted items require an approved account. Apply below — ${instantApproval ? 'approval is instant and you can order right away.' : 'reviewed within 1 business day.'}`}
        </p>

        {!loggedIn && (
          <p className="opp-meta-mono text-ink-mute mb-5 m-0 leading-relaxed">
            Ordered with us before? Your email is likely already approved — just{' '}
            <Link href={loginUrl} className="text-accent-strong hover:underline">sign in</Link>.
          </p>
        )}

        <form onSubmit={submit} className="text-left">
          <div className="grid gap-3 mb-3">
            <label className="block">
              <span className="opp-meta-mono uppercase mb-1 block">Full name</span>
              <input className="input-field w-full" value={form.name} onChange={set('name')} disabled={submitting} required />
            </label>
            <label className="block">
              <span className="opp-meta-mono uppercase mb-1 block">Email</span>
              <input type="email" className="input-field w-full" value={form.email} onChange={set('email')} disabled={submitting} required />
              {loggedIn && (
                <span className="opp-meta-mono text-ink-mute block mt-1">Use the same email as your account so access applies to it.</span>
              )}
            </label>
            {!loggedIn && (
              <label className="block">
                <span className="opp-meta-mono uppercase mb-1 block">Create a password</span>
                <input
                  type="password" className="input-field w-full" value={form.password} onChange={set('password')}
                  disabled={submitting} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters"
                />
              </label>
            )}
            <label className="block">
              <span className="opp-meta-mono uppercase mb-1 block">Institution / affiliation</span>
              <input className="input-field w-full" value={form.institution} onChange={set('institution')} disabled={submitting} required />
            </label>
            <label className="block">
              <span className="opp-meta-mono uppercase mb-1 block">Intended research use</span>
              <textarea
                className="input-field w-full" rows={2} value={form.intendedUse} onChange={set('intendedUse')}
                disabled={submitting} required minLength={10}
                placeholder="Briefly describe the research context."
              />
            </label>
          </div>

          {error && <p className="opp-meta-mono text-danger mb-3 m-0">{error}</p>}

          <button type="submit" className="btn-primary w-full py-3.5 text-base disabled:opacity-40" disabled={submitting}>
            {submitting ? 'Submitting…' : instantApproval ? 'Create account & unlock access' : 'Submit application'}
          </button>
        </form>

        <p className="font-mono text-[10px] text-ink-mute leading-relaxed mt-4 m-0 text-left">
          All materials are supplied strictly for in-vitro research and laboratory use only. Not for human or
          animal consumption. Applicants must be 21+. See our{' '}
          <Link href="/terms" className="text-accent-strong hover:underline">Terms</Link> and{' '}
          <Link href="/compliance" className="text-accent-strong hover:underline">Compliance Policy</Link>.
        </p>
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-gate-title"
      onClick={onClose}
    >
      <div className="card-premium w-full max-w-md p-7 md:p-9 text-center my-8" onClick={(e) => e.stopPropagation()}>
        {body}
        {!result && (
          <button onClick={onClose} className="mt-4 text-[12px] text-ink-mute hover:text-ink-soft underline-offset-2 hover:underline">
            Keep browsing
          </button>
        )}
      </div>
    </div>
  );
}
