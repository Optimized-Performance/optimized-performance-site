// Shared affiliate-program constants. Single source of truth so the monthly
// cron (which PAYS royalties) and the affiliate dashboard (which PROJECTS them)
// can't drift apart.

// Flat-rate primary affiliates earn a royalty of this % of OPP's total gross
// revenue (all sales, all channels), paid monthly by api/cron/affiliate-monthly.
export const ROYALTY_PCT = 5
