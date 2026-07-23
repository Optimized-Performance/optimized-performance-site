import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isGlp3BogoActive, bogoWindowLabel } from '../lib/sale'
import { useCohortUi } from '../lib/cohort-ui'

// Site-wide banner announcing the GLP-3 Buy 2 Get 1 Free promo. Auto-hides
// outside the promo window (returns null when isGlp3BogoActive is false).
// Dismissible, with its own localStorage key so it's independent of the
// launch / Memorial Day banners.

const STORAGE_KEY = 'opp-glp3-bogo-banner-dismissed-2026'

export default function Glp3BogoBanner() {
  const cohort = useCohortUi()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Members-only: promo banners show for signed-in customers.
    if (!cohort) return
    if (!isGlp3BogoActive()) return
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'true') return
    } catch {
      // localStorage blocked — show anyway, session-scoped
    }
    setVisible(true)
  }, [cohort])

  if (!visible) return null

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Ignore
    }
    setVisible(false)
  }

  return (
    <div className="bg-accent text-ink border-b border-line relative">
      <div className="max-w-container mx-auto px-8 py-2.5 flex items-center justify-center gap-3">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-center m-0 flex items-center flex-wrap justify-center gap-x-2 gap-y-1">
          <span className="font-bold">GLP-3 · BUY 2 GET 1 FREE</span>
          <span className="opacity-60">·</span>
          <span className="opacity-80">{bogoWindowLabel()}</span>
          <span className="opacity-60">·</span>
          <Link
            href="/shop?cat=GLPs"
            className="underline underline-offset-2 hover:no-underline text-ink font-bold"
          >
            Shop GLP-3 →
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss GLP-3 promo banner"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-ink/70 hover:text-ink hover:bg-ink/10 transition-colors text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
