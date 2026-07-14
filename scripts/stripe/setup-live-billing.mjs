/**
 * One-shot Stripe LIVE billing setup — creates the REAL "Mallín Pro" product +
 * monthly price + webhook that will charge REAL money.
 *
 * Deliberately different from the sandbox script: it does NOT read .env.local
 * and does NOT write to it. Local dev must stay on the sandbox key, so the live
 * secret key is passed transiently via env var (never lands on disk) and the
 * resulting values are PRINTED for you to paste into Vercel → Production only.
 *
 * Prereqs:
 *   1. Finish Stripe account activation (payouts enabled) — live charges are
 *      blocked until then.
 *   2. Create/reveal a LIVE secret key in Stripe (sk_live_…). It's shown once;
 *      if you lose it, create a new one.
 *
 * Run (key piped from your clipboard, so it never touches disk):
 *   LIVE_CONFIRM=1 STRIPE_LIVE_SECRET_KEY="$(pbpaste)" \
 *     node scripts/stripe/setup-live-billing.mjs
 *
 * Then add the printed values (plus your sk_live_ key) to Vercel (Production)
 * and redeploy. Re-running creates duplicates; run once.
 */
import { makeStripe, createBillingResources, PRICE_CENTS } from "./_billing-common.mjs";

const sk = (process.env.STRIPE_LIVE_SECRET_KEY || "").replace(/^["']|["']$/g, "").trim();

if (!sk) {
  console.error("✗ No live key. Pass it transiently (it won't be written to disk):");
  console.error('    LIVE_CONFIRM=1 STRIPE_LIVE_SECRET_KEY="$(pbpaste)" node scripts/stripe/setup-live-billing.mjs');
  process.exit(1);
}
if (sk.startsWith("sk_test_")) {
  console.error("✗ That's a SANDBOX key (sk_test_). For test setup use setup-sandbox-billing.mjs.");
  process.exit(1);
}
if (!sk.startsWith("sk_live_")) {
  console.error("✗ Refusing to run: expected a LIVE secret key (sk_live_…). Got something else.");
  process.exit(1);
}
if (process.env.LIVE_CONFIRM !== "1") {
  console.error("⚠ This creates LIVE billing that charges REAL money.");
  console.error(`  It will create "Mallín Pro" at $${(PRICE_CENTS / 100).toFixed(2)}/mo plus a live webhook.`);
  console.error("  Re-run with LIVE_CONFIRM=1 prepended once you're sure.");
  process.exit(1);
}

console.log("→ LIVE mode. Creating real billing resources…\n");
const stripe = makeStripe(sk);
const { priceId, webhookSecret } = await createBillingResources(stripe);

console.log("\n✓ Created LIVE product, price, and webhook.");
console.log("\n⚠ Do NOT put these in .env.local — local dev stays on the sandbox key.");
console.log("── Add these to Vercel → Settings → Environment Variables (Production ONLY), then redeploy ──\n");
console.log(`STRIPE_PRICE_ID=${priceId}`);
console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
console.log("STRIPE_SECRET_KEY=  ← your sk_live_… key (the one you piped in; not reprinted here for safety)");
console.log("");
