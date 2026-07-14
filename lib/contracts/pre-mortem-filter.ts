/**
 * ============================================================================
 *  Pre-mortem path filter (pre-render)
 * ============================================================================
 *
 *  Runs AFTER Layer A (schema) and Layer B (integrity) pass, BEFORE the
 *  artifact lands in the DB. Drops paths that satisfy any of:
 *
 *    1. fails evidence floor          (we already validate field presence
 *                                       in Layer A; this is the
 *                                       semantic version — null/empty
 *                                       actor_name etc.)
 *    2. not solvable_pre_event        (model self-assertion)
 *    3. duplicate primary_driver      (keep highest-ranked, drop rest)
 *    4. low likelihood × low severity (rank score below floor)
 *    5. STALE vs. previous artifact   (no delta — same primary_driver +
 *                                       same signal_timestamp + same
 *                                       forcing_move text → smart-nagging
 *                                       failure mode)
 *
 *  After dropping, paths are sorted by rank_score = likelihood × severity,
 *  with tie-break by signal_timestamp (more recent wins). Top 3 only.
 *
 *  RATIONALE FOR LIVING OUTSIDE THE INTEGRITY VALIDATOR
 *  ────────────────────────────────────────────────────
 *  Layer A/B both BLOCK on failure (retry the model). The filter is a
 *  best-effort cleanup — it should never fail the artifact, just drop
 *  bad paths quietly. Different semantic from "the model produced
 *  nonsense" (which validates) vs. "the model produced 3 paths but
 *  one is stale" (which we silently drop).
 * ============================================================================
 */

import type { PrepArtifact, PreMortemPath } from "./execution-agent-output";

/** Below this score, a path is dropped as low-impact noise. */
const RANK_FLOOR = 0.15;

export interface PreMortemFilterResult {
  /** Filtered + ranked path list (≤3). */
  paths: PreMortemPath[];
  /** Diagnostic record of what was dropped and why — useful for audit
   *  and for the per-turn instrumentation. */
  dropped: Array<{
    primary_driver: string;
    reason:
      | "evidence_floor"
      | "not_solvable"
      | "duplicate_driver"
      | "low_impact"
      | "stale_vs_prior";
  }>;
}

export function filterPreMortemPaths(
  candidates: PreMortemPath[],
  previousArtifact: PrepArtifact | null,
): PreMortemFilterResult {
  const dropped: PreMortemFilterResult["dropped"] = [];

  // ── 1. Evidence-floor check (semantic) ───────────────────────────────
  let pool = candidates.filter((p) => {
    const ok =
      p.actor_name?.trim() &&
      p.signal_timestamp?.trim() &&
      p.signal_source &&
      p.gap_type;
    if (!ok) {
      dropped.push({
        primary_driver: p.primary_driver,
        reason: "evidence_floor",
      });
    }
    return ok;
  });

  // ── 2. Solvability ───────────────────────────────────────────────────
  pool = pool.filter((p) => {
    if (p.solvable_pre_event !== true) {
      dropped.push({
        primary_driver: p.primary_driver,
        reason: "not_solvable",
      });
      return false;
    }
    return true;
  });

  // ── 5. Stale vs. previous artifact (the "smart nagging" guardrail) ──
  // Done before duplicate-driver collapse so a stale path doesn't
  // accidentally win the dedupe over a fresh one.
  const prevPaths = previousArtifact?.pre_mortem_paths ?? [];
  if (prevPaths.length > 0) {
    pool = pool.filter((p) => {
      const stale = prevPaths.some(
        (prev) =>
          prev.primary_driver === p.primary_driver &&
          prev.signal_timestamp === p.signal_timestamp &&
          prev.forcing_move.trim() === p.forcing_move.trim(),
      );
      if (stale) {
        dropped.push({
          primary_driver: p.primary_driver,
          reason: "stale_vs_prior",
        });
      }
      return !stale;
    });
  }

  // ── 3. Duplicate primary_driver — keep highest-ranked, drop rest ─────
  // Score each remaining path; for collisions on driver, keep the higher
  // score (tie-break by signal recency).
  const score = (p: PreMortemPath) => p.likelihood * p.severity;
  const recency = (p: PreMortemPath) =>
    Date.parse(p.signal_timestamp) || 0;
  const byDriver = new Map<string, PreMortemPath>();
  for (const p of pool) {
    const key = p.primary_driver.trim().toLowerCase();
    const existing = byDriver.get(key);
    if (!existing) {
      byDriver.set(key, p);
      continue;
    }
    const winner =
      score(p) > score(existing) ||
      (score(p) === score(existing) && recency(p) > recency(existing))
        ? p
        : existing;
    const loser = winner === p ? existing : p;
    dropped.push({
      primary_driver: loser.primary_driver,
      reason: "duplicate_driver",
    });
    byDriver.set(key, winner);
  }
  pool = Array.from(byDriver.values());

  // ── 4. Low-impact floor ──────────────────────────────────────────────
  pool = pool.filter((p) => {
    if (score(p) < RANK_FLOOR) {
      dropped.push({
        primary_driver: p.primary_driver,
        reason: "low_impact",
      });
      return false;
    }
    return true;
  });

  // ── Sort by rank, tie-break by recency, cap at 3 ─────────────────────
  pool.sort((a, b) => {
    const sd = score(b) - score(a);
    if (sd !== 0) return sd;
    return recency(b) - recency(a);
  });

  return { paths: pool.slice(0, 3), dropped };
}
