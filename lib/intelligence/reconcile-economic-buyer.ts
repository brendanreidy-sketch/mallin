/**
 * Single-economic-buyer invariant.
 *
 * A deal has AT MOST ONE economic buyer — the person who holds final budget
 * sign-off. A bought-in, budget-owning sponsor BELOW the signer is a champion,
 * not a co-signer. But roles accumulate across calls: a follow-up call can add a
 * newly-surfaced CFO as economic_buyer while an earlier call's SVP sponsor keeps
 * the economic_buyer tag it was given before the true signer appeared — and the
 * follow-up path (rebuildBrief) never re-derives roles, so nothing demotes the
 * stale one. Result: two "economic buyer" chips in the cockpit.
 *
 * This module enforces the invariant deterministically — at the DB after writes
 * (the root), and as a pure read-side normalizer (a display guarantee). When two
 * or more carry economic_buyer, the most senior by title keeps it and the rest
 * are demoted to champion.
 */

import { supabaseAdmin } from "@/lib/db/client";

/** Seniority rank for economic-buyer tie-breaking. Higher = more senior. */
export function titleSeniority(title?: string | null): number {
  const t = (title ?? "").toLowerCase();
  if (!t) return 0;
  if (/\bowner\b|\bfounder\b|\bpresident\b|\bceo\b|chief executive/.test(t)) return 6;
  if (/\bcfo\b|chief financial|\bchief\b|\bc[a-z]{1,3}o\b/.test(t)) return 5;
  if (/\bevp\b|executive vice president/.test(t)) return 4;
  if (/\bsvp\b|senior vice president/.test(t)) return 3;
  if (/\bvp\b|vice president|\bhead of\b/.test(t)) return 2;
  if (/director/.test(t)) return 1;
  return 0;
}

interface RoleBearer {
  title?: string | null;
  committee_role?: string | null;
}

const isEB = (r?: string | null): boolean => (r ?? "").toLowerCase() === "economic_buyer";

/**
 * Pure normalizer: return a NEW list where at most one stakeholder is
 * economic_buyer (the most senior by title); the rest are demoted to champion.
 * Used on the cockpit read path so the display can never show two, regardless of
 * DB state. Never mutates the input.
 */
export function enforceSingleEconomicBuyer<T extends RoleBearer>(stakeholders: T[]): T[] {
  const ebIdx = stakeholders.map((s, i) => (isEB(s.committee_role) ? i : -1)).filter((i) => i >= 0);
  if (ebIdx.length <= 1) return stakeholders;
  // Most senior by title wins; on a tie, the later (newer-surfaced) one wins —
  // the latest call's designation is the freshest read of who actually signs.
  let keep = ebIdx[0];
  for (const i of ebIdx) {
    if (titleSeniority(stakeholders[i].title) >= titleSeniority(stakeholders[keep].title)) keep = i;
  }
  return stakeholders.map((s, i) =>
    isEB(s.committee_role) && i !== keep ? { ...s, committee_role: "champion" } : s,
  );
}

/**
 * DB root fix: after any stakeholder write, collapse multiple economic_buyer rows
 * on an account down to one (most senior by title; newest-surfaced wins ties, as
 * the freshest signal). Demoted rows become champion. Never throws — a failure
 * here must never break intake or a follow-up rebuild.
 */
export async function reconcileEconomicBuyer(accountId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from("stakeholders")
      .select("id, name, title, committee_role, created_at")
      .eq("account_id", accountId)
      .eq("committee_role", "economic_buyer")
      .eq("is_departed", false);
    const ebs = data ?? [];
    if (ebs.length <= 1) return;

    // Most senior by title wins; tie-break to the most recently surfaced EB (the
    // latest call's designation is the freshest read of who actually signs).
    const sorted = [...ebs].sort((a, b) => {
      const d = titleSeniority(b.title) - titleSeniority(a.title);
      if (d !== 0) return d;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    const demote = sorted.slice(1).map((s) => s.id);
    if (!demote.length) return;

    await supabaseAdmin.from("stakeholders").update({ committee_role: "champion" }).in("id", demote);
    console.log(
      `[reconcileEconomicBuyer] account=${accountId} kept=${sorted[0].name} demoted ${demote.length} to champion`,
    );
  } catch (e) {
    console.warn(`[reconcileEconomicBuyer] ${(e as Error).message}`);
  }
}
