/**
 * ============================================================================
 *  Core Intelligence Agent — Stub implementation
 * ============================================================================
 *
 *  Returns canned CoreIntelligenceEnrichments from a fixture file.
 *  Lets the runner exercise the full Pass 1.5 → Pass 2 → Layer A →
 *  Layer B chain without spending API tokens.
 *
 *  Default fixture path: scripts/_fixtures/acme-beneba-golden.json
 *  Override via constructor for fixture-diffing or alternate scenarios.
 *
 *  Use cases:
 *    - CI: validate the contract bridge without an API key
 *    - Local iteration: shape the validators against known-good output
 *    - Regression: lock the golden fixture as the contract baseline
 *
 *  This stub does NOT mutate the fixture. If you need to test agent
 *  behavior under different inputs, point it at a different fixture.
 * ============================================================================
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CoreIntelligenceAgent,
  CoreIntelligenceAgentRequest,
  CoreIntelligenceEnrichments,
} from "@/lib/contracts/core-intelligence-contract";

const DEFAULT_FIXTURE_PATH = "scripts/_fixtures/acme-beneba-golden.json";

export interface StubCoreIntelligenceAgentOptions {
  /** Path to a JSON fixture containing a CoreIntelligenceEnrichments
   *  payload. Resolved relative to the process cwd unless absolute.
   *  Defaults to the Acme/Beneba golden fixture. */
  fixturePath?: string;
}

export class StubCoreIntelligenceAgent implements CoreIntelligenceAgent {
  private readonly fixturePath: string;

  constructor(options: StubCoreIntelligenceAgentOptions = {}) {
    this.fixturePath = resolve(
      process.cwd(),
      options.fixturePath ?? DEFAULT_FIXTURE_PATH
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async enrich(
    _request: CoreIntelligenceAgentRequest
  ): Promise<CoreIntelligenceEnrichments> {
    let raw: string;
    try {
      raw = readFileSync(this.fixturePath, "utf8");
    } catch (err) {
      throw new Error(
        `StubCoreIntelligenceAgent: failed to read fixture at ${this.fixturePath}. ` +
          `Original error: ${(err as Error).message}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `StubCoreIntelligenceAgent: fixture at ${this.fixturePath} is not valid JSON. ` +
          `Original error: ${(err as Error).message}`
      );
    }

    // The stub trusts its fixture. Layer A in the runner will catch
    // shape drift if the fixture goes stale.
    return parsed as CoreIntelligenceEnrichments;
  }
}
