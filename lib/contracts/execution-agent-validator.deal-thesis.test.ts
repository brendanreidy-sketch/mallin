/**
 * deal_thesis structural validation (Layer A).
 *
 * Each test asserts ONE rule. If a test fails, the failure message names
 * the rule that broke.
 *
 * Layer B (integrity / cross-reference) is exercised separately —
 * Layer A only checks shape + cardinality + enum + carve-out.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateExecutionOutput } from "./execution-agent-validator";

const ACME_FIXTURE = resolve(
  __dirname,
  "../../scripts/_fixtures/acme-beneba-full-pipeline-output.pass4-output.json"
);
// Base artifact for override-driven cases. The deal_thesis is replaced in each
// test below, so only its top-level shape matters — a valid pass-4 artifact.
const BASE_FIXTURE = ACME_FIXTURE;

function loadFixture(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("deal_thesis — Layer A validation", () => {
  // ── Fixture-level regressions ──────────────────────────────────────────

  it("Acme fixture (formed thesis) passes structural validation", () => {
    const result = validateExecutionOutput(loadFixture(ACME_FIXTURE));
    if (!result.ok) {
      throw new Error("Acme fixture failed validation:\n" + result.errors.join("\n"));
    }
    expect(result.ok).toBe(true);
  });

  // ── Targeted contract assertions ───────────────────────────────────────

  it("rejects formed thesis with empty evidence_ids", () => {
    const artifact = loadFixture(BASE_FIXTURE) as Record<string, unknown>;
    artifact.deal_thesis = {
      status: "formed",
      thesis: "Buyer is evaluating software vs headcount",
      confidence: "medium",
      decision_frame: "software vs headcount",
      why_this_matters: "Anchor on ROI vs FTE cost",
      evidence_ids: [], // formed must have ≥1
    };
    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("deal_thesis"))).toBe(true);
    }
  });

  it("rejects indeterminate thesis with non-empty evidence_ids (carve-out is exact)", () => {
    const artifact = loadFixture(BASE_FIXTURE) as Record<string, unknown>;
    artifact.deal_thesis = {
      status: "indeterminate",
      confidence: "low",
      evidence_ids: ["si_call_count_30d"], // forbidden — must be []
      indeterminate_reason: "Test reason",
      required_evidence_to_form_thesis: ["A", "B"],
    };
    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("deal_thesis"))).toBe(true);
    }
  });

  it("rejects indeterminate thesis with confidence other than 'low'", () => {
    const artifact = loadFixture(BASE_FIXTURE) as Record<string, unknown>;
    artifact.deal_thesis = {
      status: "indeterminate",
      confidence: "medium", // pinned to "low"
      evidence_ids: [],
      indeterminate_reason: "Test reason",
      required_evidence_to_form_thesis: ["A", "B"],
    };
    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("deal_thesis"))).toBe(true);
    }
  });

  it("rejects indeterminate thesis with required_evidence_to_form_thesis below min (2)", () => {
    const artifact = loadFixture(BASE_FIXTURE) as Record<string, unknown>;
    artifact.deal_thesis = {
      status: "indeterminate",
      confidence: "low",
      evidence_ids: [],
      indeterminate_reason: "Test reason",
      required_evidence_to_form_thesis: ["only one"], // below min 2
    };
    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes("required_evidence_to_form_thesis"))
      ).toBe(true);
    }
  });

  it("rejects indeterminate thesis with required_evidence_to_form_thesis above max (5)", () => {
    const artifact = loadFixture(BASE_FIXTURE) as Record<string, unknown>;
    artifact.deal_thesis = {
      status: "indeterminate",
      confidence: "low",
      evidence_ids: [],
      indeterminate_reason: "Test reason",
      required_evidence_to_form_thesis: ["a", "b", "c", "d", "e", "f"], // above max 5
    };
    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes("required_evidence_to_form_thesis"))
      ).toBe(true);
    }
  });

  it("rejects artifact with no deal_thesis at all (top-level required)", () => {
    const artifact = loadFixture(ACME_FIXTURE) as Record<string, unknown>;
    delete artifact.deal_thesis;
    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("deal_thesis"))).toBe(true);
    }
  });

  it("rejects formed thesis missing decision_frame", () => {
    const artifact = loadFixture(ACME_FIXTURE) as Record<string, unknown>;
    artifact.deal_thesis = {
      status: "formed",
      thesis: "Some thesis",
      confidence: "medium",
      // decision_frame missing
      why_this_matters: "Why",
      evidence_ids: ["si_eleanor_pain_q3"],
    };
    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("decision_frame"))).toBe(true);
    }
  });
});
