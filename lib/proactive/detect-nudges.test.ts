import { describe, it, expect } from "vitest";
import { detectNudges } from "./detect-nudges";

// Fixed "now" so the day-math is deterministic.
const NOW = new Date("2026-07-16T00:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const activeBase: Parameters<typeof detectNudges>[0] = {
  opportunityId: "opp1",
  name: "WorkWave",
  lastActivityAt: daysAgo(1),
  artifact: { deal_posture: "advancing", how_you_win: "Lock the technical session." },
};

describe("detectNudges", () => {
  it("stays quiet on a healthy, recently-touched active deal", () => {
    expect(detectNudges(activeBase, NOW)).toEqual([]);
  });

  it("fires a stall nudge when the posture is stalled", () => {
    const n = detectNudges(
      { ...activeBase, artifact: { deal_posture: "stalled", how_you_win: "x" } },
      NOW,
    );
    expect(n.map((x) => x.kind)).toEqual(["stall"]);
  });

  it("fires a silence nudge after more than a week quiet", () => {
    const n = detectNudges({ ...activeBase, lastActivityAt: daysAgo(9) }, NOW);
    expect(n.map((x) => x.kind)).toEqual(["silence"]);
  });

  it("never nudges a closed-won deal, even if long silent", () => {
    expect(
      detectNudges({ ...activeBase, lastActivityAt: daysAgo(60), outcome: "won" }, NOW),
    ).toEqual([]);
  });

  it("surfaces a win-back for a competitive loss in the 3–6 month window", () => {
    const n = detectNudges(
      {
        ...activeBase,
        outcome: "lost",
        closedAt: daysAgo(120),
        lossReason: "Went with the incumbent vendor on price.",
      },
      NOW,
    );
    expect(n.map((x) => x.kind)).toEqual(["winback"]);
    expect(n[0].reason).toContain("incumbent vendor");
  });

  it("leaves a dead-end loss alone (no budget / shelved)", () => {
    expect(
      detectNudges(
        {
          ...activeBase,
          outcome: "lost",
          closedAt: daysAgo(120),
          lossReason: "No budget this year, project shelved.",
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("does not poke a fresh loss (under 90 days)", () => {
    expect(
      detectNudges(
        { ...activeBase, outcome: "lost", closedAt: daysAgo(30), lossReason: "Went with a competitor." },
        NOW,
      ),
    ).toEqual([]);
  });

  it("stops win-back after the window closes (over 180 days)", () => {
    expect(
      detectNudges(
        { ...activeBase, outcome: "lost", closedAt: daysAgo(210), lossReason: "Went with a competitor." },
        NOW,
      ),
    ).toEqual([]);
  });
});
