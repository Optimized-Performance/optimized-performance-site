import { useState } from 'react';
import Link from 'next/link';
import SEO from '../../components/SEO';
import { Icon } from '../../components/Primitives';
import { verifyAccessToken } from '../../lib/research-access-token';

// Confirm screen for the one-tap approve link in the operator's application
// email. The GET (this page) is SAFE — it only verifies + displays, never
// mutates — so email-client link prefetch/scanners can't silently approve.
// Tapping "Approve" POSTs the token to /api/research-access/approve, which
// does the grant. Mobile-friendly so it works from the phone.
export default function ResearchAccessApprove({ valid, email, token }) {
  const [state, setState] = useState('idle'); // idle | working | done | error
  const [msg, setMsg] = useState('');

  async function approve() {
    setState('working');
    try {
      const res = await fetch('/api/research-access/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setState('done'); }
      else { setState('error'); setMsg(data.error || 'Could not approve — try again.'); }
    } catch {
      setState('error'); setMsg('Network error — try again.');
    }
  }

  return (
    <div className="max-w-narrow mx-auto px-6 py-20">
      <SEO title="Approve research access" description="Approve a researcher-access application." path="/research-access/approve" noindex />
      <div className="card-premium p-8 md:p-10 text-center">
        {!valid ? (
          <>
            <h1 className="font-display font-semibold tracking-display text-2xl m-0 mb-3 text-ink">Link invalid or expired</h1>
            <p className="text-ink-soft text-sm">This approval link is no longer valid. Approve the applicant in Admin → gated-emails instead.</p>
          </>
        ) : state === 'done' ? (
          <>
            <div className="w-14 h-14 rounded-full bg-success text-surface flex items-center justify-center mx-auto mb-4"><Icon name="check" size={26} /></div>
            <h1 className="font-display font-semibold tracking-display text-2xl m-0 mb-2 text-ink">Approved</h1>
            <p className="text-ink-soft text-sm m-0"><span className="font-mono text-ink">{email}</span> can now purchase restricted items once signed in. They&apos;ve been emailed.</p>
          </>
        ) : (
          <>
            <span className="opp-eyebrow">Researcher access</span>
            <h1 className="font-display font-semibold tracking-display text-2xl m-0 mt-2 mb-3 text-ink">Approve this applicant?</h1>
            <p className="text-ink-soft text-sm mb-6">Grant purchasing access to <span className="font-mono text-ink">{email}</span>. They&apos;ll be able to buy restricted items once signed in with this email.</p>
            <button onClick={approve} disabled={state === 'working'} className="btn-primary w-full py-3.5 text-base disabled:opacity-40">
              {state === 'working' ? 'Approving…' : 'Approve access'}
            </button>
            {state === 'error' && <p className="opp-meta-mono text-danger mt-3 m-0">{msg}</p>}
            <p className="opp-meta-mono text-ink-mute mt-4 m-0">Not expecting this? Close the page — nothing is granted until you tap Approve.</p>
          </>
        )}
        <div className="mt-8 pt-6 border-t border-line">
          <Link href="/admin" className="text-sm text-ink-soft hover:text-ink">Go to admin →</Link>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps({ query }) {
  const token = typeof query.token === 'string' ? query.token : '';
  const v = verifyAccessToken(token); // safe: verify + display only, no mutation
  return { props: { valid: !!v.valid, email: v.email || '', token } };
}
