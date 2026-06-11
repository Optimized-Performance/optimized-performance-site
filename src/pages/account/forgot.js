import { useState } from 'react'
import Link from 'next/link'
import SEO from '../../components/SEO'

// Request a password-reset link. Always shows the same confirmation whether
// or not the email has an account (mirrors the API's no-enumeration posture).
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/customers/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
      } else {
        setSent(true)
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  return (
    <div className="max-w-md mx-auto px-8 py-20">
      <SEO title="Reset Password" path="/account/forgot" noindex />
      <span className="opp-eyebrow">Account</span>
      <h1 className="font-display font-semibold tracking-display text-4xl mt-3 mb-2 text-ink">
        Forgot password
      </h1>
      <p className="text-ink-soft mb-8">
        Enter your account email and we&apos;ll send a reset link. It&apos;s valid for one hour.
      </p>

      {sent ? (
        <div className="card-premium p-8">
          <p className="text-ink m-0 mb-2 font-semibold">Check your inbox</p>
          <p className="text-ink-soft text-sm m-0 mb-4">
            If that email has an account, a reset link is on its way. Don&apos;t see it after a couple
            minutes? Check spam, or try again.
          </p>
          <Link href="/account/login" className="text-accent-strong text-sm hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card-premium p-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Email</span>
            <input
              className="input-field"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          {error && <p className="text-danger text-sm m-0">{error}</p>}
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
          <Link href="/account/login" className="text-ink-soft text-sm text-center hover:text-ink">
            Back to sign in
          </Link>
        </form>
      )}
    </div>
  )
}
