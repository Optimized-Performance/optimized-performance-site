// ============================================================
// Order payment_status — the canonical state machine.
// ============================================================
//
// Before this, payment_status was a set of bare string literals
// ('awaiting_payment', 'pending', 'completed', 'abandoned', 'refunded')
// compared and assigned ad-hoc across create.js, finalizeOrder.js, the three
// processor webhooks, the mark-paid endpoints, the expire cron, and refund.js.
// Nothing enforced which transitions were legal, so a bug could (e.g.) re-open a
// refunded order or double-finalize. This module is the single source of truth:
// the vocabulary + the legal-transition graph + pure guards.
//
// Values match the existing DB strings EXACTLY — adopting the constants is a
// pure refactor, no data migration.
//
// NOTE: fulfillment_status (pending/packed/shipped/cancelled — the ops pipeline)
// is a SEPARATE concern on its own column and is intentionally not modeled here;
// it's a clean candidate for a parallel machine if/when that pipeline grows.

export const PAYMENT_STATUS = {
  AWAITING_PAYMENT: 'awaiting_payment', // instant rail (paypal/card/crypto), pre-capture
  PENDING: 'pending',                   // human-review rails (zelle/venmo) or fraud-flagged
  COMPLETED: 'completed',               // paid + finalized (inventory/affiliate/email fired)
  ABANDONED: 'abandoned',               // instant-rail order never captured (cron-expired)
  REFUNDED: 'refunded',                 // fully refunded (fulfillment_status also -> cancelled)
}

// The two pre-finalize "open" states a payment can be captured from. Used by
// finalizeOrder's lookup filter (and anywhere "is this order still awaiting
// money?" matters).
export const OPEN_PAYMENT_STATES = [PAYMENT_STATUS.AWAITING_PAYMENT, PAYMENT_STATUS.PENDING]

// Legal transitions. Any (from -> to) not listed here is rejected. A self-
// transition (from === to) is NOT a transition and returns false — callers rely
// on the lookup filter (e.g. finalize's .in(OPEN_PAYMENT_STATES)) for the
// already-in-target-state idempotency no-op, not on this guard.
const PAYMENT_TRANSITIONS = {
  [PAYMENT_STATUS.AWAITING_PAYMENT]: [PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.ABANDONED, PAYMENT_STATUS.REFUNDED],
  [PAYMENT_STATUS.PENDING]: [PAYMENT_STATUS.COMPLETED, PAYMENT_STATUS.ABANDONED, PAYMENT_STATUS.REFUNDED],
  [PAYMENT_STATUS.COMPLETED]: [PAYMENT_STATUS.REFUNDED],
  [PAYMENT_STATUS.ABANDONED]: [], // terminal
  [PAYMENT_STATUS.REFUNDED]: [],  // terminal
}

export function isValidPaymentStatus(status) {
  return Object.values(PAYMENT_STATUS).includes(status)
}

export function isOpenPaymentStatus(status) {
  return OPEN_PAYMENT_STATES.includes(status)
}

// True iff `from -> to` is a legal, non-self transition.
export function canTransitionPayment(from, to) {
  if (from === to) return false
  return (PAYMENT_TRANSITIONS[from] || []).includes(to)
}

// Throws on an illegal transition — call at every payment_status write site so
// an unexpected state change fails loud instead of silently corrupting an order.
export function assertPaymentTransition(from, to) {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`Illegal payment_status transition: ${from} -> ${to}`)
  }
}
