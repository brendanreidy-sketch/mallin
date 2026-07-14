/**
 * ============================================================================
 *  Core Intelligence Agent — Production implementation
 * ============================================================================
 *
 *  Pass 2 of the orchestration pipeline. Reads the Pass 1.5 substrate,
 *  calls Claude with the system + user prompt and the emit_enrichments
 *  tool, parses the tool_use response, returns CoreIntelligenceEnrichments.
 *
 *  This implementation does NOT validate its own output. Validation is
 *  the runner's job (Layer A: validateStructure, Layer B: validateEnrichments).
 *  Separation of concerns: the agent produces, the validator gates.
 *
 * ============================================================================
 *  STRUCTURAL WARNING — read before modifying
 * ============================================================================
 *
 *  ExecutionAgentInput currently serves dual roles in the contracts:
 *    - Pre-enrichment substrate (Pass 2 INPUT)
 *    - Post-enrichment envelope (Pass 3 INPUT)
 *
 *  This is a known structural conflation. The substrate/envelope split
 *  is enforced by convention and JSDoc, not by the type system.
 *
 *  Pass 2 MUST treat the following fields on the input as WRITE-ONLY OUTPUTS.
 *  Do NOT read from them in this agent — they are the agent's outputs,
 *  not its inputs:
 *    - intelligence
 *    - conflicts
 *    - core_intelligence_enrichments
 *
 *  Future refactor:
 *    - Split CoreIntelligenceInput (pre) from ExecutionAgentInput (post)
 *    - Enforce the boundary at the type level instead of by convention
 *
 *  Ordering: the refactor should happen AFTER the agent is shipping
 *  enrichments end-to-end, so the split is informed by real read/write
 *  patterns rather than guesswork.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/billing/log-usage";
import type {
  CoreIntelligenceAgent,
  CoreIntelligenceAgentRequest,
  CoreIntelligenceEnrichments,
} from "@/lib/contracts/core-intelligence-contract";
import {
  CORE_INTELLIGENCE_SYSTEM_PROMPT,
  CORE_INTELLIGENCE_PROMPT_VERSION,
  buildUserPrompt,
} from "@/prompts/core-intelligence-prompt";
import { EMIT_ENRICHMENTS_TOOL } from "./core-intelligence-tool-schema";

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Default model. Sonnet 4.6 is a drop-in upgrade from 4.5 with better
 * structured-output reliability — matters for tool use. Override via
 * request.config.model when iterating.
 */
const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Tool-use response budget. Enrichments payloads observed in fixture
 * runs are well under 8K tokens; doubling that for headroom on large
 * deals with many activities and stakeholders.
 */
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * Maximum total attempts at producing a tool call. 1 = no retry.
 * 3 = up to 2 retries on tool-call failure. Each retry includes
 * the prior failure context in the message thread.
 */
const MAX_ATTEMPTS = 3;

// ────────────────────────────────────────────────────────────────────────────
// AGENT
// ────────────────────────────────────────────────────────────────────────────

export interface CoreIntelligenceAgentOptions {
  /** Inject a pre-built SDK client. Useful for testing, observability
   *  wrappers (Phoenix, Helicone), or non-default base URLs. If omitted,
   *  a client is constructed from process.env.ANTHROPIC_API_KEY. */
  client?: Anthropic;
}

export class ProductionCoreIntelligenceAgent implements CoreIntelligenceAgent {
  private readonly client: Anthropic;

  constructor(options: CoreIntelligenceAgentOptions = {}) {
    this.client =
      options.client ??
      new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
  }

  async enrich(
    request: CoreIntelligenceAgentRequest
  ): Promise<CoreIntelligenceEnrichments> {
    const model = request.config.model ?? DEFAULT_MODEL;
    const userPrompt = buildUserPrompt(request.pre_enrichment_input, {
      include_full_transcripts: request.config.include_full_transcripts,
      max_intelligence_items: request.config.max_intelligence_items,
    });

    // Retry on tool-call failure only. Layer A and Layer B validation
    // stay in the runner — agent's job is to produce structured output,
    // runner's job is to validate. Up to MAX_ATTEMPTS total tries.
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: userPrompt },
    ];
    let lastFailureReason: string | null = null;

    const t0 = Date.now();
    let attempts = 0;
    let toolUseInput: unknown = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;

      const response = await this.client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Cache the static system prompt (+ tools) — output-neutral, ~0.1x on
        // repeat reads.
        system: [
          {
            type: "text",
            text: CORE_INTELLIGENCE_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
        tools: [EMIT_ENRICHMENTS_TOOL],
        tool_choice: { type: "tool", name: EMIT_ENRICHMENTS_TOOL.name },
      });

      // Token accounting — every attempt counts toward the run's cost,
      // even failed ones.
      totalInputTokens += response.usage?.input_tokens ?? 0;
      totalOutputTokens += response.usage?.output_tokens ?? 0;
      logUsage("core_intelligence", model, response.usage);

      const toolUseBlock = response.content.find(
        (block) =>
          block.type === "tool_use" && block.name === EMIT_ENRICHMENTS_TOOL.name
      );

      if (toolUseBlock && toolUseBlock.type === "tool_use") {
        toolUseInput = toolUseBlock.input;
        break;
      }

      // Collect failure context for the next attempt's retry message.
      const stopReason = response.stop_reason;
      const textBlocks = response.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      lastFailureReason =
        `stop_reason=${stopReason}. ` +
        (textBlocks ? `Text emitted instead of tool call: ${textBlocks.slice(0, 500)}` : "No text content emitted.");

      // If this wasn't the last attempt, append a retry instruction.
      if (attempts < MAX_ATTEMPTS) {
        messages.push({
          role: "assistant",
          content: textBlocks || "(no text emitted)",
        });
        messages.push({
          role: "user",
          content:
            `Your previous response did not invoke the ${EMIT_ENRICHMENTS_TOOL.name} tool. ` +
            `You MUST call this tool with the full enrichments payload. Do not respond with text. ` +
            `Failure context: ${lastFailureReason}`,
        });
      }
    }

    const latency_ms = Date.now() - t0;

    if (toolUseInput === null) {
      throw new CoreIntelligenceAgentError(
        `Model did not invoke ${EMIT_ENRICHMENTS_TOOL.name} after ${MAX_ATTEMPTS} attempts. ` +
          `Last failure: ${lastFailureReason ?? "(no context)"}`
      );
    }

    // The agent contract is to return enrichments as-typed. Layer A
    // (validateStructure) is the runtime gatekeeper that confirms the
    // shape — we don't double-validate here.
    const enrichments = toolUseInput as CoreIntelligenceEnrichments;

    // Hard-overwrite runner-owned metadata. The agent produces cognition;
    // it has no audit authority over provenance. Token usage, latency,
    // attempt count, model, and timestamp are all runner-owned — even
    // if the model emits values, they are discarded.
    if (enrichments.diagnostics) {
      enrichments.diagnostics.model = `${model} (prompt ${CORE_INTELLIGENCE_PROMPT_VERSION})`;
      enrichments.diagnostics.generated_at = new Date().toISOString();
      enrichments.diagnostics.usage = {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      };
      enrichments.diagnostics.latency_ms = latency_ms;
      enrichments.diagnostics.attempts = attempts;
    }

    return enrichments;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ERRORS
// ────────────────────────────────────────────────────────────────────────────

export class CoreIntelligenceAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoreIntelligenceAgentError";
  }
}
