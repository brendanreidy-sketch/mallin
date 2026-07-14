/**
 * Unit tests for the pure aggregation + graduation-eligibility helpers.
 * The DB-touching paths (insertSlackInteraction, getConfirmRateBy*)
 * are exercised by the live smoke test against Supabase.
 */

import { describe, it, expect } from "vitest";
import { aggregate, isGraduationEligible } from "./slack-audit";

describe("isGraduationEligible", () => {
  it("returns false when sample size is below 50", () => {
    expect(isGraduationEligible(49, 1.0)).toBe(false);
    expect(isGraduationEligible(0, 1.0)).toBe(false);
  });

  it("returns false when confirm rate is below 0.85", () => {
    expect(isGraduationEligible(50, 0.84)).toBe(false);
    expect(isGraduationEligible(100, 0.5)).toBe(false);
  });

  it("returns false when rate is null (no data)", () => {
    expect(isGraduationEligible(0, null)).toBe(false);
    expect(isGraduationEligible(100, null)).toBe(false);
  });

  it("returns true at the exact threshold (>=50, >=0.85)", () => {
    expect(isGraduationEligible(50, 0.85)).toBe(true);
    expect(isGraduationEligible(100, 0.9)).toBe(true);
    expect(isGraduationEligible(50, 1.0)).toBe(true);
  });
});

describe("aggregate", () => {
  it("returns empty array for empty input", () => {
    expect(aggregate([])).toEqual([]);
  });

  it("groups by key and counts confirms / dismisses correctly", () => {
    const rows = [
      { key: "Compelling_Event__c", status: "confirmed_pending_apply" },
      { key: "Compelling_Event__c", status: "confirmed_pending_apply" },
      { key: "Compelling_Event__c", status: "dismissed_with_correction" },
      { key: "Champion__c", status: "confirmed_pending_apply" },
    ];
    const result = aggregate(rows);
    expect(result).toHaveLength(2);
    const ce = result.find((r) => r.key === "Compelling_Event__c")!;
    expect(ce.confirms).toBe(2);
    expect(ce.dismisses).toBe(1);
    expect(ce.total).toBe(3);
    expect(ce.confirm_rate).toBeCloseTo(2 / 3, 5);
    expect(ce.graduation_eligible).toBe(false); // total < 50
  });

  it("sorts results by total descending (most-sampled first)", () => {
    const rows = [
      { key: "rare_field", status: "confirmed_pending_apply" },
      { key: "common_field", status: "confirmed_pending_apply" },
      { key: "common_field", status: "confirmed_pending_apply" },
      { key: "common_field", status: "confirmed_pending_apply" },
    ];
    const result = aggregate(rows);
    expect(result[0].key).toBe("common_field");
    expect(result[1].key).toBe("rare_field");
  });

  it("counts unknown statuses in total but not in confirms or dismisses", () => {
    // unknown_action is a valid enum value but not a confirm or dismiss.
    const rows = [
      { key: "f", status: "confirmed_pending_apply" },
      { key: "f", status: "unknown_action" },
      { key: "f", status: "dismissed_with_correction" },
    ];
    const result = aggregate(rows);
    const f = result.find((r) => r.key === "f")!;
    expect(f.total).toBe(3);
    expect(f.confirms).toBe(1);
    expect(f.dismisses).toBe(1);
    expect(f.confirm_rate).toBeCloseTo(1 / 3, 5);
  });

  it("flags graduation-eligible when threshold met", () => {
    // 50 rows, 43 confirms (86% >= 85%) → eligible
    const rows: { key: string; status: string }[] = [];
    for (let i = 0; i < 43; i++) {
      rows.push({ key: "ready_field", status: "confirmed_pending_apply" });
    }
    for (let i = 0; i < 7; i++) {
      rows.push({ key: "ready_field", status: "dismissed_with_correction" });
    }
    const result = aggregate(rows);
    const ready = result.find((r) => r.key === "ready_field")!;
    expect(ready.total).toBe(50);
    expect(ready.confirm_rate).toBeCloseTo(0.86, 2);
    expect(ready.graduation_eligible).toBe(true);
  });

  it("does NOT flag graduation when sample is large but rate is low", () => {
    const rows: { key: string; status: string }[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({ key: "noisy_field", status: "confirmed_pending_apply" });
    }
    for (let i = 0; i < 70; i++) {
      rows.push({ key: "noisy_field", status: "dismissed_with_correction" });
    }
    const result = aggregate(rows);
    const noisy = result.find((r) => r.key === "noisy_field")!;
    expect(noisy.total).toBe(100);
    expect(noisy.confirm_rate).toBeCloseTo(0.3, 5);
    expect(noisy.graduation_eligible).toBe(false);
  });
});
