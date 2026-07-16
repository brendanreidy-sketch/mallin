/**
 * Brief-triangulation eval harness.
 *
 * Runs the execution agent (Pass 4 — the triangulation/synthesis step that turns
 * the enriched deal snapshot into the brief) against golden scenarios with
 * known-right answers, and grades the produced brief: did it AVOID the planted
 * traps (a coined deal name, a fabricated cross-deal resemblance, an acronym)?
 *
 * This is the regression net for prompt edits. The "Mallín deal" confabulation
 * and the "field-service management" acronym leak we caught by hand would both
 * be caught here automatically — run it after any change to the execution prompt.
 *
 * Run: npm run eval:brief    (needs ANTHROPIC_API_KEY; makes one live LLM call
 * per scenario, so it's a manual/pre-ship gate, not a fast unit test.)
 */
import { ProductionExecutionAgent } from "@/lib/agents/execution-agent";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";
import { SCENARIOS } from "./scenarios";

type EnrichedInput = Parameters<
  ProductionExecutionAgent["execute"]
>[0]["enriched_input"];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required to run brief evals.");
    process.exit(2);
  }

  const agent = new ProductionExecutionAgent();
  const failures: string[] = [];
  let assertionCount = 0;

  for (const scenario of SCENARIOS) {
    process.stdout.write(`\n▶ ${scenario.name} — ${scenario.description}\n`);
    let artifact: PrepArtifact;
    try {
      const input = scenario.setup(
        structuredClone(scenario.base),
      ) as unknown as EnrichedInput;
      artifact = await agent.execute({ enriched_input: input, config: {} });
    } catch (err) {
      failures.push(`${scenario.name}: agent threw — ${(err as Error).message}`);
      process.stdout.write(`  ✖ agent threw: ${(err as Error).message}\n`);
      continue;
    }

    const json = JSON.stringify(artifact);
    for (const a of scenario.assertions) {
      assertionCount++;
      const ok = a.test(json, artifact);
      process.stdout.write(`  ${ok ? "✓" : "✖"} ${a.label}\n`);
      if (!ok) failures.push(`${scenario.name} › ${a.label}`);
    }
  }

  process.stdout.write(`\n${"─".repeat(52)}\n`);
  if (failures.length === 0) {
    process.stdout.write(
      `✓ ${assertionCount} assertion(s) passed across ${SCENARIOS.length} scenario(s)\n`,
    );
    process.exit(0);
  }
  process.stdout.write(
    `✖ ${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join("\n")}\n`,
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
