import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Stripe card-processor wiring — fail-closed paths that need no network.
// (A real charge is verified live with keys; these lock the dispatch + the
// signature/secret guards so the rail can't silently degrade.)

const ORIG = { ...process.env }

async function loadFresh() {
  // PROCESSOR is read at module load, so reset the cache to re-read env.
  vi.resetModules()
  return import('./cardProcessor.js')
}

beforeEach(() => {
  process.env.CARD_PROCESSOR = 'stripe'
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder_not_called'
})
afterEach(() => {
  process.env = { ...ORIG }
})

describe('cardProcessor — stripe dispatch (fail-closed)', () => {
  it('rejects an unsupported CARD_PROCESSOR', async () => {
    process.env.CARD_PROCESSOR = 'bankful'
    const mod = await loadFresh()
    await expect(mod.parseWebhookEvent({ rawBody: '{}', headers: {} })).rejects.toThrow(/must be one of/)
  })

  it('webhook with no Stripe-Signature → verified:false', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder'
    const mod = await loadFresh()
    const r = await mod.parseWebhookEvent({ rawBody: '{}', headers: {} })
    expect(r.verified).toBe(false)
    expect(r.reason).toMatch(/Missing Stripe-Signature/)
  })

  it('webhook with no configured secret → verified:false', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const mod = await loadFresh()
    const r = await mod.parseWebhookEvent({ rawBody: '{}', headers: { 'stripe-signature': 'x' } })
    expect(r.verified).toBe(false)
    expect(r.reason).toMatch(/WEBHOOK_SECRET not configured/)
  })

  it('webhook with a bad signature → verified:false (constructEvent throws, caught)', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder'
    const mod = await loadFresh()
    const r = await mod.parseWebhookEvent({ rawBody: '{}', headers: { 'stripe-signature': 't=1,v1=deadbeef' } })
    expect(r.verified).toBe(false)
    expect(r.reason).toMatch(/Signature verification failed/)
  })

  it('reconcile with an empty session id → safe no-op, never throws', async () => {
    const mod = await loadFresh()
    const r = await mod.reconcileCardSession({ sessionId: '' })
    expect(r).toEqual({ paid: false, status: 'no_session' })
  })

  it('inline experience is refused on stripe (fail loud, not a broken panel)', async () => {
    const mod = await loadFresh()
    await expect(mod.createCardPaymentIntent({ orderNumber: 'X' })).rejects.toThrow(/inline is not supported on stripe/)
  })
})
