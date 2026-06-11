import { describe, it, expect, beforeAll } from 'vitest'

// Signing key must exist before the module's functions run — set it, then
// import (vitest hoists imports, so use dynamic import inside beforeAll).
let tokens

beforeAll(async () => {
  process.env.CUSTOMER_SESSION_SECRET = 'test-secret-for-customer-tokens'
  tokens = await import('./customer-tokens.js')
})

const CID = '7f3c2a10-1111-2222-3333-444455556666'
const HASH_A = 'scrypt$N=16384$r=8$p=1$saltsaltsalt$aaaaaaaaaaaaaaaaaaaaaaaa'
const HASH_B = 'scrypt$N=16384$r=8$p=1$saltsaltsalt$bbbbbbbbbbbbbbbbbbbbbbbb'

describe('verify tokens', () => {
  it('round-trips', () => {
    const t = tokens.signVerifyToken(CID)
    expect(t).toBeTruthy()
    const v = tokens.verifyVerifyToken(t)
    expect(v.valid).toBe(true)
    expect(v.customerId).toBe(CID)
  })

  it('rejects tampered payloads', () => {
    const t = tokens.signVerifyToken(CID)
    const [payload, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ t: 'verify', cid: 'attacker', exp: Date.now() + 9e9 }))
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(tokens.verifyVerifyToken(`${forged}.${sig}`).valid).toBe(false)
    expect(tokens.verifyVerifyToken(`${payload}.AAAA`).valid).toBe(false)
    expect(tokens.verifyVerifyToken('garbage').valid).toBe(false)
    expect(tokens.verifyVerifyToken(null).valid).toBe(false)
  })

  it('verify tokens are not valid as reset tokens (type binding)', () => {
    const t = tokens.signVerifyToken(CID)
    expect(tokens.verifyResetToken(t, HASH_A).valid).toBe(false)
  })
})

describe('reset tokens', () => {
  it('round-trips against the same password hash', () => {
    const t = tokens.signResetToken(CID, HASH_A)
    const v = tokens.verifyResetToken(t, HASH_A)
    expect(v.valid).toBe(true)
    expect(v.customerId).toBe(CID)
  })

  it('dies when the password hash changes (effective single-use)', () => {
    const t = tokens.signResetToken(CID, HASH_A)
    expect(tokens.verifyResetToken(t, HASH_A).valid).toBe(true)
    expect(tokens.verifyResetToken(t, HASH_B).valid).toBe(false)
  })

  it('peekCustomerId reads cid without validating', () => {
    const t = tokens.signResetToken(CID, HASH_A)
    expect(tokens.peekCustomerId(t)).toBe(CID)
    expect(tokens.peekCustomerId('not-a-token')).toBe(null)
  })

  it('reset tokens are not valid as verify tokens (type binding)', () => {
    const t = tokens.signResetToken(CID, HASH_A)
    expect(tokens.verifyVerifyToken(t).valid).toBe(false)
  })
})
