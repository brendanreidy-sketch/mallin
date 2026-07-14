import { supabaseAdmin } from "@/lib/db/client";

/** The three intake actions, each of which counts as one free-tier task. */
export type IntakeTaskKind = "research" | "call" | "follow_up";

/**
 * Record one successful intake action into the task ledger (`intake_usage`) —
 * the unit the free meter counts (see lib/billing/help-usage.ts).
 *
 * Call this ONLY after the action fully succeeds (brief built / research done),
 * so a failed+rolled-back attempt never burns a task. Best-effort: a write
 * failure logs and returns rather than 500-ing the user's brief — the safe
 * direction for billing is to under-count (give a free task), never to block a
 * paid action on a ledger hiccup.
 */
export async function recordIntakeTask(opts: {
  tenantId: string;
  userId?: string | null;
  kind: IntakeTaskKind;
  opportunityId?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from("intake_usage").insert({
      tenant_id: opts.tenantId,
      user_id: opts.userId ?? null,
      kind: opts.kind,
      opportunity_id: opts.opportunityId ?? null,
    });
  } catch (err) {
    console.warn(
      `[intake-usage] record ${opts.kind} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}
