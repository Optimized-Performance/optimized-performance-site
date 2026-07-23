import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isFlashSaleActive, flashWindowLabel, FLASH_SALE_PCT } from '../lib/sale'
import { useCohortUi } from '../lib/cohort-ui'

// Site-wide banner for the Tris birthday 24-hour flash (25% off Reta / MT-2 /
// HGH 10iu). Auto-hides outside the window (isFlashSaleActive false).
// Members-only — promo banners are part of the signed-in experience.
// Dismissible with its own localStorage key, independent of the other banners.

const STORAGE_KEY = 'syn-flash-birthday-banner-dismissed-2026-07'

export default function FlashSaleBanner() {
  const cohort = useCohortUi()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!cohort) return
    if (!isFlashSaleActive()) return
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
    <div className="bg-accent text-surface border-b border-line relative">
      <div className="max-w-container mx-auto px-8 py-2.5 flex items-center justify-center gap-3">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-center m-0 flex items-center flex-wrap justify-center gap-x-2 gap-y-1">
          <span className="font-bold">🎉 BIRTHDAY FLASH · {FLASH_SALE_PCT}% OFF RETA · MT-2 · HGH</span>
          <span className="opacity-60">·</span>
          <span className="opacity-80">{flashWindowLabel()}</span>
          <span className="opacity-60">·</span>
          <Link
            href="/shop"
            className="underline underline-offset-2 hover:no-underline text-surface font-bold"
          >
            Shop the flash →
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss flash sale banner"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-surface/70 hover:text-surface hover:bg-surface/10 transition-colors text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
