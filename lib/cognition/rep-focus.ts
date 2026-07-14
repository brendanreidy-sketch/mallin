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
