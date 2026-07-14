import { describe, it, expect } from "vitest";
import {
  seniorityGuidance,
  seniorityForRole,
  AE_SENIORITY,
  SDR_SENIORITY,
} from "./seniority";

describe("target seniority", () => {
  it("AE band is senior-only; SDR widens to manager", () => {
    expect(AE_SENIORITY.levels).toEqual(["c_suite", "vp", "director"]);
    expect(SDR_SENIORITY.levels).toContain("manager");
    expect(seniorityForRole("ae")).toBe(AE_SENIORITY);
    expect(seniorityForRole("sdr")).toBe(SDR_SENIORITY);
  });

  it("guidance flips the manager clause with the band", () => {
    expect(seniorityGuidance(SDR_SENIORITY)).toMatch(/Manager-level is IN scope/);
    expect(seniorityGuidance(AE_SENIORITY)).toMatch(/Manager-level is OUT of scope/);
  });

  it("guidance is always size-adaptive and falls back to the AE band", () => {
    const g = seniorityGuidance(null);
    expect(g).toMatch(/startup/i);
    expect(g).toMatch(/enterprise/i);
    expect(g).toMatch(/Manager-level is OUT of scope/); // default = AE band
  });
});
