import { describe, it, expect } from 'vitest'
import {
  PAYMENT_STATUS,
  OPEN_PAYMENT_STATES,
  isValidPaymentStatus,
  isOpenPaymentStatus,
  canTransitionPayment,
  assertPaymentTransition,
} from './order-status.js'

const S = PAYMENT_STATUS

describe('payment status vocabulary', () => {
  it('exposes the exact DB string values (no migration)', () => {
    expect(S.AWAITING_PAYMENT).toBe('awaiting_payment')
    expect(S.PENDING).toBe('pending')
    expect(S.COMPLETED).toBe('completed')
    expect(S.ABANDONED).toBe('abandoned')
    expect(S.REFUNDED).toBe('refunded')
  })

  it('open states are the two pre-finalize states', () => {
    expect(OPEN_PAYMENT_STATES).toEqual([S.AWAITING_PAYMENT, S.PENDING])
    expect(isOpenPaymentStatus(S.AWAITING_PAYMENT)).toBe(true)
    expect(isOpenPaymentStatus(S.PENDING)).toBe(true)
    expect(isOpenPaymentStatus(S.COMPLETED)).toBe(false)
  })

  it('validates known statuses', () => {
    expect(isValidPaymentStatus('completed')).toBe(true)
    expect(isValidPaymentStatus('nonsense')).toBe(false)
  })
})

describe('canTransitionPayment', () => {
  it('allows capture from either open state', () => {
    expect(canTransitionPayment(S.AWAITING_PAYMENT, S.COMPLETED)).toBe(true)
    expect(canTransitionPayment(S.PENDING, S.COMPLETED)).toBe(true)
  })

  it('allows expiry (abandon) and refund from open states', () => {
    expect(canTransitionPayment(S.AWAITING_PAYMENT, S.ABANDONED)).toBe(true)
    expect(canTransitionPayment(S.PENDING, S.ABANDONED)).toBe(true)
    expect(canTransitionPayment(S.COMPLETED, S.REFUNDED)).toBe(true)
  })

  it('rejects self-transitions (idempotency is the lookup filter, not the guard)', () => {
    expect(canTransitionPayment(S.COMPLETED, S.COMPLETED)).toBe(false)
    expect(canTransitionPayment(S.AWAITING_PAYMENT, S.AWAITING_PAYMENT)).toBe(false)
  })

  it('rejects re-opening / resurrecting terminal + completed orders', () => {
    expect(canTransitionPayment(S.COMPLETED, S.AWAITING_PAYMENT)).toBe(false)
    expect(canTransitionPayment(S.COMPLETED, S.PENDING)).toBe(false)
    expect(canTransitionPayment(S.REFUNDED, S.COMPLETED)).toBe(false)
    expect(canTransitionPayment(S.ABANDONED, S.COMPLETED)).toBe(false)
    expect(canTransitionPayment(S.REFUNDED, S.AWAITING_PAYMENT)).toBe(false)
  })

  it('rejects abandon -> refund and other nonsense', () => {
    expect(canTransitionPayment(S.ABANDONED, S.REFUNDED)).toBe(false)
    expect(canTransitionPayment('garbage', S.COMPLETED)).toBe(false)
  })
})

describe('assertPaymentTransition', () => {
  it('passes silently on a legal transition', () => {
    expect(() => assertPaymentTransition(S.AWAITING_PAYMENT, S.COMPLETED)).not.toThrow()
  })
  it('throws on an illegal transition', () => {
    expect(() => assertPaymentTransition(S.COMPLETED, S.AWAITING_PAYMENT)).toThrow(/Illegal payment_status transition/)
  })
})
