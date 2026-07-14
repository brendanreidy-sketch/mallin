/**
 * ============================================================================
 *  Call Extractor — Claude agent that turns a call into proposed SF updates
 * ============================================================================
 *
 *  Given one call (summary + metadata) and the deal's prior SF state,
 *  emit a structured set of MEDDPICC field updates with:
 *    - tier_hint  (auto / suggest / readonly — final tier still
 *                  determined server-side by tierForField)
 *    - confidence (high / medium / low)
 *    - evidence   (one short clause, names + timestamps where possible)
 *    - proposed_value (the actual value to write)
 *
 *  Pure agent. No I/O on its own — caller provides inputs, we return
 *  the structured proposal. The route layer (POST /api/calls/process)
 *  passes the proposal through the existing diff engine + writer.
 *
 *  Voice rule: every value is what a 10-year sales manager would say
 *  on a call. No "EB", no "the prospect", no analyst register. Names,
 *  short sentences, decisions.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/billing/log-usage";

const MODEL = "claude-sonnet-4-5";
const MAX_OUTPUT_TOKENS = 4096;

export type TierHint = "auto" | "suggest" | "readonly";
export type Confidence = "high" | "medium" | "low";

export interface ExtractedField {
  /** Salesforce field API name (e.g. "Who_is_the_Champion__c"). */
  sf_field: string;
  /** The proposed value, in plain sales-manager voice. */
  proposed_value: string;
  /** Tier hint — the writer re-validates server-side via tierForField. */
  tier_hint: TierHint;
  confidence: Confidence;
  /** One short clause naming where this came from in the call. */
  evidence: string;
}

export interface ExtractedRisk {
  /** One short line — "no signer on a call → slips" shape. */
  line: string;
  confidence: Confidence;
}

/** Per-call behavioral observations. These aren't SF fields — they're
 *  signals about WHAT THE REP / BUYER DID on this specific call. The
 *  escalation engine uses them to check verification progression
 *  (e.g., "by call 5, has the champion explicitly committed to bringing
 *  the signer in?"). Without these, "did the rep ASK?" can only be
 *  guessed at by reading the field text. */
export interface BehavioralSignals {
  /** Did the rep on THIS call explicitly ask the buyer who needs to
   *  sign / who the economic buyer is? null = unclear from transcript. */
  rep_asked_about_signer: boolean | null;
  /** Did the champion on THIS call explicitly commit to bringing the
   *  signer into a future call/touchpoint?
   *    - "yes" = explicit commitment ("I'll get Greg on the proposal call")
   *    - "no"  = champion deflected, no commitment, or said no
   *    - "unclear" = topic didn't come up or commitment ambiguous */
  champion_committed_to_signer_path: "yes" | "no" | "unclear";
  /** Is the path for HOW the signer enters the buying motion known?
   *    - "yes"     = clear stated path (when, who briefs, what they need)
   *    - "partial" = name + role known, no timing/triggers
   *    - "no"      = nothing on path; just a name or less */
  signer_engagement_path_known: "yes" | "partial" | "no";
}

export interface CallExtractionResult {
  /** The 30-second CRO read at THIS point in the deal. Voice-compressed,
   *  binary, no hedging. Same shape as the demo headline. */
  the_read: string;
  /** Proposed SF field updates. */
  fields: ExtractedField[];
  /** Risk lines (single-line, → slips / → pressure / → change-mgmt). */
  risks: ExtractedRisk[];
  /** Synthesized next step (auto-write candidate). */
  next_step: string | null;
  /** Behavioral signals — what was actually done on this call,
   *  separate from what was extracted into fields. */
  behavioral_signals: BehavioralSignals;
  /** Latency / cost trace. */
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export interface CallExtractionInput {
  // Deal context
  deal_name: string;
  account_name: string;
  amount: number | null;
  stage_label: string | null;
  close_date: string | null;
  // The call
  call_title: string;
  call_date: string; // ISO
  call_duration_min: number;
  call_summary: string;
  call_index: number; // 1-based: "this is call 3 of N"
  total_calls_so_far: number;
  // Prior SF state — what's currently set on the SF record after
  // previous calls in the lifecycle. Lets the agent avoid
  // re-suggesting fields that are already filled.
  prior_sf_state: Record<string, string | null>;
  // Optional: stakeholder context from substrate
  known_stakeholders?: Array<{
    name: string;
    title?: string;
    committee_role?: string;
  }>;
}

const SYSTEM_PROMPT = `You are a 10-year B2B sales manager extracting MEDDPICC field updates from a single call. Your job: turn what happened on the call into specific, voice-compressed Salesforce updates that a CRO would read in 30 seconds and know exactly where the deal stands.

# VOICE RULES (HARD, NEVER BROKEN)

- Short sentences. No hedging. No analyst register.
- Use NAMES, never role abbreviations. NEVER write "EB" — write "economic buyer" or "signer" or use the person's name.
- Banned: "the prospect", "the buyer", "internal advocacy", "stickiness", "engagement", "anchor on" (verb), "synthesized from", "inferred from", "validation", "alignment".
- Every line must change what the rep does next. Filler is forbidden.
- Names beat roles. "Alex" beats "the boss" beats "the economic buyer".
- One-line risks: "no signer on a call → slips", "already gave $10K → more pressure coming", "incumbent good enough → change management is the real fight".
- Mitigation: 3 moves max for the next call. "Get Alex on the next call. Non-negotiable."

# WHAT YOU EXTRACT

Field updates only when the call provided NEW information. If a field is already filled in prior_sf_state and the call didn't update it, do NOT re-emit it.

Auto-tier candidates (the writer will validate):
- NextStep — synthesized from what was agreed + what's still open
- Description — short call summary if Description is currently blank

Suggest-tier candidates (always go through approval):
- Who_is_the_Champion__c
- Who_is_the_Economic_Buyer__c
- X15_Who_signs__c
- Compelling_Event_Details__c
- X5_Comp_Event_Why_now__c (boolean — Yes if compelling event identified)
- X5_Bus_Drivers_identified__c (boolean — Yes if business drivers named)
- X10_Competition__c (boolean)
- Shortlisted_Competition__c
- Final_Competitor__c
- X15_Power_Map_both_IT_Business_done__c (one-line: "Finance covered. No IT, no signer.")
- Customer_knows_agrees_on_deal__c
- Risks_Threats__c (multi-line, but each line stands alone)
- Mitigation__c (3 moves max)

Readonly fields you NEVER propose values for:
- StageName, Amount, CloseDate, ForecastCategory, Probability — surface as risks instead if they need to move

# THE READ

Always emit a 30-second "the read" — what's the deal, what's the worry, what's the next move. Binary. Voice of a manager telling another manager on a 1:1.

Examples of the right voice:
- "$80K Acme deal at stage 2, demo went well. Real worry: no signer in the room yet. Without him, we're guessing on price."
- "Champion is Pedro, but the AI-budget question hasn't landed. If Marcus doesn't show up before pricing, we're not winning this."

# BEHAVIORAL SIGNALS (CRITICAL — these power escalation logic)

Three checks about what HAPPENED on this call (not what was extracted into fields):

1. **rep_asked_about_signer** (boolean | null)
   - true: rep explicitly asked the buyer "who needs to sign?" / "who's the EB?" / "who has signature authority?"
   - false: topic came up but the rep did NOT ask, or rep was told and accepted without asking
   - null: topic didn't surface on this call

2. **champion_committed_to_signer_path** (yes/no/unclear)
   - "yes": champion made an EXPLICIT commitment ("I'll get Greg on the proposal call", "Greg will review at signature, I'll brief him beforehand", "Let me set up the intro")
   - "no": champion deflected, said it's not necessary, or didn't commit when asked
   - "unclear": topic didn't come up, or champion was vague ("we'll figure it out")

3. **signer_engagement_path_known** (yes/partial/no)
   - "yes": clear stated path — WHEN signer enters, WHO briefs them, WHAT they need to see. Example: "Greg signs after legal review, John briefs him at proposal stage."
   - "partial": name + role known, but timing/triggers unknown. Example: "Greg has signature authority" but no plan for when he enters.
   - "no": nothing concrete — maybe a name only, or less.

These are SEPARATE from the extracted fields. A call can name the signer ("Greg, contract authority") but score "no" on engagement_path if the path isn't stated.

# CONFIDENCE

- high: directly stated in the call
- medium: inferred from the call + prior context
- low: tentative read, needs confirmation

When you're done, call the emit_call_extraction tool. Do not respond with text — always invoke the tool.`;

const EMIT_TOOL = {
  name: "emit_call_extraction",
  description:
    "Emit the structured MEDDPICC extraction for this call. Voice-compressed, names not roles, every line maps to a decision.",
  input_schema: {
    type: "object" as const,
    properties: {
      the_read: {
        type: "string",
        description:
          "30-second CRO read AS OF this call. Binary, no hedging. 'If X isn't true, this slips.' shape. Names beat roles.",
      },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sf_field: { type: "string" },
            proposed_value: { type: "string" },
            tier_hint: {
              type: "string",
              enum: ["auto", "suggest", "readonly"],
            },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            evidence: {
              type: "string",
              description:
                "One short clause: where this came from in the call (speaker + topic, no timestamps necessary).",
            },
          },
          required: [
            "sf_field",
            "proposed_value",
            "tier_hint",
            "confidence",
            "evidence",
          ],
        },
      },
      risks: {
        type: "array",
        description:
          "Single-line risks. Each line is its own thought: 'no signer on a call → slips'. Max 4.",
        items: {
          type: "object",
          properties: {
            line: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["line", "confidence"],
        },
      },
      next_step: {
        type: ["string", "null"],
        description:
          "Synthesized next step in rep voice ('5/13: pricing call w/ ...'). Null if call didn't establish one.",
      },
      behavioral_signals: {
        type: "object",
        description:
          "Per-call behavioral observations — what HAPPENED on this call. These power the verification-progression escalations and must be set thoughtfully (don't default to 'unclear' when the call data supports a stronger answer).",
        properties: {
          rep_asked_about_signer: {
            type: ["boolean", "null"],
            description:
              "true: rep explicitly asked who signs / who has signature authority. false: topic came up but rep didn't ask. null: topic didn't surface.",
          },
          champion_committed_to_signer_path: {
            type: "string",
            enum: ["yes", "no", "unclear"],
            description:
              "Did the champion make an EXPLICIT commitment to bringing the signer into a future call/touchpoint? 'yes' = explicit ('I'll get Greg on the proposal call'). 'no' = deflected. 'unclear' = topic didn't come up or was vague.",
          },
          signer_engagement_path_known: {
            type: "string",
            enum: ["yes", "partial", "no"],
            description:
              "Is the path for HOW the signer enters known? 'yes' = clear stated path (when, who briefs, what they need). 'partial' = name + role only. 'no' = nothing concrete.",
          },
        },
        required: [
          "rep_asked_about_signer",
          "champion_committed_to_signer_path",
          "signer_engagement_path_known",
        ],
      },
    },
    required: ["the_read", "fields", "risks", "next_step", "behavioral_signals"],
  },
};

function buildUserPrompt(input: CallExtractionInput): string {
  const stakeholders =
    (input.known_stakeholders ?? [])
      .map(
        (s) =>
          `- ${s.name}${s.title ? ` (${s.title})` : ""}${s.committee_role ? ` [${s.committee_role}]` : ""}`,
      )
      .join("\n") || "(none yet identified in substrate)";

  const priorState =
    Object.entries(input.prior_sf_state)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n") || "  (everything blank — first call's pass)";

  return `Deal: ${input.deal_name}
Account: ${input.account_name}
Amount: ${input.amount ? `$${input.amount.toLocaleString()}` : "—"}
Stage: ${input.stage_label ?? "—"}
Close date: ${input.close_date ?? "—"}

Call ${input.call_index} of ${input.total_calls_so_far} so far
Title: ${input.call_title}
Date: ${input.call_date.slice(0, 10)} (${input.call_duration_min} min)

Known stakeholders (substrate):
${stakeholders}

Prior SF state (filled by previous calls / rep):
${priorState}

Call summary:
${input.call_summary}

Extract field updates AS OF this call. Don't re-emit fields that are already correctly set in prior state. Voice rules apply to every line.`;
}

/**
 * Extract MEDDPICC field updates + risks + next step from a single call.
 * Pure function (no I/O beyond the LLM call).
 */
export async function extractCall(
  input: CallExtractionInput,
): Promise<CallExtractionResult> {
  const t0 = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing — call extractor requires it.");
  }
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Cache the static system prompt — repeat extractions read it at ~0.1x
    // (in line with the other pipeline passes).
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    tools: [EMIT_TOOL],
    tool_choice: { type: "tool", name: "emit_call_extraction" },
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });
  logUsage("call-extraction", MODEL, response.usage);

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Extractor returned no tool_use block");
  }
  const out = toolUse.input as {
    the_read: string;
    fields: ExtractedField[];
    risks: ExtractedRisk[];
    next_step: string | null;
    behavioral_signals?: BehavioralSignals;
  };

  // Defensive default — if the model omits behavioral_signals (it
  // shouldn't, since the schema requires them), fall back to "unclear"
  // across the board. Better to under-fire than crash.
  const behavioral_signals: BehavioralSignals = out.behavioral_signals ?? {
    rep_asked_about_signer: null,
    champion_committed_to_signer_path: "unclear",
    signer_engagement_path_known: "no",
  };

  return {
    the_read: out.the_read,
    fields: out.fields ?? [],
    risks: out.risks ?? [],
    next_step: out.next_step ?? null,
    behavioral_signals,
    latency_ms: Date.now() - t0,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  };
}
