/**
 * Shared core for the Stripe billing setup scripts (sandbox + live).
 *
 * The "Mallín Pro" plan shape lives here ONCE so the test and live setups can
 * never drift on price, product name, or webhook events. Uses the raw Stripe
 * REST API over fetch — no npm dependency. Entrypoints:
 *   - setup-sandbox-billing.mjs  (test mode, sk_test_)
 *   - setup-live-billing.mjs     (live mode, sk_live_, real money)
 */

// ── The Mallín Pro plan — single source of truth for both modes ──────
export const PRODUCT_NAME = "Mallín Pro";
export const PRICE_CENTS = 2900; // $29.00/mo
export const CURRENCY = "usd";
export const WEBHOOK_URL = "https://mallin.io/api/webhooks/stripe";
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];
// ─────────────────────────────────────────────────────────────────────

/** Bind a Stripe REST caller to a secret key. Exits the process on any
 *  Stripe error so callers can stay linear. */
export function makeStripe(sk) {
  return async function stripe(path, pairs) {
    const body = new URLSearchParams();
    for (const [k, v] of pairs) body.append(k, v);
    const res = await fetch("https://api.stripe.com/v1/" + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + sk,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const j = await res.json();
    if (!res.ok) {
      console.error(`✗ Stripe error on ${path}:`, j.error?.message || JSON.stringify(j));
      process.exit(1);
    }
    return j;
  };
}

/** Create the product + monthly price + webhook endpoint. Returns the ids and
 *  the webhook signing secret. The secret key (test vs live) decides which
 *  mode these land in. */
export async function createBillingResources(stripe) {
  console.log(`→ Creating product "${PRODUCT_NAME}"…`);
  const product = await stripe("products", [["name", PRODUCT_NAME]]);

  console.log(`→ Creating price ($${(PRICE_CENTS / 100).toFixed(2)}/mo)…`);
  const price = await stripe("prices", [
    ["product", product.id],
    ["unit_amount", String(PRICE_CENTS)],
    ["currency", CURRENCY],
    ["recurring[interval]", "month"],
  ]);

  console.log(`→ Creating webhook endpoint → ${WEBHOOK_URL}…`);
  const wh = await stripe("webhook_endpoints", [
    ["url", WEBHOOK_URL],
    ...WEBHOOK_EVENTS.map((e) => ["enabled_events[]", e]),
  ]);

  return { productId: product.id, priceId: price.id, webhookSecret: wh.secret };
}
