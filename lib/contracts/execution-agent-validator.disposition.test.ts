/**
 * Stakeholder disposition: enum + rationale split (regression).
 *
 * Bug context: live Pass 4 was emitting strings like
 *   "unknown — verbally positive but no internal advocacy observed"
 * into current_state.disposition. Layer A passed because the field was
 * loosely typed as z.string(); Layer B then failed Check 3 because the
 * annotated string didn't equal Pass 2's bare enum.
 *
 * Fix: disposition is a closed enum; nuance moves to disposition_rationale.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateExecutionOutput } from "./execution-agent-validator";

const ACME_FIXTURE = resolve(
  __dirname,
  "../../scripts/_fixtures/acme-beneba-full-pipeline-output.pass4-output.json"
);

function loadFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(ACME_FIXTURE, "utf8"));
}

describe("stakeholder disposition — enum + rationale split", () => {
  it("rejects annotated disposition string (the original bug)", () => {
    const artifact = loadFixture();
    const stakeholders = artifact.stakeholder_strategy as Array<{
      current_state: { disposition?: string };
    }>;
    stakeholders[0].current_state.disposition =
      "unknown — verbally positive but no internal advocacy observed";

    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes("disposition"))
      ).toBe(true);
    }
  });

  it("accepts bare enum disposition with optional rationale", () => {
    const artifact = loadFixture();
    const stakeholders = artifact.stakeholder_strategy as Array<{
      current_state: {
        disposition?: string;
        disposition_rationale?: string;
      };
    }>;
    stakeholders[0].current_state.disposition = "unknown";
    stakeholders[0].current_state.disposition_rationale =
      "verbally positive but no internal advocacy observed";

    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(true);
  });

  it("rejects out-of-vocabulary disposition value", () => {
    const artifact = loadFixture();
    const stakeholders = artifact.stakeholder_strategy as Array<{
      current_state: { disposition?: string };
    }>;
    stakeholders[0].current_state.disposition = "ambivalent";

    const result = validateExecutionOutput(artifact);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes("disposition"))
      ).toBe(true);
    }
  });
});
