/**
 * The deals-home priority engine: what rises to "Needs you," and why. Proves
 * it reuses the Book's scoring for live deals and degrades sensibly for
 * pre-call deals. Clock injected so staleness is deterministic.
 */
import { describe, expect, it } from "vitest";

import { dealPriority } from "./deal-priority";

const NOW = new Date("2026-06-29T12:00:00Z");
const fresh = "2026-06-29T08:00:00Z"; // 4h ago
const old = "2026-06-20T12:00:00Z"; // 9 days ago

// Minimal PrepArtifact — buildDecision only reads these fields.
const live = (over: Record<string, unknown>) =>
  ({ metadata: { generated_at: fresh }, top_line: { posture: "advancing" }, ...over }) as never;

describe("dealPriority — what needs the rep", () => {
  it("at-risk live deal → Needs you, critical tone", () => {
    const p = dealPriority(
      { id: "d1", name: "Acme", live: live({ top_line: { posture: "at_risk" } }), intel: null },
      NOW,
    );
    expect(p.needsYou).toBe(true);
    expect(p.tone).toBe("critical");
  });

  it("blocking risk → Needs you, critical, and the why is the risk title", () => {
    const p = dealPriority(
      {
        id: "d2",
        name: "Meridian",
        live: live({
          top_line: { posture: "at_risk" },
          critical_risks: [{ title: "Approval gate uncontrolled", severity: "blocking" }],
        }),
        intel: null,
      },
      NOW,
    );
    expect(p.needsYou).toBe(true);
    expect(p.tone).toBe("critical");
    expect(p.why).toContain("Approval gate uncontrolled");
  });

  it("advancing + fresh live deal → On track, neutral", () => {
    const p = dealPriority({ id: "d3", name: "Calm", live: live({}), intel: null }, NOW);
    expect(p.needsYou).toBe(false);
    expect(p.tone).toBe("neutral");
  });

  it("stale live brief surfaces even with a low risk score", () => {
    const p = dealPriority(
      { id: "d4", name: "Quiet", live: live({ metadata: { generated_at: old } }), intel: null },
      NOW,
    );
    expect(p.needsYou).toBe(true);
    expect(p.why.toLowerCase()).toContain("days old");
  });

  it("pre-call deal → On track, why is the call's objective", () => {
    const intel = {
      metadata: { generated_at: fresh },
      pre_call_brief: { primary_objective: "Confirm the consolidation pain owner" },
    } as never;
    const p = dealPriority({ id: "d5", name: "Acme", live: null, intel }, NOW);
    expect(p.needsYou).toBe(false);
    expect(p.why).toBe("Confirm the consolidation pain owner");
  });

  it("no artifacts at all → neutral, no crash", () => {
    const p = dealPriority({ id: "d6", name: "Bare", live: null, intel: null }, NOW);
    expect(p.needsYou).toBe(false);
    expect(p.why).toBe("No brief yet.");
  });
});
