import { useEffect, useState } from 'react';
import { Logo } from './Primitives';
import { BRAND } from '../lib/brand';

// Bumped from the old 'opp-age-verified' key so EVERY returning visitor
// re-attests against the new researcher gate (full-page + per-statement
// checkbox attestation, reworked 2026-06-22 per Whop onboarding review).
const STORAGE_KEY = 'opp-research-gate-v1';

// Each statement must be individually affirmed before entry — a single
// "I agree" button is not an attestation. Mirrors the research-use language
// validated server-side at checkout (/api/orders/create.js).
const ATTESTATIONS = [
  {
    id: 'age',
    label: 'I am 21 years of age or older.',
  },
  {
    id: 'researcher',
    label:
      'I am a qualified researcher or institutional buyer, and I am accessing this site solely to acquire analytical reference materials for in-vitro laboratory research.',
  },
  {
    id: 'ruo',
    label:
      'I understand all products are research-use-only (RUO) — they are not drugs, foods, or cosmetics, and are not intended for human or animal consumption, administration, or any therapeutic, clinical, or diagnostic use.',
  },
];

export default function AgeGate() {
  const brand = BRAND;
  // Default to "verified" so SSR and first client paint match (no hydration
  // flash); useEffect then reveals the gate only if not previously attested.
  const [verified, setVerified] = useState(true);
  const [ready, setReady] = useState(false);
  const [checks, setChecks] = useState({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== 'true') setVerified(false);
    } catch {
      // localStorage blocked (private browsing, etc.) — default to showing gate
      setVerified(false);
    }
    setReady(true);
  }, []);

  // Lock background scroll while the gate is up so it reads as its own page.
  useEffect(() => {
    if (!ready || verified) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [ready, verified]);

  if (!ready || verified) return null;

  const allChecked = ATTESTATIONS.every((a) => checks[a.id]);

  const handleEnter = () => {
    if (!allChecked) return;
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Ignore — session-scoped acknowledgment still ok
    }
    setVerified(true);
  };

  const handleLeave = () => {
    window.location.href = 'https://www.google.com';
  };

  const toggle = (id) => setChecks((c) => ({ ...c, [id]: !c[id] }));

  return (
    <div
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
            <p className="text-sm text-ink-soft leading-relaxed mb-7 max-w-md mx-auto">
              All products on this site are supplied strictly as analytical reference materials for
              in-vitro research and laboratory use only. They are not drugs, foods, or cosmetics and
              are not intended for human or animal consumption. Confirm each statement below to enter.
            </p>

            <div className="flex flex-col gap-4 text-left mb-8">
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

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleEnter}
                disabled={!allChecked}
                className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Enter — I affirm all of the above
              </button>
              <button
                type="button"
                onClick={handleLeave}
                className="text-sm text-ink-mute hover:text-ink-soft underline-offset-2 hover:underline"
              >
                I do not agree — Leave
              </button>
            </div>

            <p className="opp-meta-mono text-[10px] text-ink-mute mt-7 leading-relaxed">
              By entering you confirm the statements above and agree to our{' '}
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
