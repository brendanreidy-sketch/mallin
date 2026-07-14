import type { AccountIntelligenceArtifact } from "../types";

export const STALE_DAYS = 4;

export type RefreshReason =
  | "demo"
  | "not_found"
  | "fresh"
  | "no_product_context"
  | "stale";

export interface RefreshDecision {
  refresh: boolean;
  reason: RefreshReason;
}

/**
 * Pure decision for on-access intelligence refresh: should we spend a costed
 * web-search on this deal right now? The expensive path (`refresh: true`) is
 * reachable ONLY for a real, non-demo, genuinely-stale artifact that has a
 * product_context. Everything else is a free no-op. Kept pure (clock + flags
 * injected) so the cost guard is unit-testable without auth/DB/network.
 */
export function decideRefresh(
  artifact: AccountIntelligenceArtifact | null | undefined,
  opts: { isDemo: boolean; now?: number; staleDays?: number },
): RefreshDecision {
  const { isDemo, now = Date.now(), staleDays = STALE_DAYS } = opts;

  if (isDemo) return { refresh: false, reason: "demo" };
  if (!artifact) return { refresh: false, reason: "not_found" };

  const generatedAt = artifact.metadata?.generated_at;
  const ageMs = generatedAt
    ? now - new Date(generatedAt).getTime()
    : Number.POSITIVE_INFINITY;

  if (ageMs < staleDays * 86_400_000) return { refresh: false, reason: "fresh" };
  if (!artifact.metadata?.product_context) {
    return { refresh: false, reason: "no_product_context" };
  }
  return { refresh: true, reason: "stale" };
}
