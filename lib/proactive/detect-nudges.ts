import { supabaseAdmin } from "@/lib/db/client";

/**
 * Proactive-nudge detection — the "system reaches out" engine.
 *
 * Mallín is reactive today: it briefs when you open a deal. This detects, for
 * each live deal, a state change worth pushing WITHOUT the rep asking — so the
 * move can be delivered to them (Slack) instead of waiting to be pulled.
 *
 * Two signals to start, both grounded in data already on the deal:
 *   • STALL   — the deal's own current-artifact posture is stalled / at-risk.
 *   • SILENCE — no logged touch in over a week, and the deal isn't already
 *               flagged stalled (that's covered above).
 *
 * The composer turns a nudge into a Slack-ready message. Sending is deliberately
 * NOT wired here — lib/adapters/slack `postToSlack` is the delivery step, gated
 * behind explicit enablement so nothing ever goes to a workspace's Slack
 * unsolicited. Run the dry run (scripts/proactive/scan.ts) to see what WOULD go.
 */

const SILENCE_DAYS = 7;

export type NudgeKind = "stall" | "silence";

export interface Nudge {
  opportunityId: string;
  dealName: string;
  kind: NudgeKind;
  /** The situation, in one line. */
  headline: string;
  /** What to do about it — the directive move. */
  move: string;
  /** Why it matters. */
  reason: string;
}

interface DealSnapshot {
  opportunityId: string;
  name: string;
  lastActivityAt: string | null;
  /** The current execution artifact (brief), loosely typed for the few fields read. */
  artifact:
    | null
    | {
        deal_posture?: string;
        how_you_win?: string;
        top_line?: { text?: string };
        talk_track?: { opening_angle?: string };
        critical_risks?: { recommended_posture?: string; failure_mode?: string }[];
      };
}

/**
 * Pure detection over a single deal. `nowMs` is injected (not read from the
 * clock) so this stays deterministic and unit-testable.
 */
export function detectNudges(deal: DealSnapshot, nowMs: number): Nudge[] {
  const nudges: Nudge[] = [];
  const a = deal.artifact;
  const posture = (a?.deal_posture ?? "").toLowerCase();
  const move =
    a?.how_you_win?.trim() ||
    a?.talk_track?.opening_angle?.trim() ||
    "Get the next step on the calendar before this drifts.";
  const topRisk = a?.critical_risks?.[0];

  // 1. Stall signature — the deal's own posture says it's slipping.
  if (posture === "stalled" || posture === "at_risk") {
    nudges.push({
      opportunityId: deal.opportunityId,
      dealName: deal.name,
      kind: "stall",
      headline:
        posture === "stalled"
          ? `${deal.name} is showing the stall signature.`
          : `${deal.name} is at risk.`,
      move,
      reason:
        topRisk?.recommended_posture?.trim() ||
        topRisk?.failure_mode?.trim() ||
        a?.top_line?.text?.trim() ||
        "The deal's posture slipped since the last brief.",
    });
  }

  // 2. Silence — no touch in over a week, and not already flagged stalled.
  if (deal.lastActivityAt && posture !== "stalled" && posture !== "at_risk") {
    const ageDays = (nowMs - new Date(deal.lastActivityAt).getTime()) / 86_400_000;
    if (ageDays >= SILENCE_DAYS) {
      nudges.push({
        opportunityId: deal.opportunityId,
        dealName: deal.name,
        kind: "silence",
        headline: `${deal.name} has gone quiet — ${Math.floor(ageDays)} days since the last touch.`,
        move,
        reason: "Silence past a week usually means the deal is drifting. Re-open it before it stalls.",
      });
    }
  }

  return nudges;
}

/** Slack-ready message for a nudge. */
export function composeNudgeText(n: Nudge): string {
  return `*${n.headline}*\n${n.reason}\n\n→ *Move:* ${n.move}`;
}

/**
 * Scan every live deal in a tenant and return the nudges Mallín would push.
 * Read-only; never sends. Fails closed to [] so a scan can't break anything.
 */
export async function scanTenantForNudges(tenantId: string, nowMs: number): Promise<Nudge[]> {
  try {
    const { data: opps } = await supabaseAdmin
      .from("opportunities")
      .select("id, name, last_activity_at")
      .eq("tenant_id", tenantId);
    if (!opps || opps.length === 0) return [];

    const ids = opps.map((o) => o.id);
    const { data: arts } = await supabaseAdmin
      .from("execution_artifacts")
      .select("opportunity_id, artifact")
      .eq("tenant_id", tenantId)
      .eq("is_current", true)
      .in("opportunity_id", ids);
    const artOf = new Map(
      (arts ?? []).map((r) => [r.opportunity_id, r.artifact as DealSnapshot["artifact"]]),
    );

    const nudges: Nudge[] = [];
    for (const o of opps) {
      nudges.push(
        ...detectNudges(
          {
            opportunityId: o.id,
            name: (o.name as string) ?? "A deal",
            lastActivityAt: (o.last_activity_at as string) ?? null,
            artifact: artOf.get(o.id) ?? null,
          },
          nowMs,
        ),
      );
    }
    return nudges;
  } catch {
    return [];
  }
}
