import { useEffect, useState } from 'react';

// Launch at local midnight on May 19, 2026. Using local-time constructor so
// visitors see a countdown that matches their day — no TZ off-by-one confusion.
const LAUNCH_YEAR = 2026;
const LAUNCH_MONTH_INDEX = 4; // May (0-indexed)
const LAUNCH_DAY = 19;

const STORAGE_KEY = 'opp-launch-banner-dismissed';

// Default CTA: opens a pre-filled email to the corporate inbox so signups
// reach a real mailbox out of the box. Swap for a Telegram invite / waitlist
// page whenever that's live.
const WAITLIST_URL =
  'mailto:support@syngyn.co?subject=Waitlist%20%E2%80%94%20add%20me%20for%20launch&body=Add%20me%20to%20the%20OPP%20launch%20waitlist.';

function daysUntilLaunch() {
  const launch = new Date(LAUNCH_YEAR, LAUNCH_MONTH_INDEX, LAUNCH_DAY, 0, 0, 0);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  // Normalize both to midnight local so we count calendar days, not wall-clock
  // diff. "Today vs launch day" should read as 26 days regardless of time.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = launch.getTime() - today.getTime();
  return Math.round(diffMs / msPerDay);
}

export default function LaunchBanner() {
  const [visible, setVisible] = useState(false);
  const [days, setDays] = useState(null);

  useEffect(() => {
    const d = daysUntilLaunch();
    // Auto-hide once we're past launch day (d < 0).
    if (d < 0) return;

    try {
      if (localStorage.getItem(STORAGE_KEY) === 'true') return;
    } catch {
      // localStorage blocked — show anyway, session-scoped
    }

    setDays(d);
    setVisible(true);
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Ignore
    }
    setVisible(false);
  };

  let leadText;
  let dayText;
  if (days === 0) {
    leadText = 'LIVE NOW';
    dayText = 'Official launch day';
  } else if (days === 1) {
    leadText = 'Launching tomorrow';
    dayText = 'Pre-orders ship day-one';
  } else {
    leadText = 'Launching May 19, 2026';
    dayText = `${days} days · Pre-orders ship day-one`;
  }

  return (
    <div className="bg-ink text-paper border-b border-line relative">
      <div className="max-w-container mx-auto px-8 py-2 flex items-center justify-center gap-3">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-center m-0 flex items-center flex-wrap justify-center gap-x-2 gap-y-1">
          <span className="font-semibold">{leadText}</span>
          <span className="opacity-50">·</span>
          <span className="text-accent">{dayText}</span>
          <span className="opacity-50">·</span>
          <a
            href={WAITLIST_URL}
            className="underline underline-offset-2 hover:no-underline text-paper font-semibold"
          >
            Join the waitlist →
          </a>
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss launch banner"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-paper/70 hover:text-paper hover:bg-white/10 transition-colors text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}
