/**
 * Merge helpers for the daily-refresh path. Keeps dedup logic
 * separate from fetch logic so each can be tested independently.
 */

import type {
  AccountIntelligenceArtifact,
  RecentEvent,
} from "../types";

/** Max recent_events to keep — newest first. Older falls off. */
const MAX_RECENT_EVENTS = 8;

/** Light-weight fuzzy similarity for headline dedup. Returns true when
 *  two headlines refer to the same underlying event. We don't need
 *  perfect — we need to avoid the most obvious duplicates (same story
 *  picked up by multiple publishers, paraphrased reports of same fact).
 */
function headlinesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const A = norm(a);
  const B = norm(b);
  if (A === B) return true;

  // Token overlap: if ≥60% of one's tokens appear in the other, treat
  // as same event. Filter trivial stopwords to avoid false positives.
  const stop = new Set([
    "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for",
    "with", "by", "from", "as", "is", "it", "its", "that", "this",
  ]);
  const tokens = (s: string) =>
    new Set(s.split(" ").filter((t) => t.length > 2 && !stop.has(t)));
  const tA = tokens(A);
  const tB = tokens(B);
  if (tA.size === 0 || tB.size === 0) return false;

  let shared = 0;
  for (const t of tA) if (tB.has(t)) shared += 1;
  const smaller = Math.min(tA.size, tB.size);
  return shared / smaller >= 0.6;
}

/** URL match — strip query, fragment, trailing slash, www. before
 *  comparing. Catches the common "same article, slightly different
 *  URL" pattern. */
function urlsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const norm = (u: string) =>
    u
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
  return norm(a) === norm(b);
}

/** Returns true if `candidate` is a duplicate of any event in `existing`. */
function isDuplicate(candidate: RecentEvent, existing: RecentEvent[]): boolean {
  for (const e of existing) {
    if (urlsMatch(candidate.source_url, e.source_url)) return true;
    if (e.date === candidate.date && headlinesMatch(e.headline, candidate.headline))
      return true;
    // Soft: same headline within a few days = likely same event
    if (
      Math.abs(daysBetween(e.date, candidate.date)) <= 3 &&
      headlinesMatch(e.headline, candidate.headline)
    ) {
      return true;
    }
  }
  return false;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / 86400000);
}

/** Sort newest first by `date`, then by `captured_at` as tiebreaker. */
function newestFirst(a: RecentEvent, b: RecentEvent): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  const ca = a.captured_at ?? "";
  const cb = b.captured_at ?? "";
  return cb.localeCompare(ca);
}

export interface MergeReport {
  /** Number of genuinely new events added. */
  added: number;
  /** Number rejected as duplicates of existing entries. */
  duplicates_skipped: number;
  /** Number of events dropped from the tail because we exceeded the cap. */
  trimmed_off_tail: number;
  /** Final length of recent_events. */
  final_count: number;
}

/**
 * Merges new events into the artifact, deduping and capping. Returns
 * the merged artifact + a small report for logging/observability.
 *
 * Pure function — does not mutate inputs. Caller writes the result
 * to the DB.
 */
export function mergeNewEventsIntoArtifact(
  artifact: AccountIntelligenceArtifact,
  candidates: RecentEvent[],
): { merged: AccountIntelligenceArtifact; report: MergeReport } {
  const existing = artifact.recent_events ?? [];
  const newOnes: RecentEvent[] = [];
  let dupes = 0;

  for (const c of candidates) {
    if (isDuplicate(c, existing) || isDuplicate(c, newOnes)) {
      dupes += 1;
    } else {
      newOnes.push(c);
    }
  }

  const combined = [...newOnes, ...existing].sort(newestFirst);
  const capped = combined.slice(0, MAX_RECENT_EVENTS);
  const trimmed = combined.length - capped.length;

  const merged: AccountIntelligenceArtifact = {
    ...artifact,
    recent_events: capped,
    metadata: {
      ...artifact.metadata,
      generated_at: new Date().toISOString(),
      sources_used: Array.from(
        new Set([...artifact.metadata.sources_used, "web_search" as const]),
      ),
    },
  };

  return {
    merged,
    report: {
      added: newOnes.length,
      duplicates_skipped: dupes,
      trimmed_off_tail: trimmed,
      final_count: capped.length,
    },
  };
}
