/**
 * Stripe client + billing constants.
 *
 * Fail-open like the Clerk wiring: if the STRIPE_* env vars aren't set
 * (preview/dev before keys land), `stripe` is null and billingConfigured()
 * is false. Every billing surface must handle that — the app runs fine with
 * billing dormant; the meter just never has a working "Upgrade" until keys
 * are present.
 */

import Stripe from "stripe";

/** Free-tier cap on CALLS, workspace-wide (metered per transcript submitted —
 *  intro + each added call; see lib/billing/help-usage.ts). New self-serve
 *  workspaces start here; Pro is unlimited (deal_limit set NULL on upgrade).
 *  Column is still named `deal_limit` for legacy reasons; the value is the free
 *  call allowance. Keep in sync with the paywall copy ("3 free calls"). */
export const FREE_DEAL_LIMIT = 3;

/** Pro fair-use backstop: the max metered intake tasks a single flat-price Pro
 *  tenant may run in a rolling 30-day window. Pro is sold as "unlimited" and it
 *  IS for every real rep — this ceiling sits far above any legitimate usage and
 *  exists only to stop one runaway account or abusive integration from running
 *  up unbounded model cost against a flat $29.99/mo. It never touches free
 *  (their own lifetime meter applies) or enterprise/demo (exempt) tenants.
 *  Override per-deploy with PRO_FAIRUSE_MONTHLY_CAP if a tenant legitimately
 *  needs more headroom, rather than dropping the guard. */
export const PRO_FAIRUSE_MONTHLY_CAP = (() => {
  const parsed = Number(process.env.PRO_FAIRUSE_MONTHLY_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
})();

const secret = process.env.STRIPE_SECRET_KEY;

/** Stripe client, or null when STRIPE_SECRET_KEY is absent. apiVersion is
 *  intentionally omitted so the SDK uses the account's pinned default. */
export const stripe = secret ? new Stripe(secret) : null;

/** Price id for the Mallin Pro subscription ($29.99/mo), from Stripe. The
 *  actual charged amount is whatever this Stripe price is set to — the UI copy
 *  ("$29.99/mo") must match the price object this id points at. */
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? null;

/** True only when both the secret key and the Pro price id are present. */
export function billingConfigured(): boolean {
  return Boolean(stripe && STRIPE_PRICE_ID);
}
