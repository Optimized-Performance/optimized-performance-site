import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isMemorialDaySaleActive, saleWindowLabel, MEMORIAL_DAY_DISCOUNT_PCT } from '../lib/sale'
import { useCohortUi } from '../lib/cohort-ui'

// Site-wide banner announcing the Memorial Day weekend sale. Auto-hides
// outside the sale window (returns null if isMemorialDaySaleActive is false).
//
// Same dismissal pattern as LaunchBanner (localStorage flag), but with a
// sale-specific key so dismissing the launch banner historically doesn't
// also dismiss this one.

const STORAGE_KEY = 'opp-memorial-day-banner-dismissed-2026'

export default function MemorialDayBanner() {
  const cohort = useCohortUi()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Cohort-only: the public/cold face never shows promo banners (AUP review).
    if (!cohort) return
    if (!isMemorialDaySaleActive()) return
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
          <span className="font-bold">MEMORIAL DAY WEEKEND</span>
          <span className="opacity-60">·</span>
          <span className="font-bold">{MEMORIAL_DAY_DISCOUNT_PCT}% OFF + FREE SHIPPING</span>
          <span className="opacity-60">·</span>
          <span className="opacity-80">{saleWindowLabel()}</span>
          <span className="opacity-60">·</span>
          <Link
            href="/shop"
            className="underline underline-offset-2 hover:no-underline text-ink font-bold"
          >
            Shop now →
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss Memorial Day banner"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-ink/70 hover:text-ink hover:bg-ink/10 transition-colors text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
