import { useState, useEffect, useCallback } from 'react';

// Compose + send a sale / new-item broadcast to a customer segment. Sends ride
// the marketing rail (suppression + one-click unsubscribe footer + authenticated
// subdomain), so nothing here bypasses compliance. History table shows past sends.

const SEGMENT_LABELS = {
  purchasers: 'Prior purchasers',
  newsletter: 'Newsletter subscribers',
  all: 'Everyone (deduped)',
};

export default function BroadcastTab({ showSaveMsg, token }) {
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
        body: JSON.stringify({ subject: subject.trim(), body, segment }),
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

        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] text-ink-soft">
            {loading ? 'Loading audience…' : `${recipientCount} recipients in this segment`}
          </span>
          <button onClick={handleSend} disabled={sending || loading} className="btn-primary px-6">
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
