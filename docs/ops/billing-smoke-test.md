# Billing smoke test — prove the payment leg end-to-end (no real charge)

Goal: confirm the full self-serve payment path works **in production** —
paywall → Stripe Checkout → webhook → limit lifted — without paying a real
$29. The trick: Checkout already has `allow_promotion_codes: true`, so a
**100%-off promo code** takes the amount to $0 while exercising the exact same
Checkout + webhook + entitlement path a paying customer hits.

Run this once now (the payment leg has **never** been exercised in prod), and
again after any billing change.

Time: ~10 minutes. You need: Stripe dashboard access + a throwaway email.

---

## 0. Pre-flight (2 min) — confirm prod is actually configured

The code fails safe if Stripe env vars are missing (Checkout returns 503
"Billing isn't set up yet"), so verify first:

- **Vercel → Project → Settings → Environment Variables (Production):** confirm
  all three are present and **live**-mode:
  - `STRIPE_SECRET_KEY` = `sk_live_…`
  - `STRIPE_PRICE_ID` = `price_…` (the Pro $29.99/mo price)
  - `STRIPE_WEBHOOK_SECRET` = `whsec_…`
- **Stripe → Developers → Webhooks:** confirm an endpoint exists pointing at
  `https://mallin.io/api/webhooks/stripe`, subscribed to at least:
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`. Its signing secret must equal the
  `STRIPE_WEBHOOK_SECRET` above.

If any of these are missing, that's the finding — fix it here before continuing.

---

## 1. Create the 100%-off promo code (2 min, Stripe dashboard)

1. Stripe → **Products → Coupons → New**:
   - Percentage off: **100%**
   - Duration: **Once** (or Forever — doesn't matter for the test)
   - Name it `SMOKE_TEST_100`.
2. On the coupon, **Create a promotion code** (customer-facing code), e.g.
   `SMOKETEST`. This is what you type in Checkout.

> Do this in the **same mode (live)** as the prod keys, or the code won't appear
> in the live Checkout.

---

## 2. Run the funnel as a brand-new AE (4 min)

1. Open an **incognito window** → `https://mallin.io/start`.
2. Sign up with a throwaway email (e.g. `you+smoke1@yourdomain.com`). Complete
   verification. You should land on `/welcome` → `/cockpit`.
3. Burn the 3 free **calls** (the meter counts calls, not searches — a pre-call
   research brief is free and does NOT count). Fastest path: from `/new`, choose
   **"Paste a call"** and submit any short transcript text three times (they can
   be trivial — you only need three `deal_transcripts` rows).
   - After the 3rd, the "+ New deal" / "+ Add next call" buttons should show the
     locked (paywall) state.
4. Trigger the wall: try to start a **4th** call. You should see the
   **"You've used your 3 free calls"** upgrade screen.

If you never hit a wall after 3 calls, that's a finding — check the meter.

---

## 3. Pay with the promo code (1 min)

1. Click **"Upgrade to Pro — $29.99/mo"**.
   - If you get "Billing isn't set up yet" → prod env vars are missing (step 0).
2. On Stripe Checkout, click **"Add promotion code"**, enter `SMOKETEST` →
   total becomes **$0.00**.
3. Complete checkout. (At 100% off Stripe may not require a card; if it does,
   this is a live account — use a real card only if you're comfortable, but the
   $0 total means no charge.)
4. You're redirected to `/new?upgraded=1`.

---

## 4. Verify the unlock (1 min)

- **Instant path (the fix):** `/new?upgraded=1` now reconciles entitlement on
  load, so the paywall should already be gone. Try a **4th call** — it should go
  through.
- **Webhook path:** Stripe → Developers → Webhooks → your endpoint → confirm
  `checkout.session.completed` delivered **200**.
- **Database** — the tenant should now be Pro/unlimited. Run:

  ```bash
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | sed 's/^DATABASE_URL=//')" \
    npx tsx -e '
    import { Client } from "pg";
    (async () => {
      const c = new Client({ connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
      await c.connect();
      const r = await c.query(
        "select name, plan, deal_limit, stripe_customer_id, stripe_subscription_id from tenants where owner_email ilike $1",
        ["%smoke1%"]);
      console.log(r.rows);
      await c.end();
    })();'
  ```

  Expect: `plan=pro`, `deal_limit=null`, `stripe_customer_id` + `stripe_subscription_id` set.

**Pass = all three:** 4th call works, webhook 200, DB shows `plan=pro` /
`deal_limit=null`.

---

## 5. Cleanup (1 min)

- **Stripe:** cancel the test subscription (Customers → the test customer →
  Cancel subscription). Optionally archive the `SMOKE_TEST_100` coupon so it
  can't be reused.
- **Cancel path bonus check:** after cancel, Stripe fires
  `customer.subscription.deleted` → the tenant should revert to `plan=free`,
  `deal_limit=3`. Re-run the query above to confirm. (This validates the
  downgrade path too.)
- **DB (optional):** delete the throwaway tenant + its rows if you don't want
  test data lingering (cascade from `tenants`), or just leave it — it's clearly
  a smoke-test account.

---

## What each step proves

| Step | Proves |
|---|---|
| 0 | Prod Stripe keys + webhook endpoint are actually configured |
| 2 | Signup → tenant → 3-free-calls meter → server-side paywall all work in prod |
| 3 | Checkout session creation works with the real Pro price |
| 4 | Webhook signature verifies + entitlement flips to unlimited; instant reconcile works |
| 5 | Cancellation reverts to free (the downgrade path) |
