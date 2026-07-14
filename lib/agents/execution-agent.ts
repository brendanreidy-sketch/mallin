/**
 * ============================================================================
 *  Execution Agent — Production implementation (Pass 4)
 * ============================================================================
 *
 *  Reads the merged ExecutionAgentInput, calls Claude with the system +
 *  user prompt and the emit_prep_artifact tool, parses the tool_use
 *  response, runs Layer A structural validation, returns PrepArtifact.
 *
 *  RETRY POLICY:
 *    - Missing tool_use            -> retry with text feedback
 *    - Layer A validation failure  -> retry with error list
 *  Both failure modes share MAX_ATTEMPTS. After exhaustion, throws
 *  ExecutionAgentError with full failure context.
 *
 *  VALIDATION SCOPE:
 *    Layer A only (validateExecutionOutput). Layer B integrity checks
 *    (evidence resolution, posture equality, stakeholder alignment,
 *    conflict linkage, meeting linkage) are the runner's responsibility,
 *    not this agent's. Do NOT add Layer B logic here.
 *
 *  METADATA OWNERSHIP (per doctrine §4.4):
 *    Runner-owned (hard-overwritten post-call, regardless of model emission):
 *      model, prompt_version, generated_at, opportunity_id,
 *      usage, latency_ms, attempts
 *    Model-owned (trusted from tool call, validated by Layer A):
 *      surface_mode, rationale, insufficiently_evidenced
 *
 *  Note vs Pass 2: core-intelligence-agent.ts collapses model +
 *  prompt_version into a single diagnostics.model string. Pass 4 has
 *  them as separate fields on PrepArtifactMetadata, so they are
 *  stamped separately here.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/billing/log-usage";
import type {
  ExecutionAgent,
  ExecutionAgentRequest,
  PrepArtifact,
} from "@/lib/contracts/execution-agent-output";
import { validateExecutionOutput } from "@/lib/contracts/execution-agent-validator";
import {
  EXECUTION_AGENT_SYSTEM_PROMPT,
  EXECUTION_AGENT_PROMPT_VERSION,
  buildUserPrompt,
} from "@/prompts/execution-agent-prompt";
import { EMIT_PREP_ARTIFACT_TOOL } from "./execution-tool-schema";

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
 * Tool-use response budget. PrepArtifact payloads run larger than
 * enrichments (rep-facing prose + multiple stakeholder strategies +
 * talk track), but observed runs stay well under 16K tokens.
 */
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * Maximum total attempts at producing a structurally-valid PrepArtifact.
 * 1 = no retry. 3 = up to 2 retries on (missing-tool-call OR Layer A
 * validation failure). Each retry includes the prior failure context
 * in the message thread.
 */
const MAX_ATTEMPTS = 3;

// ────────────────────────────────────────────────────────────────────────────
// AGENT
// ────────────────────────────────────────────────────────────────────────────

export interface ExecutionAgentOptions {
  /** Inject a pre-built SDK client. Useful for testing, observability
   *  wrappers (Phoenix, Helicone), or non-default base URLs. If omitted,
   *  a client is constructed from process.env.ANTHROPIC_API_KEY. */
  client?: Anthropic;
}

export class ProductionExecutionAgent implements ExecutionAgent {
  private readonly client: Anthropic;

  constructor(options: ExecutionAgentOptions = {}) {
    this.client =
      options.client ??
      new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
  }

  async execute(
    request: ExecutionAgentRequest
  ): Promise<PrepArtifact> {
    const model = request.config.model ?? DEFAULT_MODEL;
    const userPrompt = buildUserPrompt(request.enriched_input, {
      surface_mode: request.config.surface_mode ?? "full",
      max_critical_risks: request.config.max_critical_risks ?? 3,
      max_stakeholder_strategies: request.config.max_stakeholder_strategies ?? 5,
      max_talk_track_questions: request.config.max_talk_track_questions ?? 5,
      max_open_questions: request.config.max_open_questions ?? 5,
      declared_altitude: request.config.declared_altitude ?? null,
    });

    // Retry on missing tool-call OR Layer A validation failure. Up to
    // MAX_ATTEMPTS total tries, shared budget across both failure modes.
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: userPrompt },
    ];
    let lastFailureReason: string | null = null;

    const t0 = Date.now();
    let attempts = 0;
    let validatedArtifact: PrepArtifact | null = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;

      const response = await this.client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Cache the static system prompt (+ tools) — repeat attempts/briefs read
        // it at ~0.1x. Output-neutral; the model sees the identical prompt.
        system: [
          {
            type: "text",
            text: EXECUTION_AGENT_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
        tools: [EMIT_PREP_ARTIFACT_TOOL],
        tool_choice: { type: "tool", name: EMIT_PREP_ARTIFACT_TOOL.name },
      });

      // Token accounting — every attempt counts toward run cost.
      totalInputTokens += response.usage?.input_tokens ?? 0;
      totalOutputTokens += response.usage?.output_tokens ?? 0;
      logUsage("execution", model, response.usage);

      const toolUseBlock = response.content.find(
        (block) =>
          block.type === "tool_use" &&
          block.name === EMIT_PREP_ARTIFACT_TOOL.name
      );

      // ── Case 1: model did not invoke the tool ──────────────────────────
      if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
        const stopReason = response.stop_reason;
        const textBlocks = response.content
          .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        lastFailureReason =
          `[missing tool_use] stop_reason=${stopReason}. ` +
          (textBlocks
            ? `Text emitted instead: ${textBlocks.slice(0, 500)}`
            : "No text content emitted.");

        if (attempts < MAX_ATTEMPTS) {
          messages.push({
            role: "assistant",
            content: textBlocks || "(no text emitted)",
          });
          messages.push({
            role: "user",
            content:
              `Your previous response did not invoke the ${EMIT_PREP_ARTIFACT_TOOL.name} tool. ` +
              `You MUST call this tool with the full PrepArtifact payload. Do not respond with text. ` +
              `Failure context: ${lastFailureReason}`,
          });
        }
        continue;
      }

      // ── Case 2: tool invoked — run Layer A structural validation ──────
      const validation = validateExecutionOutput(toolUseBlock.input);
      if (!validation.ok) {
        lastFailureReason =
          `[validation failure] ${validation.errors.length} error(s): ` +
          validation.errors.slice(0, 10).join(" | ");

        if (attempts < MAX_ATTEMPTS) {
          messages.push({
            role: "assistant",
            content: `Called ${EMIT_PREP_ARTIFACT_TOOL.name} with payload that failed Layer A structural validation.`,
          });
          messages.push({
            role: "user",
            content:
              `Your call to ${EMIT_PREP_ARTIFACT_TOOL.name} failed structural validation. ` +
              `Errors:\n${validation.errors.join("\n")}\n` +
              `Re-invoke ${EMIT_PREP_ARTIFACT_TOOL.name} with corrected output. ` +
              `Do not respond with text — call the tool again.`,
          });
        }
        continue;
      }

      // ── Case 3: tool invoked AND Layer A validation passed ────────────
      validatedArtifact = validation.data as PrepArtifact;
      break;
    }

    const latency_ms = Date.now() - t0;

    if (validatedArtifact === null) {
      throw new ExecutionAgentError(
        `Execution agent failed to produce a valid PrepArtifact after ${MAX_ATTEMPTS} attempts. ` +
          `Last failure: ${lastFailureReason ?? "(no context)"}`
      );
    }

    // Hard-overwrite runner-owned metadata. The agent produces cognition;
    // it has no audit authority over provenance. Per doctrine §4.4, model
    // and prompt_version are runner-owned even if the model emits values.
    validatedArtifact.metadata.model = model;
    validatedArtifact.metadata.prompt_version = EXECUTION_AGENT_PROMPT_VERSION;
    validatedArtifact.metadata.generated_at = new Date().toISOString();
    validatedArtifact.metadata.opportunity_id =
      request.enriched_input.opportunity.id;
    validatedArtifact.metadata.usage = {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    };
    validatedArtifact.metadata.latency_ms = latency_ms;
    validatedArtifact.metadata.attempts = attempts;
    // Stamp declared_altitude for audit trail (which altitude was
    // declared at gen time). Null when no altitude was declared.
    validatedArtifact.metadata.declared_altitude =
      request.config.declared_altitude ?? null;

    return validatedArtifact;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ERRORS
// ────────────────────────────────────────────────────────────────────────────

export class ExecutionAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionAgentError";
  }
}
