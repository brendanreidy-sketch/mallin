import { supabaseAdmin } from "@/lib/db/client";
import { FREE_DEAL_LIMIT } from "@/lib/billing/stripe";

/**
 * Free-tier meter — metered on TASKS, workspace-wide.
 *
 * A "task" is any of the three intake actions, each of which produces a brief:
 *   research  — "Call coming up" (pre-call research, no transcript)
 *   call      — "Paste a call"   (new deal from a transcript)
 *   follow_up — "Follow-up"      (append a call to an existing deal)
 *
 * All three count equally: free allowance is 3 tasks total, and the 4th task of
 * ANY mix walls. Each successful action logs one row in `intake_usage`
 * (lib/billing/intake-usage.ts), so the count is that ledger — NOT
 * `deal_transcripts` (which only exists for call/follow_up and so used to leave
 * research un-metered + unlimited).
 *
 * Ask-Mallín chat and follow-up brief regenerations without a new call are
 * deliberately NOT metered (chat powers the compounding-cognition loop — we want
 * more of it). The allowance is measured against tenants.deal_limit (the numeric
 * free-task allowance — 3 for free, NULL = unlimited for pro/enterprise). is_demo
 * = exempt. The Stripe webhook sets deal_limit=NULL on upgrade to Pro.
 *
 * Fails OPEN on any error — a meter problem must never wall a real user.
 */
export interface HelpUsage {
  /** Demo or unlimited plan → no metering. */
  exempt: boolean;
  /** Tasks used (intake actions), workspace-wide. */
  count: number;
  /** Free task allowance (tenants.deal_limit); null = unlimited. */
  limit: number | null;
  /** True once the tenant has hit/exceeded the free task allowance. */
  over: boolean;
}

export async function getHelpUsage(tenantId: string): Promise<HelpUsage> {
  try {
    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("is_demo, plan, deal_limit")
      .eq("id", tenantId)
      .single();

    if (t?.is_demo) {
      return { exempt: true, count: 0, limit: null, over: false };
    }

    let limit = (t?.deal_limit ?? null) as number | null;
    if (limit == null) {
      // NULL deal_limit means UNLIMITED — but only legitimately so for a
      // paid/unlimited plan (Pro sets it NULL on upgrade; enterprise is NULL
      // by backfill). A `free` plan with a NULL limit is an anomaly (e.g. the
      // ensurePersonalWorkspace fallback insert dropping the column during a
      // migration-lag window at signup) — meter it at the free allowance
      // rather than handing out unlimited calls. Any non-free plan keeps its
      // unlimited exemption.
      if (t?.plan === "free") {
        limit = FREE_DEAL_LIMIT;
      } else {
        return { exempt: true, count: 0, limit: null, over: false };
      }
    }

    // One ledger row per successful intake task (research | call | follow_up).
    const { count } = await supabaseAdmin
      .from("intake_usage")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const used = count ?? 0;
    return { exempt: false, count: used, limit, over: used >= limit };
  } catch {
    return { exempt: true, count: 0, limit: null, over: false };
  }
}

/** Shared 402 body so every gate returns the same shape the UI expects. */
export function freeLimitResponseBody(usage: HelpUsage) {
  return {
    error: "free_limit_reached" as const,
    message: `You've used all ${usage.limit} of your free briefs.`,
    limit: usage.limit,
    count: usage.count,
  };
}
