// First-party funnel tracker — CLIENT ONLY. Fires lightweight anonymous events
// to /api/track via sendBeacon (non-blocking) so we can see the top of the
// funnel (visit -> product view -> add to cart -> checkout) that never reaches
// the orders table. No PII: an anonymous session id + the affiliate ref only.

const SID_COOKIE = 'opp_sid';
const SID_TTL_DAYS = 365;

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function randomId() {
  // 16 random bytes hex — crypto when available, Math.random fallback.
  try {
    const a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

// Get-or-create the anonymous session id (cookie, ~1yr). Browser only.
export function getSessionId() {
  if (typeof document === 'undefined') return '';
  let sid = readCookie(SID_COOKIE);
  if (!sid) {
    sid = randomId();
    const maxAge = SID_TTL_DAYS * 24 * 60 * 60;
    document.cookie = `${SID_COOKIE}=${sid}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
  return sid;
}

// Fire an event. Best-effort, never throws, never blocks UX.
export function track(eventType, payload = {}) {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({
      session_id: getSessionId(),
      event_type: eventType,
      path: payload.path || window.location.pathname,
      product_id: payload.product_id || null,
      ref: readCookie('opp_ref') || null,
      value: typeof payload.value === 'number' ? payload.value : null,
      meta: payload.meta || null,
    });
    const url = '/api/track';
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* swallow — analytics must never break the page */
  }
}
