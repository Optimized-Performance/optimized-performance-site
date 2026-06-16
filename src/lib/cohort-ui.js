import { useState, useEffect } from 'react';

// Client-side cohort signal for MERCHANDISING decisions in globally-rendered
// components (promo banners, cart free-ship bar, checkout alt-pay SAVE) that
// don't receive the server `cohortAllowed` prop from getServerSideProps.
//
// Reads the non-HttpOnly `opp_cohort_ui` cookie set by lib/cohort-session when
// a visitor is cohort-allowed. Returns false during SSR + first paint, then the
// real value after hydration — so the public/cold face renders merchandising-
// free in the server HTML (clean for AUP crawl), and cohort (?ref=) visitors
// get the conversion UI after mount.
//
// NOT a security control. The real catalog gate is server-side and never trusts
// this cookie; this only toggles whether conversion UI is shown.
export function useCohortUi() {
  const [isCohort, setIsCohort] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const present = document.cookie
      .split('; ')
      .some((c) => c.trim() === 'opp_cohort_ui=1');
    setIsCohort(present);
  }, []);
  return isCohort;
}
