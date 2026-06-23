import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { Logo } from '../../components/Primitives'

export default function AffiliateLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/affiliates/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Login failed')
        setSubmitting(false)
        return
      }
      const data = await res.json()
      // Stash token in sessionStorage — survives same-tab nav, clears on tab close.
      // Refresh in same tab keeps the session; closing the tab forces re-login.
      try { sessionStorage.setItem('opp_aff_token', data.token) } catch { /* fail */ }
      router.replace('/affiliate')
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  return (
    <>
      <Head>
        <title>Affiliate Login · OPP</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="border-b border-line bg-white">
          <div className="max-w-6xl mx-auto px-5 py-4 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 text-ink no-underline">
              <Logo size={28} />
              <div>
                <div className="font-display font-semibold text-base">Syngyn</div>
                <div className="opp-meta-mono">Affiliate Portal</div>
              </div>
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-5 py-12">
          <div className="card-premium p-8 w-full max-w-md">
            <h1 className="font-display font-semibold text-2xl text-ink mb-1">Affiliate sign in</h1>
            <p className="opp-meta-mono mb-6">Enter the credentials provided by your admin contact.</p>

            <form onSubmit={handleSubmit}>
              <label className="flex flex-col gap-1.5 mb-4">
                <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Email</span>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  className="input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label className="flex flex-col gap-1.5 mb-5">
                <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-opp px-3 py-2 mb-4">
                  {error}
                </div>
              )}
              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="opp-meta-mono mt-6 text-ink-mute text-center">
              Don&apos;t have credentials? Email{' '}
              <a className="text-accent-strong" href="mailto:support@syngyn.co">
                support@syngyn.co
              </a>
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
