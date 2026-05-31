# Payment Rail Orchestration Engine — Spec

**Status:** Draft for review (2026-05-30)
**Owner:** Matt
**Purpose:** Throttle volume across payment rails so no single freezable rail exceeds its survivable threshold, routing overflow to the durable (un-freezable) rails. Protects the July Tris-consolidation bolus from a single-rail freeze taking down the month.

---

## 1. Why this exists (strategy)

- Card is the highest-converting rail but **structurally rented, not ownable** for the RUO peptide model (LegitScript is unobtainable — see `feedback_legitscript_dead_end`). Card rails freeze/terminate; the question is *when*, not *if*.
- Cold scaled e-commerce demand trends toward **~80% card**, but **safe card capacity is ~40-50%** of volume — a single rail's AML/velocity/risk review trips well below 80% of a $200-300K month.
- The engine's job is to **engineer that gap shut**: pull demand off card down to survivable levels and onto crypto/Zelle, and spread the remaining card volume across multiple rails so each stays under its own freeze line.
- Two halves: **soft** (the live 10% crypto/Zelle discount — demand-shift) and **hard** (this engine — per-rail caps + cutover).

**Strategic ceiling:** at a $250K/mo July, card ≤ ~$125-150K combined (spread across every card rail), crypto + Zelle carrying the other ~$100-125K. **The way to raise the card ceiling is more card rails in parallel (N banks × per-bank threshold), not more volume per rail.**

---

## 2. Core model

### Rail types
| Type | Rails | Cap behavior |
|---|---|---|
| **card** | `paypal`, `card` (honest acquirer e.g. AllayPay) | Hard monthly + daily cap; freeze-risk if exceeded. |
| **durable** | `crypto`, `zelle` | Very high / uncapped — the overflow release valve. Always available. |
| **fragile-p2p** | `venmo` | Minimal cap; AUP-fragile, kept off the July bolus. |

> Note: `payment_method='paypal'` aggregates PayPal account + Pay-Later + Venmo-via-PayPal + card-via-PayPal — all settle through the PayPal rail, so they all count to the `paypal` bucket. Correct as-is.

### Per-rail config (new `rail_config` table — tunable without redeploy)
Ceilings are **empirical** — they must be editable from the admin UI as you learn what each rail survives, *not* hardcoded in env.

```sql
-- supabase-migration-v22.sql
CREATE TABLE IF NOT EXISTS rail_config (
  rail            text PRIMARY KEY,          -- 'paypal' | 'card' | 'crypto' | 'zelle' | 'venmo'
  display_name    text NOT NULL,
  rail_type       text NOT NULL,             -- 'card' | 'durable' | 'p2p'
  enabled         boolean NOT NULL DEFAULT true,
  monthly_cap     numeric,                   -- USD; NULL = uncapped (durable rails)
  daily_cap       numeric,                   -- USD; NULL = derive from monthly/30 * buffer
  sort_order      integer NOT NULL DEFAULT 100, -- fallback priority (lower = preferred)
  large_order_block boolean NOT NULL DEFAULT false, -- phase 2: suppress for orders > threshold
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**Seed values (conservative starting points — tune up as each rail proves it survives):**
| rail | type | monthly_cap | daily_cap | sort_order | notes |
|---|---|---|---|---|---|
| `card` (AllayPay) | card | approved cap (~50000) | derive | 10 | honest rail; cap is contractual, run to it |
| `paypal` | card | 60000 | 3000 | 20 | category-misrep rail — ramp ≤ +50% MoM, smoothness > level; spike = review = total loss |
| `zelle` | durable | NULL (uncapped) | NULL | 30 | bank-to-bank, no platform AUP, no receiving limits — release valve alongside crypto; memo discipline only |
| `crypto` | durable | NULL (uncapped) | NULL | 40 | release valve; real limit is Kraken off-ramp velocity |
| `venmo` | p2p | 10000 | derive | 90 | AUP-fragile; keep off the July bolus |

`daily_cap` derivation when NULL: `monthly_cap / 30 * 1.5` (buffer for lumpiness) — prevents blowing a month through one rail in days.

---

## 3. Utilization tracking

`lib/rail-utilization.js` → `getRailUtilization({ period, day })`:
- Sums `orders.total` grouped by `payment_method` for the current month (MTD) and current day (DTD).
- **Counts toward cap:** `payment_status IN ('completed')` for settled volume (the freeze-relevant number), plus a separate "in-flight" figure for `awaiting_payment` + `pending` (P2P awaiting confirmation) shown in admin but **decision needed** on whether in-flight counts against the hard cap (see §7).
- Excludes `abandoned`, `blocked`, and refunded amounts.
- Mirrors the existing per-period sum pattern in `api/cron/affiliate-monthly.js` (`sumOrders`).

Returns per rail: `{ mtd, dtd, monthly_cap, daily_cap, remaining_monthly, remaining_daily, available }`.

---

## 4. Availability decision

`GET /api/rails/availability?orderTotal=NNN` → returns which rails the checkout should render.

A rail is **available** when:
```
enabled
  AND (monthly_cap IS NULL OR mtd < monthly_cap)
  AND (daily_cap   IS NULL OR dtd < daily_cap)
  AND (NOT large_order_block OR orderTotal <= large_order_threshold)   -- phase 2
```
- Durable rails (crypto/zelle, uncapped) are **always available** → checkout never shows zero rails.
- Response is the available rails in `sort_order` (fallback priority): preferred card rail → next card rail → … → durable rails.

---

## 5. Checkout integration (`checkout.js`)

- On mount, fetch `/api/rails/availability?orderTotal={discountedTotal}`.
- Render only available payment buttons, in `sort_order`. Env `NEXT_PUBLIC_*_ENABLED` flags remain as the master on/off; availability is the dynamic layer on top.
- **Fallback order keeps a card option visible as long as any card rail has headroom** — only drop to crypto/Zelle-only once every card rail is capped. At that point the 10% banner becomes the primary CTA (already built).
- If availability changes between load and submit, the server rejects (§6) and the client re-fetches + re-renders.

## 6. Server-side enforcement (`api/orders/create.js`)

Defense against direct API hits (same pattern as the existing card/paypal env-gate 503s):
- Before creating the order, call `getRailUtilization` and reject if the chosen `paymentMethod` rail is over cap:
  ```
  503 { error: 'This payment method is at capacity. Please use crypto or Zelle.' }
  ```
- Durable rails never hit this. This is the authoritative throttle — the UI gating is convenience.

## 7. Admin (`Rails` tab)

- Per-rail utilization bars: MTD $ / cap, DTD $ / cap, % used, remaining headroom.
- In-flight (pending P2P) shown distinctly from settled.
- Inline-editable caps + enabled toggle (writes `rail_config`) — tune live during July, no deploy.
- **Freeze/hold event log** (`rail_events`: rail, event_type, date, note) — manual entry when a rail flags/holds/terminates. Feeds the learning loop: ratchet caps based on what actually survives. Strate Lab's ~1yr PayPal survival is the upper-bound comp.

---

## 8. Rollout phases

**Phase 1 — pre-July, must-have (the core throttle):**
- `rail_config` table (migration v22) + seed
- `lib/rail-utilization.js`
- `GET /api/rails/availability`
- checkout button gating
- server-side cap enforcement in `create.js`
- basic admin utilization view (read-only bars + editable caps)

**Phase 2 — refinement:**
- per-order-size routing (`large_order_block` + threshold; big tickets → durable rails)
- daily velocity smoothing (derived daily caps active)
- `rail_events` freeze-log + learning loop

**Phase 3 — optimization:**
- weighted/probabilistic card-vs-durable session routing to hit a target mix smoothly
- auto-ratcheting caps from survival data

---

## 9. Decisions — RESOLVED 2026-05-30

1. **Caps enforced on settled `completed` volume only**; in-flight (pending P2P / awaiting_payment) shown separately in admin, does NOT block. ✓
2. **Seed numbers confirmed**, with one change: **Zelle is uncapped** (durable release valve alongside crypto — bank-to-bank into BoA-1990, no platform AUP, no receiving limits; the personal-cashtag Cash App AML risk does not transfer to a business bank rail). PayPal $60K seed stands.
3. **Per-order-size routing → Phase 2.** Cap-and-cutover is the Phase-1 win. ✓
4. **PayPal ramp: +50% MoM, manual bump** in admin each month (Matt watches it anyway). ✓

Net: the only capped rails are **PayPal** and the **honest card acquirer**. Crypto + Zelle are uncapped and always available.
