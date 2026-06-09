/** @type {import('next').NextConfig} */

// Content-Security-Policy. Shipped in REPORT-ONLY mode first (2026-06-08): the
// browser logs violations to the console but does NOT block anything, so it
// can't break checkout/PayPal. Watch the console on the live site for a few
// days, tighten the allowlist to whatever real violations show, THEN switch the
// header key to 'Content-Security-Policy' to enforce. Allowlist covers PayPal
// SDK, Supabase, NOWPayments redirect, and Vercel insights.
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' required by Next.js inline bootstrap + PayPal SDK
  // until a nonce pipeline is added; tighten once violations are reviewed.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://www.paypalobjects.com https://*.paypal.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.paypal.com https://api.nowpayments.io https://vitals.vercel-insights.com",
  "frame-src https://*.paypal.com https://*.nowpayments.io",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy-Report-Only', value: CSP },
        ],
      },
    ]
  },
}

module.exports = nextConfig
