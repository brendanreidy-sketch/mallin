/**
 * ============================================================================
 *  Rep Behavior Agent — Production implementation (Pass 2c, v0)
 * ============================================================================
 *
 *  Reads deal substrate (calls + emails + internal_participants), calls
 *  Claude with the rep-behavior system + user prompt and the
 *  emit_rep_behavior tool, parses tool_use response, runs Layer A
 *  structural validation, returns RepBehaviorAgentOutput.
 *
 *  RETRY POLICY: same as Pass 2 / Pass 4.
 *    - Missing tool_use            -> retry with text feedback
 *    - Layer A validation failure  -> retry with error list
 *  Both share MAX_ATTEMPTS budget.
 *
 *  VALIDATION SCOPE: Layer A only. Layer B (substrate cross-reference —
 *  rep_id resolves, call_id resolves, evidence_ids resolve) is the
 *  runner's responsibility, deferred until extraction quality is
 *  proven on real deals.
 *
 *  METADATA OWNERSHIP:
 *    Runner-owned: model, prompt_version, generated_at, usage,
 *                  latency_ms, attempts
 *    Model-owned:  rep_ids_analyzed, insufficiently_evidenced,
 *                  quality_warnings
 * ============================================================================
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  RepBehaviorAgentInput,
  RepBehaviorAgentOutput,
} from '@/lib/contracts/rep-behavior-contract';
import { validateRepBehaviorOutput } from '@/lib/contracts/rep-behavior-contract';
import {
  REP_BEHAVIOR_SYSTEM_PROMPT,
  REP_BEHAVIOR_AGENT_PROMPT_VERSION,
  buildRepBehaviorUserPrompt,
} from '@/prompts/rep-behavior-prompt';
import { EMIT_REP_BEHAVIOR_TOOL } from './rep-behavior-tool-schema';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 16_000;
const MAX_ATTEMPTS = 3;

export interface RepBehaviorAgentRequest {
  input: RepBehaviorAgentInput;
  config?: {
    model?: string;
  };
}

export interface RepBehaviorAgentOptions {
  client?: Anthropic;
}

export class ProductionRepBehaviorAgent {
  private readonly client: Anthropic;

  constructor(options: RepBehaviorAgentOptions = {}) {
    this.client =
      options.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async extract(
    request: RepBehaviorAgentRequest
  ): Promise<RepBehaviorAgentOutput> {
    const model = request.config?.model ?? DEFAULT_MODEL;
    const userPrompt = buildRepBehaviorUserPrompt(request.input);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: userPrompt },
    ];
    let lastFailureReason: string | null = null;

    const t0 = Date.now();
    let attempts = 0;
    let validated: RepBehaviorAgentOutput | null = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;

      const response = await this.client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: REP_BEHAVIOR_SYSTEM_PROMPT,
        messages,
        tools: [EMIT_REP_BEHAVIOR_TOOL],
        tool_choice: { type: 'tool', name: EMIT_REP_BEHAVIOR_TOOL.name },
      });

      totalInputTokens += response.usage?.input_tokens ?? 0;
      totalOutputTokens += response.usage?.output_tokens ?? 0;

      const toolUseBlock = response.content.find(
        (block) =>
          block.type === 'tool_use' &&
          block.name === EMIT_REP_BEHAVIOR_TOOL.name
      );

      if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
        const stopReason = response.stop_reason;
        const textBlocks = response.content
          .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text)
          .join('\n');
        lastFailureReason =
          `[missing tool_use] stop_reason=${stopReason}. ` +
          (textBlocks
            ? `Text emitted instead: ${textBlocks.slice(0, 500)}`
            : 'No text content emitted.');
        if (attempts < MAX_ATTEMPTS) {
          messages.push({
            role: 'assistant',
            content: textBlocks || '(no text emitted)',
          });
          messages.push({
            role: 'user',
            content:
              `Your previous response did not invoke the ${EMIT_REP_BEHAVIOR_TOOL.name} tool. ` +
              `You MUST call this tool with the full payload. Do not respond with text. ` +
              `Failure context: ${lastFailureReason}`,
          });
        }
        continue;
      }

      const validation = validateRepBehaviorOutput(toolUseBlock.input);
      if (!validation.ok) {
        lastFailureReason =
          `[validation failure] ${validation.errors.length} error(s): ` +
          validation.errors.slice(0, 10).join(' | ');
        if (attempts < MAX_ATTEMPTS) {
          messages.push({
            role: 'assistant',
            content: `Called ${EMIT_REP_BEHAVIOR_TOOL.name} with payload that failed Layer A structural validation.`,
          });
          messages.push({
            role: 'user',
            content:
              `Your call to ${EMIT_REP_BEHAVIOR_TOOL.name} failed structural validation. ` +
              `Errors:\n${validation.errors.join('\n')}\n` +
              `Re-invoke ${EMIT_REP_BEHAVIOR_TOOL.name} with corrected output. ` +
              `Do not respond with text — call the tool again.`,
          });
        }
        continue;
      }

      validated = validation.data;
      break;
    }

    const latency_ms = Date.now() - t0;

    if (validated === null) {
      throw new RepBehaviorAgentError(
        `Rep behavior agent failed to produce a valid output after ${MAX_ATTEMPTS} attempts. ` +
          `Last failure: ${lastFailureReason ?? '(no context)'}`
      );
    }

    // Hard-overwrite runner-owned metadata.
    validated.metadata.model = model;
    validated.metadata.prompt_version = REP_BEHAVIOR_AGENT_PROMPT_VERSION;
    validated.metadata.generated_at = new Date().toISOString();
    validated.metadata.usage = {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    };
    validated.metadata.latency_ms = latency_ms;
    validated.metadata.attempts = attempts;

    return validated;
  }
}

export class RepBehaviorAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepBehaviorAgentError';
  }
}
