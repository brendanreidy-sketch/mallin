/**
 * Golden scenarios for the brief-triangulation eval harness.
 *
 * Each scenario takes a REAL pipeline fixture as its base enriched input (so we
 * never hand-author a huge input), mutates it to set up a known situation, then
 * asserts on the produced brief — both what it MUST surface and what it must
 * NOT do (coin a deal name, fabricate a cross-deal resemblance, leak an acronym).
 *
 * These encode regressions we caught by hand this cycle so they can't recur
 * silently. Add a scenario whenever a prompt change fixes (or risks) a behavior.
 */
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";
import base from "../_fixtures/acme-beneba-full-pipeline-output.json";

export interface EvalAssertion {
  label: string;
  /** Passes when this returns true. Gets the serialized artifact + the object. */
  test: (artifactJson: string, artifact: PrepArtifact) => boolean;
}

export interface EvalScenario {
  name: string;
  description: string;
  base: Record<string, unknown>;
  /** Mutate a fresh clone of the base input to set up the scenario. */
  setup: (input: Record<string, unknown>) => Record<string, unknown>;
  assertions: EvalAssertion[];
}

const BASE = base as unknown as Record<string, unknown>;

export const SCENARIOS: EvalScenario[] = [
  {
    name: "anonymized-cross-deal",
    description:
      "a teammate's lost-deal lesson coaches the deal WITHOUT coining a deal name from the notes",
    base: BASE,
    setup: (input) => ({
      ...input,
      // A teammate's loss whose NOTES mention the product ("Mallín had flagged")
      // — the exact shape that produced the confabulated "the Mallín deal" label.
      cross_deal_outcome_lessons: [
        "LOST — a teammate's deal at your company: the rep caved on term without approval and bashed the incumbent to the CFO (the flagged risk hit) — Lost on trust, not price. In the final redline the rep guaranteed an unbuilt feature; Mallín had flagged she was the single economic buyer and her confidence was the deal.",
      ],
    }),
    assertions: [
      {
        // The regression guard: it must NEVER lift "Mallín" out of the notes and
        // render it as the lost deal's name.
        label: "does NOT coin a deal name from the notes (no 'the Mallín deal')",
        test: (json) => !/mall[ií]n['’]?s?\s+deal/i.test(json),
      },
    ],
  },
  {
    name: "no-fabricated-cross-deal",
    description:
      "with NO cross-deal lesson provided, the brief must not invent a teammate's-deal reference",
    base: BASE,
    setup: (input) => {
      const clone = { ...input };
      delete (clone as { cross_deal_outcome_lessons?: unknown }).cross_deal_outcome_lessons;
      return clone;
    },
    assertions: [
      {
        label: "does NOT fabricate a cross-deal / teammate's-deal reference",
        test: (json) =>
          !/teammate['’]?s?\s+deal|cross-deal loss|a prior deal your team lost|a teammate's deal at your company/i.test(
            json,
          ),
      },
    ],
  },
];
