import { useState } from 'react'
import { useRouter } from 'next/router'
import SEO from '../../components/SEO'

// Customer sign-in / create-account page. One page, two modes. Posts to
// /api/customers/{login,register}; on success the server sets the session
// cookie and we redirect to ?next= (default /checkout). Backs the
// account-required-to-purchase gate (NEXT_PUBLIC_REQUIRE_ACCOUNT).
export default function AccountAuth() {
  const router = useRouter()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const nextUrl = typeof router.query.next === 'string' ? router.query.next : '/checkout'

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    const endpoint = mode === 'login' ? '/api/customers/login' : '/api/customers/register'
    const body = mode === 'login' ? { email, password } : { email, password, name }
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      router.push(nextUrl)
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-8 py-20">
      <SEO title={mode === 'login' ? 'Sign In' : 'Create Account'} path="/account/login" noindex />
      <span className="opp-eyebrow">Account</span>
      <h1 className="font-display font-semibold tracking-display text-4xl mt-3 mb-2 text-ink">
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </h1>
      <p className="text-ink-soft mb-8">
        {mode === 'login'
          ? 'Sign in to continue to checkout.'
          : 'Create an account to purchase research compounds.'}
      </p>

      <form onSubmit={handleSubmit} className="card-premium p-8 flex flex-col gap-4">
        {mode === 'register' && (
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Full Name (optional)</span>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Email</span>
          <input
            className="input-field" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            placeholder="researcher@lab.edu"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Password</span>
          <input
            className="input-field" type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'At least 8 characters' : ''}
            minLength={mode === 'register' ? 8 : undefined}
          />
        </label>

        {error && <p className="opp-meta-mono text-danger m-0">{error}</p>}

        <button type="submit" className="btn-primary w-full py-3.5" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-ink-soft text-center mt-6">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button
          type="button"
          className="text-accent-strong hover:underline font-semibold"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
        >
          {mode === 'login' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
