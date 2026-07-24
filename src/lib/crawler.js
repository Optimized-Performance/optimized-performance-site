// Crawler allowlist for the login-walled catalog.
//
// The storefront is a login wall: a signed-out human receives an EMPTY catalog
// (see the walled-page getServerSideProps in pages/index, pages/shop, and
// pages/products/[id]), so the product list can't be pulled out of the page
// source without creating an account. The AgeGate overlay still forces
// sign-in + research-use attestation on top — this just removes the data that
// used to sit underneath it in the HTML.
//
// BUT payment-processor / card-brand compliance scanners and search engines
// MUST still see the real inventory, or a vetting crawl reads the empty/walled
// page as hidden or cloaked merchandise. This allowlist threads that needle:
// recognized crawlers get the full server-rendered catalog (exactly the
// public-tier set an anonymous visitor used to get), human browsers get the
// wall.
//
// SIGNAL: the User-Agent string — the only thing these crawlers reliably
// share, and search engines + compliance scanners alike advertise a bot token.
// A determined human could spoof a bot UA to view the catalog while signed
// out; that's an accepted tradeoff. The goal is ordinary customers, not
// adversaries, and the PURCHASE gate is still enforced server-side at checkout
// (/api/orders/create) regardless of what the catalog page shows.
//
// Keep the pattern broad — a processor scanner that gets walled is the failure
// we're avoiding. Add processor-specific agents here as they surface in logs.
const CRAWLER_UA =
  /(bot|crawler|crawling|spider|scraper|scanner|slurp|search|preview|fetch|monitor|validator|legitscript|risksolutions|g2webservices|maxmind|kount|forter|visa|mastercard|americanexpress|discover|paypal|stripe|adyen|worldpay|facebookexternalhit|embedly|whatsapp|telegram)/i

// True if the request's User-Agent looks like an allowlisted crawler. Never
// throws — an unreadable header just means "not a crawler" (fails safe: the
// wall stays up).
export function isAllowedCrawler(req) {
  try {
    const ua = req && req.headers && req.headers['user-agent']
    return typeof ua === 'string' && ua.length > 0 && CRAWLER_UA.test(ua)
  } catch {
    return false
  }
}
