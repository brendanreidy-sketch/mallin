import { describe, it, expect } from "vitest";
import {
  resolveDisposition,
  DEFAULT_AUTONOMY,
  AUTONOMY_TIERS,
  tierForLevel,
  autonomyLabel,
} from "./autonomy";

describe("resolveDisposition", () => {
  it("maps each level to its disposition", () => {
    expect(resolveDisposition({ level: "draft_only", paused: false })).toBe("hold_drafted");
    expect(resolveDisposition({ level: "approve_before_send", paused: false })).toBe("queue_for_approval");
    expect(resolveDisposition({ level: "full_auto", paused: false })).toBe("send");
  });

  it("the kill-switch overrides EVERY level — paused never sends", () => {
    expect(resolveDisposition({ level: "full_auto", paused: true })).toBe("hold_drafted");
    expect(resolveDisposition({ level: "approve_before_send", paused: true })).toBe("hold_drafted");
    expect(resolveDisposition({ level: "draft_only", paused: true })).toBe("hold_drafted");
  });

  it("defaults to human-gated when state is missing or partial (never silent-send)", () => {
    expect(resolveDisposition(null)).toBe("queue_for_approval");
    expect(resolveDisposition(undefined)).toBe("queue_for_approval");
    expect(resolveDisposition({})).toBe("queue_for_approval");
    // partial: level set, paused unset → not paused, maps by level
    expect(resolveDisposition({ level: "full_auto" })).toBe("send");
    // partial: paused set alone → kill-switch still wins
    expect(resolveDisposition({ paused: true })).toBe("hold_drafted");
  });

  it("the safe default is approve-before-send, not paused", () => {
    expect(DEFAULT_AUTONOMY.level).toBe("approve_before_send");
    expect(DEFAULT_AUTONOMY.paused).toBe(false);
    expect(resolveDisposition(DEFAULT_AUTONOMY)).toBe("queue_for_approval");
  });
});

describe("autonomy tiers (Level 3/2/1 role framing)", () => {
  it("ladders top-down 3 → 1 and maps to the enum", () => {
    expect(AUTONOMY_TIERS.map((t) => t.level)).toEqual([3, 2, 1]);
    expect(AUTONOMY_TIERS.map((t) => t.key)).toEqual([
      "draft_only",
      "approve_before_send",
      "full_auto",
    ]);
  });

  it("frames the roles: AE at the top (Assist), SDR at the bottom (Autonomous)", () => {
    expect(tierForLevel("draft_only")).toMatchObject({ level: 3, name: "Assist", role: "AE" });
    expect(tierForLevel("full_auto")).toMatchObject({ level: 1, name: "Autonomous", role: "SDR" });
    expect(tierForLevel("approve_before_send")).toMatchObject({ level: 2, name: "Supervise", role: null });
  });

  it("labels read as Level N · Name", () => {
    expect(autonomyLabel("approve_before_send")).toBe("Level 2 · Supervise");
    expect(autonomyLabel("full_auto")).toBe("Level 1 · Autonomous");
  });
});
