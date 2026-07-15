import { supabaseAdmin } from "@/lib/db/client";

/**
 * Rep-focus feed-forward.
 *
 * The questions a rep asks Mallín in chat (live_coach_turns) are the sharpest
 * signal of what they actually care about on a deal — but until now they were
 * stored and inert. This pulls a rep's recent questions on a deal so the brief
 * generator can fold them in: the next brief leads with what the rep has been
 * probing.
 *
 * v1 is per-deal (the questions asked on THIS opportunity). Cross-deal style-
 * learning ("think like she's been thinking") builds on top of this later.
 *
 * Fails closed-to-empty: any error returns [] so a brief regeneration never
 * breaks because the feed-forward read failed.
 */
export async function getRepFocus(args: {
  tenantId: string;
  opportunityId: string;
  limit?: number;
}): Promise<string[]> {
  const { tenantId, opportunityId, limit = 12 } = args;
  try {
    const { data } = await supabaseAdmin
      .from("live_coach_turns")
      .select("content, created_at")
      .eq("tenant_id", tenantId)
      .eq("opportunity_id", opportunityId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(limit);

    const seen = new Set<string>();
    const questions: string[] = [];
    for (const row of data ?? []) {
      const q = (row.content ?? "").trim();
      if (!q) continue;
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(q.length > 280 ? `${q.slice(0, 277)}…` : q);
    }
    // Oldest-first reads more naturally as "what they've been asking."
    return questions.reverse();
  } catch {
    return [];
  }
}

/**
 * Cross-deal lens (style-priming). The recurring questions a rep asks across
 * their OTHER deals reveal HOW they reason — the angles they always probe
 * (co-tenancy, sales-PSF, signer path, …). Folded into a brief so it reflects
 * the rep's analytical lens, not just this deal's chat. A lightweight first
 * step toward "think like she's been thinking"; full reasoning-style modeling
 * comes later. Fails closed-to-empty.
 */
export async function getCrossDealFocus(args: {
  tenantId: string;
  excludeOpportunityId: string;
  limit?: number;
}): Promise<string[]> {
  const { tenantId, excludeOpportunityId, limit = 8 } = args;
  try {
    const { data } = await supabaseAdmin
      .from("live_coach_turns")
      .select("content, created_at")
      .eq("tenant_id", tenantId)
      .eq("role", "user")
      .neq("opportunity_id", excludeOpportunityId)
      .order("created_at", { ascending: false })
      .limit(limit * 3);

    const seen = new Set<string>();
    const questions: string[] = [];
    for (const row of data ?? []) {
      const q = (row.content ?? "").trim();
      if (!q) continue;
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(q.length > 200 ? `${q.slice(0, 197)}…` : q);
      if (questions.length >= limit) break;
    }
    return questions.reverse();
  } catch {
    return [];
  }
}

/**
 * Proactive cross-deal OUTCOME lessons (won / lost / stalled), tenant-scoped.
 *
 * Unlike getCrossDealFocus (which echoes a rep's own past coach questions —
 * reactive), this GATHERS the data itself: it reads how OTHER deals in the
 * workspace ended (deal_outcomes: won/lost/no_decision, plus risk_materialized
 * and move_taken) and which live deals are stalling/at-risk (their current
 * execution artifact's posture), together with the driver behind each (top
 * critical-risk failure_mode / deal-thesis frame). It returns concise, labeled
 * lessons so a new deal's brief can proactively lead with "replicate this win",
 * "avoid what lost X", or "you're showing the stall signature that killed Y" —
 * with no rep interaction. The manager-governance review sits on top of this.
 *
 * NOTE: not yet wired into brief generation. The posture field path is dug out
 * defensively and must be verified against a real artifact before wiring.
 * Never throws — returns [] on any gap so it can never break a brief.
 */
export async function getCrossDealOutcomeLessons(args: {
  tenantId: string;
  excludeOpportunityId: string;
  limit?: number;
}): Promise<string[]> {
  const { tenantId, excludeOpportunityId, limit = 6 } = args;
  try {
    const [outcomeRes, artRes] = await Promise.all([
      supabaseAdmin
        .from("deal_outcomes")
        .select("opportunity_id, outcome, risk_materialized, move_taken, notes")
        .eq("tenant_id", tenantId)
        .neq("opportunity_id", excludeOpportunityId),
      supabaseAdmin
        .from("execution_artifacts")
        .select("opportunity_id, artifact")
        .eq("tenant_id", tenantId)
        .eq("is_current", true)
        .neq("opportunity_id", excludeOpportunityId),
    ]);
    const outcomes = outcomeRes.data ?? [];
    const arts = artRes.data ?? [];
    if (outcomes.length === 0 && arts.length === 0) return [];

    const ids = [
      ...new Set(
        [...outcomes.map((o) => o.opportunity_id), ...arts.map((a) => a.opportunity_id)].filter(Boolean),
      ),
    ];
    const { data: opps } = ids.length
      ? await supabaseAdmin.from("opportunities").select("id, name").in("id", ids)
      : { data: [] as { id: string; name: string | null }[] };
    const nameOf = new Map((opps ?? []).map((o) => [o.id, o.name ?? "a deal"] as const));

    // Driver + posture per deal, dug from the current artifact (defensive paths).
    const infoOf = new Map<string, { driver?: string; posture?: string; advancedBy?: string }>();
    for (const a of arts) {
      const art = (a.artifact ?? {}) as Record<string, unknown>;
      const risks = (art.critical_risks as { failure_mode?: string; title?: string }[] | undefined) ?? [];
      const thesis = art.deal_thesis as { decision_frame?: string } | undefined;
      const topLine = art.top_line as { text?: string; posture?: string } | undefined;
      const driver = risks[0]?.failure_mode || risks[0]?.title || thesis?.decision_frame || topLine?.text || undefined;
      const posture =
        (art.deal_posture as string | undefined) ||
        (art.status as string | undefined) ||
        topLine?.posture ||
        undefined;
      // What moved it forward — the progression play (from what_changed).
      const advancedBy = (art.what_changed as { summary?: string } | undefined)?.summary || undefined;
      infoOf.set(a.opportunity_id, { driver, posture, advancedBy });
    }

    const lessons: string[] = [];
    const closed = new Set(outcomes.map((o) => o.opportunity_id));

    for (const o of outcomes) {
      const name = nameOf.get(o.opportunity_id) ?? "A prior deal";
      const info = infoOf.get(o.opportunity_id);
      const tail = info?.driver ? `: ${info.driver}` : "";
      if (o.outcome === "won") {
        lessons.push(`WON — ${name}${tail}${o.move_taken ? " (recommended move was taken)" : ""}`);
      } else if (o.outcome === "lost") {
        lessons.push(
          `LOST — ${name}${tail}${o.risk_materialized ? " (the flagged risk hit)" : ""}${o.notes ? ` — ${o.notes}` : ""}`,
        );
      } else if (o.outcome === "no_decision") {
        lessons.push(`NO DECISION — ${name}${tail}`);
      }
    }

    for (const a of arts) {
      if (closed.has(a.opportunity_id)) continue;
      const info = infoOf.get(a.opportunity_id);
      const p = (info?.posture ?? "").toLowerCase();
      const name = nameOf.get(a.opportunity_id) ?? "An active deal";
      if (p === "stalled" || p === "at_risk") {
        lessons.push(`${p === "stalled" ? "STALLED" : "AT RISK"} — ${name}${info?.driver ? `: ${info.driver}` : ""}`);
      } else if (p === "advancing" && info?.advancedBy) {
        // The forward-motion play: what the rep did that moved this deal.
        lessons.push(`ADVANCED — ${name}: ${info.advancedBy}`);
      }
    }

    return lessons.slice(0, limit);
  } catch {
    return [];
  }
}
