/**
 * Outbound autonomy policy — how far the engine runs on its own, set per tenant
 * in system settings, with a global kill-switch.
 *
 * The governance backbone: the engine sources, researches, and drafts
 * autonomously, but WHETHER it sends — and whether a human approves first — is
 * the customer's call, dialed here and overridable instantly by a pause. Same
 * approve→execute→audit spine as the deal action queue, pointed at outbound.
 *
 * Pure policy — no I/O. The store (config-store.ts) holds the AutonomyState per
 * tenant; the send path calls resolveDisposition() to decide what a drafted
 * touch does. Keeping it a pure function makes the whole gate unit-testable and
 * impossible to accidentally bypass with a stray boolean.
 */

export type AutonomyLevel =
  | "draft_only" // produce drafts; never send
  | "approve_before_send" // queue drafts; a human approves each send
  | "full_auto"; // send + sequence on its own

/** What a freshly-drafted touch does under the tenant's current policy. */
export type SendDisposition =
  | "hold_drafted" // stays a draft (draft_only, OR paused — the kill-switch)
  | "queue_for_approval" // enters the approval queue (approve_before_send)
  | "send"; // sent immediately (full_auto)

export interface AutonomyState {
  level: AutonomyLevel;
  /** Global kill-switch — when true, NOTHING sends, regardless of level. */
  paused: boolean;
}

/** Safe default for a tenant that hasn't set autonomy yet: a human gates every send. */
export const DEFAULT_AUTONOMY: AutonomyState = {
  level: "approve_before_send",
  paused: false,
};

/**
 * Resolve what a drafted touch does under the current policy. The pause ALWAYS
 * wins — it is the kill-switch: paused → nothing sends, no matter the level.
 * A missing/partial state falls back to the safe default (human-gated).
 */
export function resolveDisposition(state?: Partial<AutonomyState> | null): SendDisposition {
  const level = state?.level ?? DEFAULT_AUTONOMY.level;
  const paused = state?.paused ?? DEFAULT_AUTONOMY.paused;
  if (paused) return "hold_drafted";
  switch (level) {
    case "draft_only":
      return "hold_drafted";
    case "approve_before_send":
      return "queue_for_approval";
    case "full_auto":
      return "send";
    default:
      // Unknown level → safest interpretation: human-gated, never silent-send.
      return "queue_for_approval";
  }
}

/**
 * The autonomy ladder, top-down (Level 3 → 1) — role-framed for the UI. Each
 * tier maps to the enum resolveDisposition() acts on, so the labels are just a
 * presentation layer over the same policy. An AE starts high (Assist) and dials
 * down as they trust it; the SDR volume motion lives at Autonomous.
 */
export interface AutonomyTier {
  level: 1 | 2 | 3;
  key: AutonomyLevel;
  name: string;
  /** The seat this tier fits — for the UI's role framing. */
  role: "AE" | "SDR" | null;
  blurb: string;
}

export const AUTONOMY_TIERS: readonly AutonomyTier[] = [
  {
    level: 3,
    key: "draft_only",
    name: "Assist",
    role: "AE",
    blurb: "Agent researches and drafts. You pick, personalize, and send each yourself.",
  },
  {
    level: 2,
    key: "approve_before_send",
    name: "Supervise",
    role: null,
    blurb: "Agent sources, drafts, and queues. You approve in batches; it sends what you approve and sequences.",
  },
  {
    level: 1,
    key: "full_auto",
    name: "Autonomous",
    role: "SDR",
    blurb: "Agent sources, drafts, sends, and sequences on its own, at volume. You monitor and pause.",
  },
];

/** The tier for an autonomy level. Falls back to Supervise (the safe middle). */
export function tierForLevel(level: AutonomyLevel): AutonomyTier {
  return AUTONOMY_TIERS.find((t) => t.key === level) ?? AUTONOMY_TIERS[1];
}

/** Human-readable label for the settings UI (e.g. "Level 2 · Supervise"). */
export function autonomyLabel(level: AutonomyLevel): string {
  const t = tierForLevel(level);
  return `Level ${t.level} · ${t.name}`;
}
