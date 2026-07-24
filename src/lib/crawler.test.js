import { describe, it, expect } from 'vitest'
import { isAllowedCrawler } from './crawler'

const req = (ua) => ({ headers: ua === undefined ? {} : { 'user-agent': ua } })

describe('isAllowedCrawler', () => {
  it('lets real crawlers through (they must see the catalog)', () => {
    const crawlers = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; YandexBot/3.0)',
      'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Twitterbot/1.0',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'WhatsApp/2.0',
    ]
    for (const ua of crawlers) expect(isAllowedCrawler(req(ua))).toBe(true)
  })

  it('lets payment-processor / compliance scanners through', () => {
    // These must never hit the wall — a walled scan reads as hidden inventory.
    const scanners = [
      'LegitScriptCrawler/1.0',
      'Stripe/1.0 (+https://stripe.com)',
      'PayPal-Compliance-Scanner',
      'G2WebServices-Monitor/2.0',
      'Mozilla/5.0 (compatible; ComplianceBot; +scanner)',
    ]
    for (const ua of scanners) expect(isAllowedCrawler(req(ua))).toBe(true)
  })

  it('walls ordinary human browsers', () => {
    const browsers = [
      // iOS Safari
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      // Chrome desktop
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Firefox
      'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      // Android Chrome
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    ]
    for (const ua of browsers) expect(isAllowedCrawler(req(ua))).toBe(false)
  })

  it('fails safe (walls) on missing or malformed UA', () => {
    expect(isAllowedCrawler(req(undefined))).toBe(false)
    expect(isAllowedCrawler(req(''))).toBe(false)
    expect(isAllowedCrawler({})).toBe(false)
    expect(isAllowedCrawler(null)).toBe(false)
    expect(isAllowedCrawler(req(12345))).toBe(false)
  })
})
