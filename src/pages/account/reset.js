import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import SEO from '../../components/SEO'

// Set a new password from a signed reset link (/account/reset?token=...).
// On success the API signs the customer in, so we land them on /account.
export default function ResetPassword() {
  const router = useRouter()
  const token = typeof router.query.token === 'string' ? router.query.token : ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    if (password !== confirm) {
      setError('Passwords don’t match.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/customers/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      router.push(data.signedIn ? '/account' : '/account/login?next=/account')
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-8 py-20">
      <SEO title="Set New Password" path="/account/reset" noindex />
      <span className="opp-eyebrow">Account</span>
      <h1 className="font-display font-semibold tracking-display text-4xl mt-3 mb-2 text-ink">
        Set a new password
      </h1>
      <p className="text-ink-soft mb-8">
        Choose a new password for your account. At least 8 characters.
      </p>

      {!token && router.isReady ? (
        <div className="card-premium p-8">
          <p className="text-ink-soft text-sm m-0 mb-4">
            This page needs a reset link from your email.
          </p>
          <Link href="/account/forgot" className="text-accent-strong text-sm hover:underline">
            Request a reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card-premium p-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">New password</span>
            <input
              className="input-field"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Confirm password</span>
            <input
              className="input-field"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="text-danger text-sm m-0">{error}</p>}
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Set password & sign in'}
          </button>
        </form>
      )}
    </div>
  )
}
