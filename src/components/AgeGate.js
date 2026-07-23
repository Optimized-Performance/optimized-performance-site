import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Logo } from './Primitives';
import { BRAND } from '../lib/brand';

// Research gate → LOGIN WALL (2026-07-23, Matt's call): attesting alone no
// longer opens the store — every visitor signs in or creates an account (the
// researcher application) right here, and the session persists 90 days
// (lib/customer-session), so returning customers skip the gate entirely.
// Visibility = signed-out visitor on a commerce path. The non-HttpOnly
// opp_customer_present marker cookie (set alongside the HttpOnly session
// cookie) is what pre-paint CSS in _document keys on; a mount-time
// /api/customers/me check heals sessions minted before the marker existed.
//
// The gate stays a client-side overlay: page content still renders underneath
// (SSR), so the catalog remains crawlable — no cloaking. Compliance scanners
// with no JS see the gate markup on every walled page.
const LEGACY_ATTEST_KEY = 'opp-research-gate-v1';
const MARKER = 'opp_customer_present';
const MARKER_MAX_AGE = 90 * 24 * 60 * 60;

// Commerce surface only. Utility pages a signed-out person legitimately needs
// stay reachable: /account/login (sign-in/register/reset), payment-instruction
// + order-status pages linked from emails, /research-access/approve (operator
// one-tap), CoA pages (printed QR codes), legal pages linked from this gate.
const WALLED_PATHS = new Set([
  '/',
  '/shop',
  '/products/[id]',
  '/checkout',
  '/account',
  '/resources',
  '/resources/[tool]',
]);

const ATTESTATIONS = [
  {
    id: 'age',
    label: 'I am 21 years of age or older.',
  },
  {
    id: 'use',
    // Verbatim per the MCC-5169 / payment pre-vet checklist mandated language.
    label:
      'I confirm that I am purchasing these materials exclusively for qualified laboratory research or analytical use. I will not use these materials for human or animal consumption, therapeutic use, clinical use, diagnostic use, dietary supplementation, dosing, injection, ingestion, or administration.',
  },
];

const hasMarker = () => {
  try { return document.cookie.indexOf(`${MARKER}=1`) !== -1; } catch { return false; }
};

const setMarker = () => {
  try { document.cookie = `${MARKER}=1; Path=/; Max-Age=${MARKER_MAX_AGE}; SameSite=Lax; Secure`; } catch { /* ignore */ }
};

export default function AgeGate() {
  const brand = BRAND;
  const router = useRouter();
  // Default NOT verified so the gate renders server-side; _document's
  // pre-paint script hides it for marker holders before first paint.
  const [verified, setVerified] = useState(false);
  const [ready, setReady] = useState(false);
  const [checks, setChecks] = useState({});
  const [mode, setMode] = useState('signup'); // 'signup' | 'signin'
  const [form, setForm] = useState({ name: '', email: '', password: '', institution: '', intendedUse: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const walled = WALLED_PATHS.has(router.pathname);

  useEffect(() => {
    if (hasMarker()) {
      setVerified(true);
      setReady(true);
      return;
    }
    // Heal sessions minted before the marker cookie existed: the session
    // cookie is HttpOnly, so ask the server. 401 → genuinely signed out.
    let cancelled = false;
    fetch('/api/customers/me')
      .then((r) => {
        if (cancelled) return;
        if (r.ok) { setMarker(); setVerified(true); }
        setReady(true);
      })
      .catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  // Lock background scroll while the gate is up so it reads as its own page.
  useEffect(() => {
    if (!ready || verified || !walled) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [ready, verified, walled]);

  if (verified || !walled) return null;

  const allChecked = ATTESTATIONS.every((a) => checks[a.id]);
  const toggle = (id) => setChecks((c) => ({ ...c, [id]: !c[id] }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const passGate = () => {
    try { localStorage.setItem(LEGACY_ATTEST_KEY, 'true'); } catch { /* ignore */ }
    // Full reload so every server-rendered surface (member catalog, Add
    // buttons, approved status) re-renders with the new session.
    window.location.reload();
  };

  async function submit(e) {
    e.preventDefault();
    if (submitting || !allChecked) return;
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const res = await fetch('/api/customers/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Common case behind the login wall: a prior guest-checkout customer
          // who never had a login account. Point them at the reset flow, which
          // now creates the account + sets a first password for known emails.
          setError(
            (data.error || 'Email or password didn’t match.') +
            ' Ordered with us before accounts existed? You may not have a password yet — use “Forgot password?” below to set one, or “New researcher” to create an account with your order email.'
          );
          setSubmitting(false);
          return;
        }
        passGate();
        return;
      }
      // signup → researcher application (creates the account, instant approval,
      // signs in — /api/research-access/request).
      const res = await fetch('/api/research-access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong — please try again.');
        setSubmitting(false);
        return;
      }
      if (data.signedIn) {
        passGate();
        return;
      }
      // Existing email whose password didn't match — application recorded, but
      // they need to sign in with their real password.
      setMode('signin');
      setError('This email already has an account — sign in with its password to continue.');
      setSubmitting(false);
    } catch {
      setError('Something went wrong — please try again.');
      setSubmitting(false);
    }
  }

  const handleLeave = () => {
    window.location.href = 'https://www.google.com';
  };

  return (
    <div
      id="research-gate"
      className="fixed inset-0 z-[100] bg-paper text-ink overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-gate-title"
    >
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          {/* Brand lockup — matches the site header so the gate reads as its own branded page */}
          <div className="flex items-center justify-center gap-3 mb-8 text-ink">
            <Logo size={32} />
            <span className="flex flex-col leading-none">
              <span className="font-display font-semibold text-[15px] tracking-[0.08em]">
                {brand.name.toUpperCase()}
              </span>
              <span className="font-mono text-[10px] text-ink-mute tracking-[0.12em] uppercase mt-1">
                {brand.tagline}
              </span>
            </span>
          </div>

          <div className="card-premium p-8 md:p-10 text-center">
            <span className="opp-eyebrow">Research-Use Verification</span>
            <h1
              id="research-gate-title"
              className="font-display font-semibold tracking-display text-[clamp(26px,4vw,38px)] leading-tight mt-3 mb-4 text-ink"
            >
              Confirm research eligibility
            </h1>
            <p className="text-sm text-ink-soft leading-relaxed mb-6 max-w-md mx-auto">
              All products on this site are supplied strictly as analytical reference materials for
              in-vitro research and laboratory use only. They are not drugs, foods, or cosmetics and
              are not intended for human or animal consumption. Access requires a verified-researcher
              account — confirm each statement, then sign in or apply below.
            </p>

            <div className="flex flex-col gap-4 text-left mb-6">
              {ATTESTATIONS.map((a) => (
                <label
                  key={a.id}
                  className="flex items-start gap-3 text-sm text-ink-soft leading-relaxed cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={!!checks[a.id]}
                    onChange={() => toggle(a.id)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ accentColor: 'var(--accentStrong)' }}
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>

            {/* Sign in / create account */}
            <div className="grid grid-cols-2 gap-2 mb-5" role="tablist" aria-label="Sign in or create an account">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                onClick={() => { setMode('signup'); setError(''); }}
                className={`py-2.5 text-sm font-semibold rounded-opp border transition-colors ${mode === 'signup' ? 'border-accent-strong text-accent-strong' : 'border-line text-ink-mute hover:text-ink-soft'}`}
              >
                New researcher
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                onClick={() => { setMode('signin'); setError(''); }}
                className={`py-2.5 text-sm font-semibold rounded-opp border transition-colors ${mode === 'signin' ? 'border-accent-strong text-accent-strong' : 'border-line text-ink-mute hover:text-ink-soft'}`}
              >
                Sign in
              </button>
            </div>

            <form onSubmit={submit} className="text-left">
              <div className="grid gap-3 mb-4">
                {mode === 'signup' && (
                  <label className="block">
                    <span className="opp-meta-mono uppercase mb-1 block">Full name</span>
                    <input className="input-field w-full" value={form.name} onChange={set('name')} disabled={submitting} required />
                  </label>
                )}
                <label className="block">
                  <span className="opp-meta-mono uppercase mb-1 block">Email</span>
                  <input type="email" className="input-field w-full" value={form.email} onChange={set('email')} disabled={submitting} required autoComplete="email" />
                </label>
                <label className="block">
                  <span className="opp-meta-mono uppercase mb-1 block">{mode === 'signup' ? 'Create a password' : 'Password'}</span>
                  <input
                    type="password" className="input-field w-full" value={form.password} onChange={set('password')}
                    disabled={submitting} required minLength={mode === 'signup' ? 8 : 1}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={mode === 'signup' ? 'At least 8 characters' : undefined}
                  />
                </label>
                {mode === 'signup' && (
                  <>
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
                  </>
                )}
              </div>

              {error && <p className="opp-meta-mono text-danger mb-3 m-0">{error}</p>}

              <button
                type="submit"
                disabled={!allChecked || submitting}
                className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting
                  ? 'One moment…'
                  : mode === 'signup'
                  ? 'Enter — create my researcher account'
                  : 'Enter — sign in'}
              </button>
              {!allChecked && (
                <p className="opp-meta-mono text-[10px] text-ink-mute mt-2 m-0 text-center">
                  Confirm both statements above to continue.
                </p>
              )}
            </form>

            <div className="flex flex-col gap-2 mt-5">
              {mode === 'signin' && (
                <a href="/account/forgot" className="text-[12px] text-ink-mute hover:text-ink-soft underline-offset-2 hover:underline">
                  Forgot password?
                </a>
              )}
              <button
                type="button"
                onClick={handleLeave}
                className="text-sm text-ink-mute hover:text-ink-soft underline-offset-2 hover:underline"
              >
                I do not agree — Leave
              </button>
            </div>

            <p className="opp-meta-mono text-[10px] text-ink-mute mt-6 leading-relaxed">
              You&rsquo;ll stay signed in on this device. By entering you confirm the statements above
              and agree to our{' '}
              <a href="/terms" className="text-accent-strong hover:underline">
                Terms of Service
              </a>
              ,{' '}
              <a href="/privacy" className="text-accent-strong hover:underline">
                Privacy Policy
              </a>
              , and{' '}
              <a href="/compliance" className="text-accent-strong hover:underline">
                Compliance Policy
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
