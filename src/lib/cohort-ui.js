import { useState, useEffect } from 'react';

// Client-side MEMBER signal for merchandising decisions in globally-rendered
// components (promo banners, cart free-ship bar, checkout perks) that don't
// receive a server prop from getServerSideProps.
//
// Re-keyed 2026-07-23 from the referral (opp_cohort_ui) cookie to the account
// marker: promotions and conversion UI are a signed-in-member experience — the
// same members-area pattern as GymThingz. Reads the non-HttpOnly
// `opp_customer_present` cookie that lib/customer-session sets alongside the
// HttpOnly session token on every sign-in. Returns false during SSR + first
// paint, then the real value after hydration — the signed-out render is the
// plain storefront with no promotional merchandising.
//
// NOT a security control. Catalog visibility and purchase gating are enforced
// server-side (lib/catalog getVisibleCatalog + /api/orders/create) and never
// trust this cookie; this only toggles whether member merchandising is shown.
// Hook name is legacy ("cohort") — the rename lands with the post-8/1 cohort
// teardown.
export function useCohortUi() {
  const [isMember, setIsMember] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const present = document.cookie
      .split('; ')
      .some((c) => c.trim() === 'opp_customer_present=1');
    setIsMember(present);
  }, []);
  return isMember;
}
