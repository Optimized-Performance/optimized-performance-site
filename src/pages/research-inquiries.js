import { useState } from 'react';
import Link from 'next/link';
import SEO from '../components/SEO';

// Researcher-access application. Submitting it emails the operator, who vets
// the applicant and grants purchase access (adds the email to the gated
// allowlist). Restricted (research) SKUs are openly listed but can only be
// bought by an approved account — this is the genuine preventive control.
export default function ResearchInquiries() {
  const [form, setForm] = useState({ name: '', email: '', institution: '', role: '', intendedUse: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/research-access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong — please try again.');
        setSubmitting(false);
        return;
      }
      setAccountCreated(!!data.accountCreated);
      setDone(true);
    } catch {
      setError('Something went wrong — please try again.');
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-container mx-auto px-8 pt-14 pb-20">
      <SEO
        title="Researcher Access"
        description="Apply for a verified-researcher account to purchase restricted research materials."
        path="/research-inquiries"
      />

      <div className="pb-8 border-b border-line">
        <span className="opp-eyebrow">Researcher Access</span>
        <h1 className="font-display font-semibold tracking-display text-[clamp(36px,5vw,64px)] leading-none mt-3 mb-2 text-ink">
          Apply for researcher access
        </h1>
        <p className="text-ink-soft text-sm m-0 max-w-2xl">
          Restricted research materials are supplied only to verified researchers. Submit the
          application below; once your account is approved, purchasing unlocks for all restricted
          items. Reviewed within 1 business day.
        </p>
      </div>

      <div className="max-w-narrow mx-auto pt-12">
        <div className="card-premium p-8 md:p-12">
          {done ? (
            <div className="text-center py-6">
              <h2 className="font-display font-semibold tracking-display text-2xl text-ink m-0 mb-3">Application received</h2>
              <p className="text-ink-soft leading-relaxed max-w-md mx-auto">
                {accountCreated
                  ? 'Thanks — your account is created and you’re signed in. We’ll review your application and email you the moment it’s approved; then you can order restricted items right away.'
                  : 'Thanks — we’ll review your application and email you once approved. Sign in (or create an account) with this same email so access applies the moment it’s granted.'}
              </p>
              <div className="mt-8">
                <Link href="/shop" className="text-sm text-accent-strong hover:underline">← Back to catalog</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <label className="block">
                  <span className="opp-meta-mono uppercase mb-1 block">Full name</span>
                  <input className="input-field w-full" value={form.name} onChange={set('name')} disabled={submitting} required />
                </label>
                <label className="block">
                  <span className="opp-meta-mono uppercase mb-1 block">Email</span>
                  <input type="email" className="input-field w-full" value={form.email} onChange={set('email')} disabled={submitting} required />
                </label>
                <label className="block">
                  <span className="opp-meta-mono uppercase mb-1 block">Institution / affiliation</span>
                  <input className="input-field w-full" value={form.institution} onChange={set('institution')} disabled={submitting} required />
                </label>
                <label className="block">
                  <span className="opp-meta-mono uppercase mb-1 block">Role <span className="text-ink-mute">(optional)</span></span>
                  <input className="input-field w-full" value={form.role} onChange={set('role')} disabled={submitting} placeholder="e.g. Principal Investigator, Lab Manager" />
                </label>
              </div>
              <label className="block mb-4">
                <span className="opp-meta-mono uppercase mb-1 block">Intended research use</span>
                <textarea className="input-field w-full" rows={4} value={form.intendedUse} onChange={set('intendedUse')} disabled={submitting} required
                  placeholder="Briefly describe the research context and how the materials will be used." />
              </label>

              <label className="block mb-6">
                <span className="opp-meta-mono uppercase mb-1 block">Create a password <span className="text-ink-mute">(optional)</span></span>
                <input type="password" className="input-field w-full" value={form.password} onChange={set('password')} disabled={submitting}
                  autoComplete="new-password" placeholder="At least 8 characters" />
                <span className="opp-meta-mono text-ink-mute block mt-1">
                  Set one to create your account now (so you can order the moment you&apos;re approved). Already have an account? Leave blank.
                </span>
              </label>

              {error && <p className="opp-meta-mono text-danger mb-4 m-0">{error}</p>}

              <button type="submit" className="btn-primary w-full py-3.5 text-base disabled:opacity-40" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>

              <p className="font-mono text-[11px] text-ink-mute leading-relaxed mt-8 m-0">
                All materials are supplied strictly for in-vitro research and laboratory use only.
                Not drugs, foods, or cosmetics. Not intended for human or animal consumption.
                Applicants must be 21 years of age or older. See our{' '}
                <Link href="/terms" className="text-accent-strong hover:underline">Terms of Service</Link>{' '}
                and{' '}
                <Link href="/compliance" className="text-accent-strong hover:underline">Compliance Policy</Link>.
              </p>
            </form>
          )}
        </div>

        <div className="text-center mt-8">
          <Link href="/shop" className="text-sm text-ink-soft hover:text-ink transition-colors">
            ← Back to catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
