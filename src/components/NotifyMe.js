import { useState } from 'react';

// "Notify me when it ships" capture for preorder / coming-soon SKUs. POSTs to
// /api/notify/subscribe with the product SKU so we can blast a per-product
// launch list when inventory lands. Mirrors the footer NewsletterSignup
// pattern (one input, one button, one status line); server treats an
// already-registered email as success so we never reveal list membership.
export default function NotifyMe({ sku, productId, productName }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'submitting' | 'success' | 'error'
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/notify/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, product_sku: sku, product_id: productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Could not save your request. Try again.');
        return;
      }
      setStatus('success');
      setMessage(
        data.alreadySubscribed
          ? "You're already on the list — we'll email you the moment it ships."
          : "Done — we'll email you the moment it ships."
      );
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Could not save your request. Try again.');
    }
  }

  return (
    <div className="mt-3 p-4 bg-surfaceAlt border border-line rounded-opp">
      <div className="opp-meta-mono text-accent-strong mb-1">NOT READY TO PREORDER?</div>
      <p className="text-[13px] text-ink-soft leading-snug mb-3 m-0">
        Leave your email and we&apos;ll notify you the moment{' '}
        {productName || 'this product'} is back in stock — no commitment.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input-field flex-1 text-sm"
          aria-label="Email address for restock notification"
          disabled={status === 'submitting'}
        />
        <button
          type="submit"
          className="btn-outline text-xs px-4 py-2 whitespace-nowrap"
          disabled={status === 'submitting'}
        >
          {status === 'submitting' ? 'Saving…' : 'Notify me'}
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
    </div>
  );
}
