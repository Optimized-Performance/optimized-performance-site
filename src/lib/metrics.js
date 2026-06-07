// ============================================================
// Lightweight structured metrics — stdout, no external service.
// ============================================================
//
// Vercel captures function stdout, so a single structured JSON line per event
// is queryable/aggregatable in the logs without standing up a metrics backend.
// Built for the createOrder latency question specifically: the PayPal Smart-
// Buttons "pay screen timed out" failure is the server handler exceeding the
// popup's patience window, so we need to SEE handler + processor-call timings
// (per the SOB "MEASURE the timeout fix" open item) — and the same shape lets
// the P4 createOrder slim-down show a clean before/after.
//
// formatMetric is pure (testable); logMetric is the side-effecting emitter.
// Metrics must never break a request — callers should treat them as fire-and-
// forget (logMetric itself swallows formatting errors).

export function formatMetric(event, fields = {}) {
  const flat = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    // Round numeric timings to whole ms for readable, low-cardinality logs.
    flat[k] = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : v
  }
  return `[metric] ${event} ${JSON.stringify(flat)}`
}

export function logMetric(event, fields = {}) {
  try {
    console.log(formatMetric(event, fields))
  } catch {
    // Never let instrumentation throw into a request path.
  }
}

// Monotonic-ish elapsed-ms timer. Returns a function that yields ms since the
// timer was started. (Date.now is fine here — this runs in the Next server
// runtime, not the workflow sandbox where Date.now is stubbed.)
export function startTimer() {
  const t0 = Date.now()
  return () => Date.now() - t0
}
