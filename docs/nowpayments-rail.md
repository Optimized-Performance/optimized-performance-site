# NOWPayments crypto rail — deployment + smoke-test

Replaces the MoonPay widget that was kill-switched after MoonPay was walked 2026-05-11. Ships in the same shape as the Bankful card rail: server-side invoice creation, customer redirect to NOWPayments HPP, IPN webhook for payment confirmation, redirect back to `/checkout/success`.

## Code changes (already shipped to repo)

- **New:** [src/lib/payments/cryptoProcessor.js](optimized-performance-site/src/lib/payments/cryptoProcessor.js) — NOWPayments invoice creation + IPN signature verification (HMAC-SHA512 over recursively-sorted JSON keys).
- **New:** [src/lib/payments/finalizeOrder.js](optimized-performance-site/src/lib/payments/finalizeOrder.js) — shared post-payment finalization (mark order completed, decrement inventory kit-aware, update affiliate stats, send confirmation, fire inventory alerts). Used by both bankful and nowpayments webhooks.
- **New:** [src/pages/api/webhooks/nowpayments.js](optimized-performance-site/src/pages/api/webhooks/nowpayments.js) — IPN handler. Verifies signature, replay-protects via `webhook_events` table (provider='nowpayments'), calls finalizePaidOrder.
- **Refactored:** [src/pages/api/webhooks/bankful.js](optimized-performance-site/src/pages/api/webhooks/bankful.js) — now uses finalizePaidOrder helper.
- **Edited:** [src/pages/api/orders/create.js](optimized-performance-site/src/pages/api/orders/create.js) — crypto path now calls `createCryptoCheckoutSession`, returns `redirect_url`. The 4% MoonPay surcharge was removed (NOWPayments fee is ~0.5-1% OPP-side, not customer-side).
- **Edited:** [src/pages/checkout.js](optimized-performance-site/src/pages/checkout.js) — removed MoonPayBuyWidget render + dynamic import, removed `showMoonPay` / `orderPlaced` / `serverTotal` / `orderNumber` state (all MoonPay-widget-specific dead code now). Crypto button uses redirect like the card button. Dropped 4% multiplier from price label + payment-method copy.
- **Edited:** [src/pages/_app.js](optimized-performance-site/src/pages/_app.js) — removed MoonPayProvider wrapper.
- **Deleted:** `src/pages/api/webhooks/moonpay.js`.
- **Edited:** [package.json](optimized-performance-site/package.json) — removed `@moonpay/moonpay-react` dep. Run `npm install` to regenerate package-lock.json before deploy.
- **Edited:** [src/pages/api/admin/chargebacks.js](optimized-performance-site/src/pages/api/admin/chargebacks.js) + [src/pages/admin/ChargebacksTab.js](optimized-performance-site/src/pages/admin/ChargebacksTab.js) — added `nowpayments` and `paypal` to the processor enum, kept `moonpay` as `(legacy)` for any historical records.
- **Edited:** privacy.js + index.js + faq.js — replaced MoonPay-specific copy with Bankful + NOWPayments.

## Env vars required (set in Vercel before deploy)

- `NOWPAYMENTS_API_KEY` — NOWPayments dashboard → Store Settings → API keys → Generate. Used server-side for invoice creation. Keep secret.
- `NOWPAYMENTS_IPN_SECRET` — NOWPayments dashboard → Store Settings → IPN. Used server-side for HMAC-SHA512 IPN signature verification. Keep secret.
- `NEXT_PUBLIC_CRYPTO_ENABLED` — flip from `false` to `true` to expose the crypto button on the checkout page. Leave at `false` until the smoke test below passes end-to-end.
- `CRYPTO_PROCESSOR` — optional, defaults to `nowpayments`. Reserved for adding alternate crypto rails (OpenNode, BTCPay) in future.

`MOONPAY_*` env vars in Vercel can be deleted — no code path reads them anymore.

## NOWPayments dashboard config

In the NOWPayments dashboard at https://account.nowpayments.io/:

1. **Store Settings → IPN callback URL:** `https://optimizedperformancepeptides.com/api/webhooks/nowpayments` (production). Save the IPN secret it generates to Vercel as `NOWPAYMENTS_IPN_SECRET`.
2. **Store Settings → API keys:** Generate a new API key. Save to Vercel as `NOWPAYMENTS_API_KEY`.
3. **Coins:** enable BTC, ETH, USDC (ERC-20 on Ethereum), USDT (ERC-20 on Ethereum). Stablecoins matter most for customer UX (no holding-period FX exposure).
4. **Payout addresses:** leave blank for now. Once Ledger is set up and you've generated receive addresses for each chain, plug them into NOWPayments dashboard → Payment Settings → Payout addresses. Until then, balances accumulate inside NOWPayments — fine for smoke testing, not fine for real volume.

## Smoke-test plan (run before flipping `NEXT_PUBLIC_CRYPTO_ENABLED=true`)

1. **Deploy with `NEXT_PUBLIC_CRYPTO_ENABLED=false` first.** Confirm the site still builds and the card-only path renders cleanly. No crypto button should appear.
2. **Set the two NOWPayments env vars** (`NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`) in Vercel.
3. **Flip `NEXT_PUBLIC_CRYPTO_ENABLED=true`** and redeploy. Confirm the crypto button now appears next to the card button on `/checkout`.
4. **Place a small test order** (cheapest SKU + crypto button). You should be redirected to a NOWPayments-hosted invoice page showing the USD amount and a list of crypto options.
5. **Pay with $5 USDT (ERC-20)** from your own wallet — minimum amount to clear network fees. NOWPayments will confirm the payment and redirect back to `/checkout/success?order=OP-...`.
6. **Verify in admin → Orders tab** that the order's `payment_status` flipped to `completed`. Verify inventory decremented for the SKU. Verify confirmation email arrived at the test customer address.
7. **Verify webhook replay protection** by checking the `webhook_events` table for a row with `provider='nowpayments'` and the test payment ID. If you replay the IPN manually, the second insert should hit the unique-constraint conflict and the webhook should respond with `replay_ignored`.
8. **Once smoke passes:** plug Ledger addresses into the NOWPayments dashboard for live payout destination.

## What's left after smoke

- **Card button gating:** while Bankful is terminated, the "Pay with card" button still renders but will fail at the API call (Bankful account dead). Customer sees a generic error and is steered to crypto. Tolerable for now; cleaner UX would be to gate the card button off with a `NEXT_PUBLIC_CARD_ENABLED=false` flag until a replacement card rail is approved. ~10 min if you want it.
- **Ledger payout addresses:** plug into NOWPayments dashboard once Ledger is set up — currently NOWPayments holds the float.
- **Kraken Pro KYB:** finish pages 3-5 to enable the USD off-ramp. Not blocking for crypto checkout to work — checkout pays into NOWPayments → Ledger; Kraken is downstream.

## Architecture notes

- **Invoice flow** (different from Hosted Payment Page direct API) — NOWPayments creates a single invoice URL the customer is redirected to. The invoice page shows multiple coins; customer picks one. Better UX than locking to a single coin at checkout, and avoids us having to manage a coin-selection step on our side.
- **IPN signature:** HMAC-SHA512 over a recursively-sorted-keys JSON-stringified body. Header is `x-nowpayments-sig`. Verified server-side in `cryptoProcessor.js:nowpaymentsParseIpn`. Mismatched sig = 401, missing sig = 401, missing secret env = 401 (intentionally hard-fails on misconfigured deploy).
- **Order status mapping:**
  - NOWPayments `finished` → OPP `completed` (the only state that triggers finalization)
  - NOWPayments `failed` / `expired` / `refunded` → OPP `failed` (no finalization, webhook noops)
  - NOWPayments `partially_paid` → ignored with admin warning log (manual review required — customer underpaid)
  - All others (`waiting`, `confirming`, `confirmed`, `sending`) → no-op, webhook returns `noop` status
- **Replay protection:** same pattern as bankful webhook — insert into `webhook_events(provider, event_id, tx_id)` first, short-circuit on 23505 unique violation before calling finalizePaidOrder.
