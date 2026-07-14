import { supabaseAdmin } from "@/lib/db/client";
import { PRO_FAIRUSE_MONTHLY_CAP } from "@/lib/billing/stripe";

/**
 * Pro fair-use backstop — a hard ceiling on metered intake tasks per rolling
 * 30-day window for PRO (flat-price "unlimited") tenants.
 *
 * Pro is sold as unlimited and it is for every real rep: this ceiling sits far
 * above any legitimate usage (see PRO_FAIRUSE_MONTHLY_CAP) and exists only to
 * stop a single runaway account or abusive integration from running up
 * unbounded model cost against a flat $29.99/mo. It is deliberately invisible to
 * normal users — a heavy AE never gets near it.
 *
 * Scope: applies ONLY to the `pro` plan. Free has its own lifetime meter
 * (lib/billing/help-usage.ts); enterprise (negotiated) and demo tenants are
 * exempt. It counts the same `intake_usage` ledger the free meter counts, just
 * windowed to the trailing 30 days (the table is indexed on
 * (tenant_id, created_at) for exactly this query).
 *
 * Fails OPEN: any lookup/counting error returns not-over, so a meter hiccup can
 * never wall a paying user. The trade is the same as the free meter — under-
 * count and let the task through rather than block a legitimate paid action.
 */
export interface FairUseStatus {
  /** True only for `pro` tenants — the only plan the ceiling applies to. */
  applies: boolean;
  /** True once the tenant hit/exceeded the 30-day ceiling. */
  over: boolean;
  /** Metered tasks in the trailing 30 days. */
  count: number;
  /** The ceiling (PRO_FAIRUSE_MONTHLY_CAP). */
  cap: number;
}

export async function getFairUseStatus(tenantId: string): Promise<FairUseStatus> {
  const cap = PRO_FAIRUSE_MONTHLY_CAP;
  try {
    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("plan, is_demo")
      .eq("id", tenantId)
      .single();

    // Only the flat-price Pro plan carries the fair-use ceiling. Free is metered
    // by its own lifetime allowance; enterprise and demo are exempt.
    if (t?.is_demo || t?.plan !== "pro") {
      return { applies: false, over: false, count: 0, cap };
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("intake_usage")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", since);

    const used = count ?? 0;
    return { applies: true, over: used >= cap, count: used, cap };
  } catch {
    return { applies: false, over: false, count: 0, cap };
  }
}

/** 429 body when a Pro tenant trips the fair-use ceiling. Distinct from the
 *  free-tier 402 (freeLimitResponseBody): the user is already paying, so this is
 *  a "reach out" message, never an upgrade prompt. */
export function fairUseResponseBody(status: FairUseStatus) {
  return {
    error: "fair_use_limit" as const,
    message:
      "You've hit an unusually high level of usage for one account. " +
      "Email hello@mallin.io and we'll get you sorted right away.",
    cap: status.cap,
    count: status.count,
  };
}
