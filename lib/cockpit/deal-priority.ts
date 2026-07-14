import { buildDecision, ATTENTION_THRESHOLD } from "./book-agent";
import type { DealEntry } from "./deal-registry";
import type { PrepArtifact } from "../contracts/execution-agent-output";
import type { AccountIntelligenceArtifact } from "../intelligence/types";

/**
 * Per-deal priority for the deals home. Reuses the Book's `buildDecision`
 * scoring for live deals (one engine, no drift), adds a staleness bump, and
 * derives a forward-looking line for pre-call deals (which have no live brief
 * to score). The output is what a list row needs: should it rise, and why.
 */
export interface DealPriority {
  /** True → sort into the "Needs you" group. */
  needsYou: boolean;
  /** Numeric rank (higher = more urgent). For ordering within a group. */
  score: number;
  /** One line: why this deal needs you (or, for on-track deals, what's next). */
  why: string;
  /** Visual weight for the row's dot. */
  tone: "critical" | "caution" | "neutral";
}

const STALE_DAYS = 4;

function ageInDays(iso: string | undefined, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (nowMs - new Date(iso).getTime()) / 86_400_000;
}

export function dealPriority(
  input: {
    id: string;
    name: string;
    live: PrepArtifact | null;
    intel: AccountIntelligenceArtifact | null;
  },
  now: Date = new Date(),
): DealPriority {
  const nowMs = now.getTime();

  // ── Live deal (a call has been processed) → score with the Book's engine.
  if (input.live) {
    // buildDecision only reads id/name/artifact; the cast avoids rebuilding a
    // full DealEntry (substrate etc.) the deals home doesn't have.
    const decision = buildDecision(
      { id: input.id, name: input.name, artifact: input.live } as DealEntry,
      now,
    );
    const ageDays = ageInDays(input.live.metadata?.generated_at, nowMs);
    const stale = ageDays > STALE_DAYS;

    const score = decision.score + (stale ? 30 : 0);
    let why = decision.why[0] ?? "";
    if (!why && stale) {
      why = `Brief is ${Math.floor(ageDays)} days old — refresh before your next touch.`;
    }
    if (!why) why = "On track — nothing pressing.";

    // A genuinely stale live brief surfaces even if its risk score is low —
    // no activity in days is itself the signal.
    const needsYou = score >= ATTENTION_THRESHOLD || stale;
    const tone: DealPriority["tone"] =
      decision.posture === "at_risk" || /\(blocking\)/.test(why)
        ? "critical"
        : needsYou
          ? "caution"
          : "neutral";

    return { needsYou, score, why, tone };
  }

  // ── Pre-call deal (research only, no call yet) → forward-looking line.
  if (input.intel) {
    const why =
      input.intel.pre_call_brief?.primary_objective?.trim() ||
      input.intel.recent_events?.[0]?.relevance?.trim() ||
      "Pre-call research ready.";
    return { needsYou: false, score: 0, why, tone: "neutral" };
  }

  return { needsYou: false, score: 0, why: "No brief yet.", tone: "neutral" };
}
