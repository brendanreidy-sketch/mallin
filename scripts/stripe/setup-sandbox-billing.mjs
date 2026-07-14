/**
 * One-shot Stripe SANDBOX billing setup (run by YOU, with YOUR key).
 *
 * Prereq: put your Stripe SANDBOX secret key in .env.local first:
 *   STRIPE_SECRET_KEY=sk_test_...
 *
 * Then run:   node scripts/stripe/setup-sandbox-billing.mjs
 *
 * Creates the "Mallín Pro" product + monthly price + webhook, writes
 * STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET back into .env.local, and prints
 * the block to paste into Vercel (Production). For LIVE/real charges, use
 * setup-live-billing.mjs instead.
 *
 * Re-running creates duplicates; run once per environment.
 */
import fs from "fs";
import { makeStripe, createBillingResources } from "./_billing-common.mjs";

const envUrl = new URL("../../.env.local", import.meta.url);
const env = fs.readFileSync(envUrl, "utf8");
const sk = (env.match(/^STRIPE_SECRET_KEY=(.*)$/m)?.[1] || "")
  .replace(/^["']|["']$/g, "")
  .trim();
if (!sk) {
  console.error("✗ Add STRIPE_SECRET_KEY=sk_test_... to .env.local first.");
  process.exit(1);
}
if (!sk.startsWith("sk_test_")) {
  console.error("✗ Refusing to run: this is the SANDBOX setup and needs a test key (sk_test_).");
  console.error("  For real charges, use: node scripts/stripe/setup-live-billing.mjs");
  process.exit(1);
}

const stripe = makeStripe(sk);
const { priceId, webhookSecret } = await createBillingResources(stripe);

// Write the two new values back into .env.local (replace the empty slots).
const setLine = (c, key, val) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(c) ? c.replace(re, `${key}=${val}`) : `${c}\n${key}=${val}`;
};
let content = env;
content = setLine(content, "STRIPE_PRICE_ID", priceId);
content = setLine(content, "STRIPE_WEBHOOK_SECRET", webhookSecret);
fs.writeFileSync(envUrl, content);

console.log("\n✓ Wrote STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET into .env.local.");
console.log('\n── Now paste THIS block into Vercel → Settings → Environment Variables (Production), then redeploy ──\n');
console.log(`STRIPE_SECRET_KEY=${sk}`);
console.log(`STRIPE_PRICE_ID=${priceId}`);
console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
console.log("");
