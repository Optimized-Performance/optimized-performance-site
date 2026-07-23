import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signAccessToken, verifyAccessToken } from './research-access-token.js'

const ORIG = process.env.CUSTOMER_SESSION_SECRET

beforeEach(() => { process.env.CUSTOMER_SESSION_SECRET = 'test-secret-abc' })
afterEach(() => { process.env.CUSTOMER_SESSION_SECRET = ORIG })

describe('research-access-token', () => {
  it('round-trips a valid token and normalizes email', () => {
    const t = signAccessToken('  Researcher@Lab.EDU ')
    const v = verifyAccessToken(t)
    expect(v.valid).toBe(true)
    expect(v.email).toBe('researcher@lab.edu')
  })

  it('rejects a tampered payload', () => {
    const t = signAccessToken('a@b.com')
    const [, sig] = t.split('.')
    // swap the payload for a different email, keep the old signature
    const forgedPayload = Buffer.from(JSON.stringify({ t: 'raccess', email: 'attacker@evil.com', exp: Date.now() + 100000 }))
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(verifyAccessToken(`${forgedPayload}.${sig}`).valid).toBe(false)
  })

  it('rejects a garbage / empty token', () => {
    expect(verifyAccessToken('').valid).toBe(false)
    expect(verifyAccessToken('not-a-token').valid).toBe(false)
    expect(verifyAccessToken('a.b.c').valid).toBe(false)
  })

  it('rejects when the signing secret is unset (fail closed)', () => {
    const t = signAccessToken('a@b.com')
    delete process.env.CUSTOMER_SESSION_SECRET
    expect(verifyAccessToken(t).valid).toBe(false)
    // and cannot mint without a secret
    expect(signAccessToken('a@b.com')).toBe(null)
  })
})
