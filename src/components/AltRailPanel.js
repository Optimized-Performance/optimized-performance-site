import { useState } from 'react';
import { Icon } from './Primitives';

// Venmo Business handle (mirrors lib/alerts.js + the legacy instructions page so
// a missing env var never breaks the flow). Exported so the checkout can render
// the "@handle" recipient on the Venmo tile without re-declaring it.
export const VENMO_HANDLE = process.env.NEXT_PUBLIC_VENMO_BUSINESS_HANDLE || 'optimizedperformance';

// Venmo universal link — opens the app on mobile with the amount + note
// prefilled, venmo.com on desktop. Mirrors src/pages/checkout/venmo-instructions.js.
export function buildVenmoUrl({ amount, orderNumber }) {
  const params = new URLSearchParams({ txn: 'pay', audience: 'private', recipients: VENMO_HANDLE });
  if (amount) params.set('amount', String(amount));
  if (orderNumber) params.set('note', orderNumber);
  return `https://venmo.com/?${params.toString()}`;
}

// Inline Zelle/Venmo pay panel — replaces the old redirect-to-instructions-page
// flow (which read as a sketchy side-door and cost conversion). Two phases:
//   intro → one-line explainer + a single "Continue" CTA
//   pay   → the order is reserved server-side; show the EXACT amount, recipient,
//           memo/note, a Venmo deep-link (mobile) and/or a scannable Zelle QR,
//           one-tap copy on every field, and an "I've sent it" button that lands
//           on the shared /checkout/success confirmation.
// We do NOT ship on the customer's "I've sent it" — admin still reconciles against
// the actual bank/Venmo deposit (unchanged source of truth). The cart isn't
// cleared until /checkout/success, so this panel can't be unmounted by the
// empty-cart guard mid-payment.
//
// Props:
//   method        'zelle' | 'venmo'
//   previewAmount  number — shown before the order is reserved (server total wins after)
//   recipient      string — Zelle email or "@venmohandle"
//   qrSrc          string — optional scannable Zelle QR image src
//   disabled       bool   — form incomplete
//   onCreateOrder  () => Promise<{ ok, orderNumber?, total?, error? }>
//   onDone         (orderNumber) => void
export default function AltRailPanel({ method, previewAmount, recipient, qrSrc, disabled, onCreateOrder, onDone }) {
  const [phase, setPhase] = useState('intro');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [order, setOrder] = useState(null); // { orderNumber, total }
  const [copied, setCopied] = useState(null);
  const [qrOk, setQrOk] = useState(true);
  const isZelle = method === 'zelle';
  const label = isZelle ? 'Zelle' : 'Venmo';

  async function start() {
    setBusy(true);
    setErr('');
    const r = await onCreateOrder();
    setBusy(false);
    if (!r || !r.ok) {
      if (r && r.error) setErr(r.error);
      return;
    }
    setOrder({ orderNumber: r.orderNumber, total: r.total });
    setPhase('pay');
  }

  function copyValue(key, value) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  if (phase === 'intro') {
    return (
      <div className="rounded-opp-lg border border-line bg-surfaceAlt p-5">
        <p className="text-sm text-ink-soft m-0 mb-4 leading-relaxed">
          {isZelle
            ? `Pay $${previewAmount.toFixed(2)} by Zelle straight from your bank app — no card, no processor, and you save 5%. Tap continue and we'll show you exactly where to send it.`
            : `Pay $${previewAmount.toFixed(2)} with Venmo in a couple taps. Tap continue and we'll open Venmo with the amount and note already filled in.`}
        </p>
        <button type="button" onClick={start} disabled={disabled || busy} className="btn-primary w-full py-4 text-base">
          {busy ? 'Starting…' : `Continue with ${label}`}
        </button>
        {disabled && <p className="opp-meta-mono text-ink-mute text-center mt-2 m-0">Complete the fields above and the research acknowledgment to continue.</p>}
        {err && <p className="opp-meta-mono text-danger text-center mt-2 m-0">{err}</p>}
      </div>
    );
  }

  // phase === 'pay' — order is reserved; total is server-authoritative.
  const amt = order?.total != null ? Number(order.total).toFixed(2) : previewAmount.toFixed(2);
  const memo = order?.orderNumber || '';
  const venmoUrl = !isZelle ? buildVenmoUrl({ amount: amt, orderNumber: memo }) : null;

  return (
    <div className="rounded-opp-lg border-2 border-accent-strong bg-surface p-5">
      <div className="text-center pb-4 mb-4 border-b border-line">
        <div className="opp-meta-mono text-ink-mute">Send exactly</div>
        <div className="font-display font-semibold tracking-display text-[34px] leading-none text-ink mt-1">${amt}</div>
      </div>

      {!isZelle && (
        <a href={venmoUrl} target="_blank" rel="noopener noreferrer" className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 mb-4">
          <Icon name="arrow" size={16} /> Open Venmo (amount + note prefilled)
        </a>
      )}
      {isZelle && qrSrc && qrOk && (
        <div className="flex flex-col items-center mb-4">
          <img
            src={qrSrc}
            alt="Scan with your bank app to pay Syngyn Inc by Zelle"
            onError={() => setQrOk(false)}
            className="w-full max-w-[260px] h-auto rounded-opp border border-line bg-white p-2"
          />
          <span className="opp-meta-mono text-ink-mute mt-2">Scan with your bank app, or use the details below</span>
        </div>
      )}

      <div className="grid gap-3">
        <CopyRow label={isZelle ? 'Send to' : 'Venmo handle'} value={recipient} copied={copied === 'recipient'} onCopy={() => copyValue('recipient', recipient)} mono={!isZelle} />
        <CopyRow label="Amount" value={`$${amt}`} copied={copied === 'amount'} onCopy={() => copyValue('amount', amt)} mono />
        <CopyRow
          label={isZelle ? 'Memo (required)' : 'Note (required)'}
          value={memo || '—'}
          copied={copied === 'memo'}
          onCopy={() => copyValue('memo', memo)}
          mono
          hint={`Put ONLY this order number in the ${isZelle ? 'Zelle memo' : 'Venmo note'} so we can match your payment to your order.`}
        />
      </div>

      <button type="button" onClick={() => onDone(memo)} className="btn-primary w-full py-4 text-base mt-5">
        <Icon name="check" size={18} /> I&apos;ve sent the payment
      </button>
      <p className="opp-meta-mono text-ink-mute text-center mt-3 m-0">
        Order reserved up to 72 hours. We confirm during business hours and ship within 1 business day of payment landing.
      </p>
    </div>
  );
}

function CopyRow({ label, value, copied, onCopy, mono, hint }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">{label}</span>
        <button type="button" onClick={onCopy} className="opp-meta-mono text-accent-strong hover:underline" aria-label={`Copy ${label}`}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={`p-3 bg-surfaceAlt border border-line rounded-opp ${mono ? 'font-mono' : ''} text-ink break-all`}>{value}</div>
      {hint && <p className="text-xs text-ink-mute mt-1.5 m-0">{hint}</p>}
    </div>
  );
}
