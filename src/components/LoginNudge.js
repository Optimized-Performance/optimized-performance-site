import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

// Sign-in nudge for visitors who can't see the cohort-gated catalog (no
// opp_cohort_ui cookie — cold traffic, or a returning customer whose ?ref
// cookie lapsed). Logging in unlocks the gate (lib/cohort-session treats a
// customer session as a cohort credential), so the CTA is the fix, not just
// a prompt. Pattern mirrors GymThingz's AccessPrompt: auto-opens once, can be
// MINIMIZED to a floating tab, minimized state persists for the session, and
// it never shows to cohort-allowed visitors or on the account/checkout flows.
//
// Timing guards: waits for the age gate to be acknowledged (never stacks on
// top of it), then a short delay so it doesn't pop before the page settles.
const KEY = 'syn_login_nudge_v1' // 'min' once the visitor has minimized it
const AGE_GATE_KEY = 'opp-research-gate-v1' // AgeGate's verified flag

function isCohortUi() {
  try {
    return document.cookie.split('; ').some((c) => c.trim() === 'opp_cohort_ui=1')
  } catch {
    return false
  }
}

function isAgeVerified() {
  try {
    return localStorage.getItem(AGE_GATE_KEY) === 'true'
  } catch {
    // localStorage blocked — the age gate stays up in that case, so keep the
    // nudge down too.
    return false
  }
}

export default function LoginNudge() {
  const router = useRouter()
  const [mode, setMode] = useState('hidden') // 'hidden' | 'open' | 'min'

  const suppressed =
    router.pathname.startsWith('/account') || router.pathname.startsWith('/checkout')

  useEffect(() => {
    if (suppressed || isCohortUi()) {
      setMode('hidden')
      return undefined
    }
    let minimized = false
    try {
      minimized = sessionStorage.getItem(KEY) === 'min'
    } catch { /* */ }
    if (minimized) {
      setMode('min')
      return undefined
    }
    // Poll until the age gate has been acknowledged, then open after a beat.
    // Re-check the cohort cookie at fire time — a ?ref navigation or login in
    // another tab may have unlocked the visitor while we waited.
    let openTimer = null
    const gateTimer = setInterval(() => {
      if (!isAgeVerified()) return
      clearInterval(gateTimer)
      openTimer = setTimeout(() => {
        if (!isCohortUi()) setMode('open')
      }, 2000)
    }, 500)
    return () => {
      clearInterval(gateTimer)
      if (openTimer) clearTimeout(openTimer)
    }
  }, [suppressed, router.asPath])

  function minimize() {
    setMode('min')
    try {
      sessionStorage.setItem(KEY, 'min')
    } catch { /* */ }
  }
  const reopen = () => setMode('open')

  if (mode === 'hidden') return null

  // Where to send them back after signing in — the page they're browsing now.
  const nextParam = encodeURIComponent(router.asPath || '/shop')
  const signInHref = `/account/login?mode=login&next=${nextParam}`
  const registerHref = `/account/login?next=${nextParam}`

  // Minimized: a small floating tab. Sits above the mobile tab bar (74px +
  // safe area, see .tabbar-wrap in globals.css) and drops to the corner on
  // desktop where there's no tab bar.
  if (mode === 'min') {
    return (
      <button
        onClick={reopen}
        className="fixed right-4 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] sm:bottom-5 sm:right-5 z-[59] flex items-center gap-2 px-4 py-3 rounded-full bg-accent text-paper text-[11px] font-mono font-bold tracking-[0.14em] uppercase transition hover:brightness-110"
        style={{ boxShadow: '0 8px 26px -8px rgba(245, 166, 35, 0.5)' }}
        aria-label="Sign in for full access"
      >
        <span aria-hidden="true">→</span> Sign in
      </button>
    )
  }

  // Open: the full prompt. X / backdrop / Keep browsing all minimize (never
  // dismiss-forever — it stays reachable until they sign in).
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={minimize} />
      <div className="relative card-premium w-full max-w-md p-7 sm:p-8 text-center opp-page-fade">
        <button
          onClick={minimize}
          aria-label="Minimize"
          className="absolute top-3 right-4 text-ink-mute hover:text-ink text-2xl leading-none"
        >
          ×
        </button>

        <span className="opp-eyebrow">Members</span>
        <h2 className="font-display font-semibold tracking-display text-2xl text-ink mt-3">
          Not finding what you&apos;re looking for?
        </h2>
        <p className="text-ink-soft mt-3 leading-relaxed">
          Login to see full catalog.
        </p>

        <div className="flex flex-col gap-2.5 mt-6">
          <Link href={signInHref} onClick={minimize} className="btn-primary w-full py-3">
            Sign in
          </Link>
          <Link
            href={registerHref}
            onClick={minimize}
            className="w-full py-3 rounded-opp border border-line text-ink-soft hover:text-ink hover:border-ink-mute transition text-sm font-semibold"
          >
            Create an account
          </Link>
          <button
            onClick={minimize}
            className="opp-meta-mono text-[11px] mt-1 text-ink-mute hover:text-ink"
          >
            Keep browsing
          </button>
        </div>
      </div>
    </div>
  )
}
