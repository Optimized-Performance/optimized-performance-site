// Shared order-number generator — OP-YYYYMMDD-XXXX. Used by both the customer
// checkout (/api/orders/create) and the admin manual-order endpoint, which
// previously each carried an identical private copy.
export function generateOrderNumber() {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `OP-${y}${m}${d}-${rand}`
}
