import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'

// Secrets must exist before the modules capture them at import time — set
// them, then import (vitest hoists imports, so use dynamic import inside
// beforeAll). Same pattern as customer-tokens.test.js.
const COHORT_SECRET = 'test-cohort-secret'
const CUSTOMER_SECRET = 'test-customer-secret'

let cohort
let customer

beforeAll(async () => {
  process.env.COHORT_SESSION_SECRET = COHORT_SECRET
  process.env.CUSTOMER_SESSION_SECRET = CUSTOMER_SECRET
  delete process.env.COHORT_GATE_OFF
  cohort = await import('./cohort-session.js')
  customer = await import('./customer-session.js')
})

// Mirror of the module's internal cookie format: `v1.<issuedAt>.<hmac>`.
function makeCohortCookieValue(issuedAt = Date.now()) {
  const payload = `v1.${issuedAt}`
  const hmac = crypto.createHmac('sha256', COHORT_SECRET).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

function makeRes() {
  const headers = {}
  return {
    headers,
    setHeader(k, v) { headers[k] = v },
    getHeader(k) { return headers[k] },
  }
}

function makeContext(cookieHeader) {
  return {
    req: { headers: cookieHeader ? { cookie: cookieHeader } : {} },
    res: makeRes(),
    query: {},
  }
}

function setCookies(res) {
  const raw = res.getHeader('Set-Cookie')
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

describe('getCohortFromRequest — customer session credential', () => {
  it('unlocks for a valid logged-in customer session and back-fills the cohort cookie', async () => {
    const token = customer.createCustomerToken('cust-123')
    const ctx = makeContext(`opp_customer=${token}`)
    const out = await cohort.getCohortFromRequest(ctx, null)
    expect(out.cohortAllowed).toBe(true)
    expect(out.source).toBe('customer_session')
    const cookies = setCookies(ctx.res)
    expect(cookies.some((c) => c.startsWith('opp_cohort='))).toBe(true)
    expect(cookies.some((c) => c.startsWith('opp_cohort_ui=1'))).toBe(true)
  })

  it('counts in strict mode (a real credential, unlike COHORT_GATE_OFF)', async () => {
    const token = customer.createCustomerToken('cust-123')
    const ctx = makeContext(`opp_customer=${token}`)
    const out = await cohort.getCohortFromRequest(ctx, null, { strict: true })
    expect(out.cohortAllowed).toBe(true)
  })

  it('rejects a tampered customer token', async () => {
    const token = customer.createCustomerToken('cust-123')
    const forged = token.replace('cust-123', 'cust-999')
    const ctx = makeContext(`opp_customer=${forged}`)
    const out = await cohort.getCohortFromRequest(ctx, null)
    expect(out.cohortAllowed).toBe(false)
    expect(setCookies(ctx.res).length).toBe(0)
  })
})

describe('getCohortFromRequest — sliding cohort cookie', () => {
  it('re-issues the cohort cookie on every visit so the 90 days slide', async () => {
    // A cookie issued 30 days ago — still valid, should come back refreshed.
    const oldIssuedAt = Date.now() - 30 * 24 * 60 * 60 * 1000
    const ctx = makeContext(`opp_cohort=${makeCohortCookieValue(oldIssuedAt)}`)
    const out = await cohort.getCohortFromRequest(ctx, null)
    expect(out.cohortAllowed).toBe(true)
    expect(out.source).toBe('cookie')
    const reissued = setCookies(ctx.res).find((c) => c.startsWith('opp_cohort='))
    expect(reissued).toBeTruthy()
    // Fresh issued-at, not the old one echoed back.
    const value = decodeURIComponent(reissued.split(';')[0].split('=').slice(1).join('='))
    const issuedAt = parseInt(value.split('.')[1], 10)
    expect(issuedAt).toBeGreaterThan(oldIssuedAt)
    expect(reissued).toContain('Max-Age=7776000') // full 90 days again
  })

  it('an expired cohort cookie alone does not unlock', async () => {
    const expiredIssuedAt = Date.now() - 91 * 24 * 60 * 60 * 1000
    const ctx = makeContext(`opp_cohort=${makeCohortCookieValue(expiredIssuedAt)}`)
    const out = await cohort.getCohortFromRequest(ctx, null)
    expect(out.cohortAllowed).toBe(false)
  })

  it('an expired cohort cookie + valid customer session still unlocks (the return-customer case)', async () => {
    const expiredIssuedAt = Date.now() - 91 * 24 * 60 * 60 * 1000
    const token = customer.createCustomerToken('cust-123')
    const ctx = makeContext(`opp_cohort=${makeCohortCookieValue(expiredIssuedAt)}; opp_customer=${token}`)
    const out = await cohort.getCohortFromRequest(ctx, null)
    expect(out.cohortAllowed).toBe(true)
    expect(out.source).toBe('customer_session')
  })
})

describe('getCohortFromRequest — cold visitor', () => {
  it('stays locked with no credentials and writes no cookies', async () => {
    const ctx = makeContext(null)
    const out = await cohort.getCohortFromRequest(ctx, null)
    expect(out.cohortAllowed).toBe(false)
    expect(out.source).toBe('none')
    expect(setCookies(ctx.res).length).toBe(0)
  })
})

describe('grantCohortCookies', () => {
  it('sets both the gate cookie and the UI cookie', () => {
    const res = makeRes()
    expect(cohort.grantCohortCookies(res)).toBe(true)
    const cookies = setCookies(res)
    expect(cookies.some((c) => c.startsWith('opp_cohort=') && c.includes('HttpOnly'))).toBe(true)
    expect(cookies.some((c) => c.startsWith('opp_cohort_ui=1') && !c.includes('HttpOnly'))).toBe(true)
  })
})
