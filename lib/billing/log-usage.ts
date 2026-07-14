import { supabaseAdmin } from "@/lib/db/client";
import { currentUsageContext } from "@/lib/billing/usage-context";

/**
 * Per-call token-usage + cost telemetry for the brief pipeline.
 *
 * Reads the `usage` block the Anthropic API already returns, prints a structured
 * line (Vercel → Functions), AND — when a usage-context is active (the pipeline
 * wraps its run in withUsageContext) — persists one `model_usage` row attributed
 * to the tenant. That row is what lets us answer "what did tenant X cost this
 * month" for pricing + fair-use tuning without scraping logs. Never affects
 * model output; both the log and the write are fail-open.
 *
 * Cost model (USD per 1M tokens, from Anthropic pricing):
 *   - fresh input  → base input rate
 *   - cache read   → 0.10× input rate
 *   - cache write  → 1.25× input rate (5-min TTL)
 *   - output       → base output rate
 */

const RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Log one model call's usage + estimated cost. Returns the estimated USD cost
 * so callers can accumulate a per-brief total if they want. Fail-safe: never
 * throws.
 */
export function logUsage(
  stage: string,
  model: string,
  usage: UsageLike | null | undefined,
): number {
  try {
    const r = RATES[model] ?? { input: 3, output: 15 };
    const inT = usage?.input_tokens ?? 0;
    const outT = usage?.output_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
    const cost =
      (inT * r.input +
        cacheRead * r.input * 0.1 +
        cacheWrite * r.input * 1.25 +
        outT * r.output) /
      1_000_000;
    console.log(
      `[cost] stage=${stage} model=${model} input=${inT} output=${outT} ` +
        `cache_read=${cacheRead} cache_write=${cacheWrite} est_usd=${cost.toFixed(4)}`,
    );

    // Persist per-tenant when the pipeline set an attribution context. Fire-and-
    // forget: never await (this is the model-call hot path) and never throw — a
    // telemetry write must not be able to break a brief.
    const ctx = currentUsageContext();
    if (ctx?.tenantId) {
      void supabaseAdmin
        .from("model_usage")
        .insert({
          tenant_id: ctx.tenantId,
          opportunity_id: ctx.opportunityId ?? null,
          stage,
          model,
          input_tokens: inT,
          output_tokens: outT,
          cache_read_tokens: cacheRead,
          cache_write_tokens: cacheWrite,
          est_usd: Number(cost.toFixed(5)),
        })
        .then(
          undefined,
          (err: unknown) =>
            console.warn(
              `[cost] model_usage persist failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
        );
    }

    return cost;
  } catch {
    return 0;
  }
}
