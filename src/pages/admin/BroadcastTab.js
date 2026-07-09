import { useState, useEffect, useCallback } from 'react';

// Compose + send a sale / new-item broadcast to a customer segment. Sends ride
// the marketing rail (suppression + one-click unsubscribe footer + authenticated
// subdomain), so nothing here bypasses compliance. History table shows past sends.

const SEGMENT_LABELS = {
  purchasers: 'Prior purchasers',
  newsletter: 'Newsletter subscribers',
  all: 'Everyone (deduped)',
};

export default function BroadcastTab({ products = [], showSaveMsg, token }) {
  const authHeaders = useCallback(
    () => ({ 'Content-Type': 'application/json', 'x-admin-token': token || '' }),
    [token]
  );

  const [segments, setSegments] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState('purchasers');
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [uploadingHero, setUploadingHero] = useState(false);
  const [productIds, setProductIds] = useState(() => []);

  async function handleHeroFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { showSaveMsg && showSaveMsg('Hero must be PNG, JPEG, or WebP'); return; }
    setUploadingHero(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ dataUrl, productId: 'broadcast-hero' }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) { setHeroImageUrl(d.url); showSaveMsg && showSaveMsg('Hero uploaded'); }
      else showSaveMsg && showSaveMsg(d.error || 'Hero upload failed');
    } catch { showSaveMsg && showSaveMsg('Hero upload failed'); }
    setUploadingHero(false);
  }

  function toggleProduct(id) {
    setProductIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email/broadcast', { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setSegments(d.segments || null);
        setHistory(d.history || []);
      }
    } catch {
      /* noop */
    }
    setLoading(false);
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const recipientCount = segments ? segments[segment] ?? 0 : 0;

  async function handleTest() {
    if (!subject.trim() || subject.trim().length < 3) { showSaveMsg && showSaveMsg('Subject too short'); return; }
    if (!body.trim() || body.trim().length < 10) { showSaveMsg && showSaveMsg('Body too short'); return; }
    if (!testEmail.trim() || !testEmail.includes('@')) { showSaveMsg && showSaveMsg('Enter a test email address'); return; }
    setTesting(true);
    try {
      const res = await fetch('/api/admin/email/broadcast', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ subject: subject.trim(), body, test: true, testEmail: testEmail.trim(), heroImageUrl: heroImageUrl.trim(), productIds }),
      });
      const d = await res.json();
      showSaveMsg && showSaveMsg(res.ok ? `Test sent to ${d.to}` : `Failed: ${d.error || 'send error'}`);
    } catch (err) {
      showSaveMsg && showSaveMsg(`Failed: ${err.message}`);
    }
    setTesting(false);
  }

  async function handlePreviewAll() {
    if (!testEmail.trim() || !testEmail.includes('@')) { showSaveMsg && showSaveMsg('Enter an email address above first'); return; }
    setPreviewing(true);
    try {
      const res = await fetch('/api/admin/email/preview', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ toEmail: testEmail.trim() }),
      });
      const d = await res.json();
      showSaveMsg && showSaveMsg(res.ok ? `Sent ${d.count} preview emails to ${d.to}${d.failed?.length ? ` (${d.failed.length} failed)` : ''}` : `Failed: ${d.error || 'error'}`);
    } catch (err) {
      showSaveMsg && showSaveMsg(`Failed: ${err.message}`);
    }
    setPreviewing(false);
  }

  async function handleSend() {
    if (!subject.trim() || subject.trim().length < 3) {
      showSaveMsg && showSaveMsg('Subject too short');
      return;
    }
    if (!body.trim() || body.trim().length < 10) {
      showSaveMsg && showSaveMsg('Body too short');
      return;
    }
    const ok = window.confirm(
      `Send "${subject.trim()}" to ${recipientCount} ${SEGMENT_LABELS[segment]}?\n\nThis sends real email immediately. Suppressed/unsubscribed addresses are skipped automatically.`
    );
    if (!ok) return;

    setSending(true);
    try {
      const res = await fetch('/api/admin/email/broadcast', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ subject: subject.trim(), body, segment, heroImageUrl: heroImageUrl.trim(), productIds }),
      });
      const d = await res.json();
      if (!res.ok) {
        showSaveMsg && showSaveMsg(`Failed: ${d.error || 'send error'}`);
      } else {
        showSaveMsg && showSaveMsg(`Sent ${d.sent} / ${d.recipients} (${d.suppressed} suppressed, ${d.failed} failed)`);
        setSubject('');
        setBody('');
        load();
      }
    } catch (err) {
      showSaveMsg && showSaveMsg(`Failed: ${err.message}`);
    }
    setSending(false);
  }

  return (
    <div className="max-w-3xl">
      <h2 className="font-display font-semibold text-xl text-ink m-0 mb-1">Broadcast</h2>
      <p className="text-[13px] text-ink-soft m-0 mb-6">
        Sale &amp; new-item blasts. Every send skips unsubscribed addresses and adds a one-click
        unsubscribe footer automatically.
      </p>

      <div className="bg-surface border border-line rounded-opp-lg p-6 mb-8">
        <label className="block mb-4">
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Audience</span>
          <select
            className="input-field mt-1.5"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            {['purchasers', 'newsletter', 'all'].map((s) => (
              <option key={s} value={s}>
                {SEGMENT_LABELS[s]}{segments ? ` — ${segments[s] ?? 0}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block mb-4">
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Subject</span>
          <input
            className="input-field mt-1.5"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. 48-hour flash sale — 15% off HGH"
          />
        </label>

        <label className="block mb-5">
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Body</span>
          <textarea
            className="input-field mt-1.5 font-sans"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'Plain text. Line breaks are preserved.\n\nPaste links as full URLs — they send as-is.\nThe unsubscribe + address footer is added automatically.'}
          />
        </label>

        <div className="mb-4">
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Hero image (optional)</span>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              className="input-field flex-1"
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="Paste a banner URL, or upload → (shown full-width at top, replaces the logo header)"
            />
            <label className={`btn-outline px-4 py-2 whitespace-nowrap cursor-pointer ${uploadingHero ? 'opacity-60 pointer-events-none' : ''}`}>
              {uploadingHero ? 'Uploading…' : 'Upload'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleHeroFile(e.target.files?.[0])} />
            </label>
            {heroImageUrl && (
              <button type="button" className="text-danger text-[13px] hover:underline" onClick={() => setHeroImageUrl('')}>Clear</button>
            )}
          </div>
          {heroImageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={heroImageUrl} alt="hero preview" className="mt-2 rounded-opp border border-line max-h-32" />
          )}
        </div>

        <div className="mb-5">
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Feature products (optional)</span>
          <div className="mt-1.5 max-h-48 overflow-y-auto border border-line rounded-opp p-2 grid grid-cols-1 sm:grid-cols-2 gap-0.5">
            {products.filter((p) => p.published !== false && !p.isKit).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-[13px] text-ink-soft px-2 py-1 hover:bg-surfaceAlt rounded cursor-pointer">
                <input type="checkbox" checked={productIds.includes(p.id)} onChange={() => toggleProduct(p.id)} />
                <span className="truncate">{p.name}{p.dosage ? ` ${p.dosage}` : ''} — ${Number(p.price || 0).toFixed(2)}</span>
              </label>
            ))}
          </div>
          {productIds.length > 0 && (
            <p className="opp-meta-mono text-ink-mute mt-1.5">{productIds.length} selected — render as a Shop-now grid below your message.</p>
          )}
        </div>

        {/* Test send — preview the branded render in your own inbox first */}
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-line">
          <input
            type="email"
            className="input-field flex-1"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="your@email.com — send yourself a test first"
          />
          <button onClick={handleTest} disabled={testing || sending} className="btn-outline px-5 whitespace-nowrap">
            {testing ? 'Sending…' : 'Send test'}
          </button>
          <button onClick={handlePreviewAll} disabled={previewing || sending} className="btn-outline px-5 whitespace-nowrap" title="Send yourself a branded sample of every automated customer email (confirmation, shipping, refund, verification, etc.) — for QA, uses fake order data.">
            {previewing ? 'Sending…' : 'Preview all automated'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] text-ink-soft">
            {loading ? 'Loading audience…' : `${recipientCount} recipients in this segment`}
          </span>
          <button onClick={handleSend} disabled={sending || loading || testing} className="btn-primary px-6">
            {sending ? 'Sending…' : `Send to ${recipientCount}`}
          </button>
        </div>
      </div>

      <h3 className="font-display font-semibold text-base text-ink m-0 mb-3">Recent sends</h3>
      {history.length === 0 ? (
        <p className="text-[13px] text-ink-mute m-0">No broadcasts sent yet.</p>
      ) : (
        <div className="border border-line rounded-opp overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-surfaceAlt text-ink-mute">
              <tr>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider px-4 py-2.5">Date</th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider px-4 py-2.5">Subject</th>
                <th className="text-left font-mono text-[10px] uppercase tracking-wider px-4 py-2.5">Segment</th>
                <th className="text-right font-mono text-[10px] uppercase tracking-wider px-4 py-2.5">Sent</th>
                <th className="text-right font-mono text-[10px] uppercase tracking-wider px-4 py-2.5">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-line">
                  <td className="px-4 py-2.5 text-ink-soft whitespace-nowrap">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-ink">{h.subject}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{SEGMENT_LABELS[h.segment] || h.segment}</td>
                  <td className="px-4 py-2.5 text-right text-ink">{h.sent_count}/{h.recipient_count}</td>
                  <td className="px-4 py-2.5 text-right text-ink-mute">{h.suppressed_count + h.failed_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
