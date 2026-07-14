/**
 * ============================================================================
 *  Intake Substrate Agent — transcript → AccountIntelligenceArtifact
 * ============================================================================
 *
 * Takes a raw discovery-call transcript + product context and produces a
 * fully-formed AccountIntelligenceArtifact (the Pass 0 substrate the
 * cockpit renders). Replaces the hand-written per-deal TypeScript
 * fixture pattern. See memory: intake_primitive_doctrine.md
 *
 * Inputs:
 *   - transcript text (already extracted by lib/intelligence/extract-transcript.ts)
 *   - product_context — what the rep is selling (anchors every recent_event
 *     relevance line; see memory: news_to_product_relevance.md)
 *   - optional account_name hint (lets the rep pin the entity if the
 *     transcript only references the company by partial info)
 *
 * Outputs: AccountIntelligenceArtifact (loose JSON; validated by caller
 * against types.ts shape).
 *
 * Voice rules baked into the system prompt:
 *   - Operator voice, prescriptive, dense (voice_compression_rule.md)
 *   - Every recent_events[].relevance written through product_context lens
 *   - Stakeholder watch_for[] is behavioral cues, not narrative
 *   - confidence ratings + source attribution honest
 *   - Pre-call brief lands ONE prescriptive objective, not "considerations"
 *
 * The agent uses Claude with the web_search tool so it can triangulate
 * the stakeholders' LinkedIn URLs + account public profile during the
 * single call (per memory: feedback_stakeholder_linkedin_urls.md). The
 * web search budget is bounded.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/billing/log-usage";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 16_000;
const MAX_WEB_SEARCHES = 8;
const MAX_ITERATIONS = MAX_WEB_SEARCHES + 2;

export interface IntakeSubstrateRequest {
  transcript: string;
  product_context: string;
  /** Optional rep-provided account name. Used as a triangulation anchor
   *  when the transcript spells the company name multiple ways. */
  account_name_hint?: string;
  /** Optional ISO timestamp for `metadata.generated_at`. Defaults to now. */
  generated_at?: string;
  /** "post_call" (default): a call happened, extract from the transcript.
   *  "pre_call": NO call yet — research the company + the named people the
   *  rep is about to meet, and produce the pre_call_brief. The transcript
   *  field is ignored in this mode. */
  mode?: "post_call" | "pre_call";
  /** pre_call only — names (and optional titles) of the people the rep
   *  expects to meet, to research. */
  stakeholder_hints?: string[];
}

export interface IntakeSubstrateResult {
  artifact: AccountIntelligenceArtifact;
  account_name: string;
  opportunity_name: string;
  /** Stakeholder names + emails (if surfaced) for DB upsert. */
  participants: Array<{ name: string; email?: string; role?: string }>;
  search_count: number;
  latency_ms: number;
  raw_tool_input: unknown;
}

const SYSTEM_PROMPT = `You are Mallin's intake-substrate agent. Given a discovery-call transcript + the rep's product context, you produce a fully-formed AccountIntelligenceArtifact that will be inserted directly into the production database and rendered to the rep in their cockpit.

# WHAT YOU'RE PRODUCING

A single AccountIntelligenceArtifact JSON object that conforms to the schema declared by the emit_substrate tool. The artifact has six sections:

1. account — Operator-grade company facts (name, industry, geography, headcount, revenue estimate, funding history, strategic priorities, leadership)
2. recent_events — Time-stamped events relevant to the deal. CRITICAL: every relevance field MUST be written through the lens of metadata.product_context. If a fact has no implication for the rep's deal, omit it.
3. stakeholders — Per-person enrichment for everyone material to the deal: title, background, role_in_deal (champion/economic_buyer/operator/procurement/technical_evaluator/user/unknown), visible_priorities, rapport_hooks, watch_for behavioral cues, linkedin_url
4. competitive_context — direct competitors (the buyer's market competitors), market_position, optional internal_competitors (vendors competing for THIS deal)
5. pre_call_brief — product_context, ONE primary_objective, opening_angle, 4-6 questions_to_qualify (with rationale), landmines, evidence_to_bring
6. metadata — generated_at, sources_used, confidence_overall, product_context (REQUIRED), notes, gaps

# VOICE RULES (HARD)

- Operator voice. Prescriptive. Dense. Every line must change what the rep does next.
- NO marketing copy. NO generic SaaS language. NO "the EB," "the close window," "capital-allocation filter."
- NO clichés ("smoking gun," "litmus test").
- Quote the transcript verbatim when something the prospect said is load-bearing — preserve their words, attributed by speaker.
- "Would a rep say this on the phone?" — every sentence passes that test.

# PRODUCT CONTEXT IS LOAD-BEARING

The metadata.product_context field anchors EVERY recent_events[].relevance line. If product_context is "Northwind Platform (B2B analytics software)," then every relevance must tie back to: "what does this fact mean for selling Northwind Platform?" If the fact has no implication, omit it. The artifact is NOT a news aggregator.

# CONFIDENCE RATINGS

- high: confirmed in ≥2 reputable sources OR transcribed directly from the call
- medium: confirmed in 1 source OR older
- low: inference / triangulation / single weak source

Be honest. Don't inflate confidence to look authoritative.

# STAKEHOLDER TRIANGULATION — START WITH THE BUYING COMMITTEE

FIRST, map the buying committee FROM THE SCOPE OF WHAT'S BEING SOLD — not just the product category. Given metadata.product_context, work out which roles at this account would actually evaluate and decide, and go find those people. Do NOT wait for them to be named, and do NOT stop at the department head.

The committee is driven by the SPECIFIC MODULES / CAPABILITIES in scope. Each module pulls in the function that OWNS that process — so the more precisely product_context names the modules, the more precisely you name the committee. For example:
- A reporting / analytics module → the team that owns the numbers (finance, FP&A, or the relevant line-of-business analysts)
- A workflow-automation module → the operations lead who owns that process
- An integrations / data-sync module → the IT / platform owner
- A security / SSO module → the identity / IT security owner
- A forecasting module in a sales tool → RevOps + sales leadership
Read the modules in play, map each to the function that owns it, and include those owners.

If product_context is vague on modules, still surface the likely owners AND note that scope decides the committee ("if reporting is in scope, finance joins; if integrations are in scope, IT joins") so the rep knows who to bring in as scope firms up.

Search LinkedIn / ZoomInfo / RocketReach for the people in those roles at THIS specific company. Name them (with a LinkedIn URL) where you can. Where you cannot find a name, list the ROLE as an open seat to confirm on the call, tied to the module it owns (e.g. "Operations lead — not yet identified; owns the reporting workflow, confirm on the call"). A brief that surfaces only the CEO/CFO from a press release has missed the most valuable thing a pre-call brief does — spend real search budget hunting the committee.

For every named stakeholder, RUN web_search to find their LinkedIn URL + verify title + name lineage. If the transcript references a stakeholder by partial info (first name only, ambiguous title), use web_search to triangulate identity from the company website + LinkedIn + RocketReach. Surface the implications, not just the name (e.g., "founder vs. hired exec," "lateral move from parent company," "missing CFO in the org chart").

If a stakeholder's LinkedIn shows a different title than the call, flag the gap with confidence_note — that's a useful trust calibration data point.

# RECENT EVENTS — PRIORITIZE

Always include:
- The discovery call itself (date, headline = quick summary of what was confirmed, relevance = single most important takeaway anchored to product_context)
- The most material objection the prospect named (with a relevance line that frames the resolution path)
- Material growth events / funding / acquisitions (only if they have implications for the deal)

Skip generic company milestones with no deal implications.

# PRE-CALL BRIEF — ONE PRESCRIPTIVE OBJECTIVE

The primary_objective is ONE sentence. Not a list. Not "considerations." A specific prescriptive objective for the next call ("walk out with [concrete artifact] in hand AND [follow-up commitment]"). Anything softer than that is the wrong shape.

questions_to_qualify is 4-6 questions, each with a rationale that names WHAT THE ANSWER REVEALS — not what the question is for.

landmines are concrete behaviors to avoid, with reasons. Not generic advice.

evidence_to_bring is specific artifacts (customer references, ROI calculators, written opinions) — not "demo decks" or "case studies" as a category.

# WEB SEARCH BUDGET

You have up to ${MAX_WEB_SEARCHES} web searches. Spend them, in priority order, on:
- The BUYING COMMITTEE for this product — search the account for the finance/sales/security/etc. roles that own THIS decision, by name where possible. TOP priority; don't stop at the one exec named in the press.
- Each named stakeholder's LinkedIn URL
- The account's public company page + recent press
- Industry-specific context (when the transcript references a domain-specific concept)

Use most of your budget — a pre-call brief with a thin committee is a weak brief. Don't waste searches on generic queries, but DO dig for the people who will be in the room.

# TERMINAL ACTION

When you have enough, call the emit_substrate tool ONCE with the complete artifact. Do not respond with text — always emit through the tool.`;

// ─────────────────────────────────────────────────────────────────────────
// Tool schema — large; mirrors AccountIntelligenceArtifact shape loosely.
// Top-level structure is enforced; nested SourcedFact / RecentEvent
// objects are described in field descriptions, validated post-hoc.
// ─────────────────────────────────────────────────────────────────────────

const sourcedFactSchema = {
  type: "object" as const,
  description:
    "A sourced fact: { value, source, source_url?, captured_at (ISO), confidence (high/medium/low), confidence_note? }",
  properties: {
    value: { type: "string" },
    source: {
      type: "string",
      enum: [
        "manual",
        "crunchbase",
        "apollo",
        "people_data_labs",
        "contify",
        "newsapi",
        "web_search",
        "company_website",
        "linkedin_url_provided",
        "customer_input",
        "calendar_invite",
      ],
    },
    source_url: { type: "string" },
    captured_at: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    confidence_note: { type: "string" },
  },
  required: ["value", "source", "captured_at", "confidence"],
};

const EMIT_SUBSTRATE_TOOL: Anthropic.Tool = {
  name: "emit_substrate",
  description:
    "Emit the complete AccountIntelligenceArtifact for the deal described in the transcript. Single terminal call.",
  input_schema: {
    type: "object" as const,
    properties: {
      account_name: {
        type: "string",
        description: "Canonical account name (e.g., 'Acme Corp, LLC')",
      },
      opportunity_name: {
        type: "string",
        description:
          "Suggested opportunity name (e.g., 'Acme Corp — Northwind Platform evaluation')",
      },
      participants: {
        type: "array",
        description:
          "Every named participant in the call (prospect + internal). The CLI uses this to upsert stakeholder rows.",
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            role: {
              type: "string",
              description:
                "Their role in the deal: champion | economic_buyer | operator | procurement | technical_evaluator | user | rep | bdr | unknown",
            },
          },
          required: ["name"],
        },
      },
      artifact: {
        type: "object" as const,
        description:
          "The full AccountIntelligenceArtifact JSON object conforming to lib/intelligence/types.ts. MUST include all six sections: account, recent_events, stakeholders, competitive_context, pre_call_brief, metadata.",
        properties: {
          account: {
            type: "object" as const,
            description:
              "AccountProfile: { name, domain?, one_line (SourcedFact), industry (SourcedFact), geography (SourcedFact[]), headcount_range? (SourcedFact), revenue_estimate? (SourcedFact), funding_history (array of {round, amount_usd, date, investors, valuation_usd?, source, source_url?, confidence}), strategic_priorities (SourcedFact[]), leadership (array of {name, title, status?, tenure_start?, tenure_end?, source, confidence}) }",
            properties: {
              name: { type: "string" },
              domain: { type: "string" },
              one_line: sourcedFactSchema,
              industry: sourcedFactSchema,
              geography: { type: "array", items: sourcedFactSchema },
              headcount_range: sourcedFactSchema,
              revenue_estimate: sourcedFactSchema,
              funding_history: { type: "array" },
              strategic_priorities: { type: "array", items: sourcedFactSchema },
              leadership: { type: "array" },
            },
            required: [
              "name",
              "one_line",
              "industry",
              "geography",
              "funding_history",
              "strategic_priorities",
              "leadership",
            ],
          },
          recent_events: {
            type: "array",
            description:
              "RecentEvent[]: each is { date (ISO), headline, relevance (anchored to product_context), source, source_url?, confidence, captured_at? }. Always include the discovery call itself + the material objection.",
            items: {
              type: "object" as const,
              properties: {
                date: { type: "string" },
                headline: { type: "string" },
                relevance: { type: "string" },
                source: { type: "string" },
                source_url: { type: "string" },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
                captured_at: { type: "string" },
              },
              required: [
                "date",
                "headline",
                "relevance",
                "source",
                "confidence",
              ],
            },
          },
          stakeholders: {
            type: "array",
            description:
              "StakeholderIntel[] for everyone material to the deal: { name, title? (SourcedFact), role_in_deal {value, confidence, rationale}, background (SourcedFact), visible_priorities (SourcedFact[]), rapport_hooks (SourcedFact[]), watch_for (string[] — behavioral cues), linkedin_url? }",
            items: {
              type: "object" as const,
              properties: {
                name: { type: "string" },
                title: sourcedFactSchema,
                role_in_deal: {
                  type: "object" as const,
                  properties: {
                    value: {
                      type: "string",
                      enum: [
                        "champion",
                        "economic_buyer",
                        "operator",
                        "procurement",
                        "technical_evaluator",
                        "user",
                        "unknown",
                      ],
                    },
                    confidence: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                    },
                    rationale: { type: "string" },
                  },
                  required: ["value", "confidence", "rationale"],
                },
                background: sourcedFactSchema,
                visible_priorities: { type: "array", items: sourcedFactSchema },
                rapport_hooks: { type: "array", items: sourcedFactSchema },
                watch_for: { type: "array", items: { type: "string" } },
                linkedin_url: { type: "string" },
              },
              required: [
                "name",
                "role_in_deal",
                "background",
                "visible_priorities",
                "rapport_hooks",
                "watch_for",
              ],
            },
          },
          competitive_context: {
            type: "object" as const,
            description:
              "CompetitiveContext: { direct_competitors (SourcedFact[]), market_position (SourcedFact), internal_competitors? (SourcedFact[]) }",
            properties: {
              direct_competitors: { type: "array", items: sourcedFactSchema },
              market_position: sourcedFactSchema,
              internal_competitors: {
                type: "array",
                items: sourcedFactSchema,
              },
            },
            required: ["direct_competitors", "market_position"],
          },
          pre_call_brief: {
            type: "object" as const,
            description:
              "PreCallBrief: { product_context, primary_objective (ONE prescriptive sentence), opening_angle, questions_to_qualify (4-6 items with rationale), landmines (string[]), evidence_to_bring? (string[]) }",
            properties: {
              product_context: { type: "string" },
              primary_objective: { type: "string" },
              opening_angle: { type: "string" },
              questions_to_qualify: {
                type: "array",
                minItems: 3,
                maxItems: 8,
                items: {
                  type: "object" as const,
                  properties: {
                    question: { type: "string" },
                    rationale: { type: "string" },
                  },
                  required: ["question", "rationale"],
                },
              },
              landmines: { type: "array", items: { type: "string" } },
              evidence_to_bring: { type: "array", items: { type: "string" } },
            },
            required: [
              "product_context",
              "primary_objective",
              "opening_angle",
              "questions_to_qualify",
              "landmines",
            ],
          },
          meeting: {
            type: "object" as const,
            description:
              "MeetingBlock — call context extracted from the transcript header + dialogue. { title (e.g. 'Northwind / Acme Corp — Intro Call'), date (ISO), meeting_type (discovery|demo|pricing|intro|technical_review|check_in|unknown), attendees (array), agenda (string[]) }. attendees: EVERY named person on the call, each { name, title (role/title as stated, e.g. 'VP of Finance'), company (their employer), side ('seller' = the rep's company / 'buyer' = the prospect's company) }. agenda: the ordered list of topics the call set out to cover, taken from what was actually stated (e.g. 'reporting', 'analytics', 'integrations', 'onboarding', 'security review') — extract stated agenda, do NOT invent advice.",
            properties: {
              title: { type: "string" },
              date: { type: "string" },
              meeting_type: { type: "string" },
              attendees: {
                type: "array",
                items: {
                  type: "object" as const,
                  properties: {
                    name: { type: "string" },
                    title: { type: "string" },
                    company: { type: "string" },
                    side: { type: "string", enum: ["seller", "buyer"] },
                  },
                  required: ["name", "company", "side"],
                },
              },
              agenda: { type: "array", items: { type: "string" } },
            },
            required: ["attendees", "agenda"],
          },
          metadata: {
            type: "object" as const,
            description:
              "metadata: { generated_at (ISO), sources_used (string[]), confidence_overall (high/medium/low), product_context (REQUIRED — anchor for all relevance), notes?, gaps? }",
            properties: {
              generated_at: { type: "string" },
              sources_used: { type: "array", items: { type: "string" } },
              confidence_overall: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              product_context: { type: "string" },
              notes: { type: "string" },
              gaps: { type: "array", items: { type: "string" } },
            },
            required: [
              "generated_at",
              "sources_used",
              "confidence_overall",
              "product_context",
            ],
          },
        },
        required: [
          "account",
          "recent_events",
          "stakeholders",
          "competitive_context",
          "pre_call_brief",
          "meeting",
          "metadata",
        ],
      },
    },
    required: ["account_name", "opportunity_name", "participants", "artifact"],
  },
};

function buildUserPrompt(req: IntakeSubstrateRequest, now: string): string {
  if (req.mode === "pre_call") {
    const people =
      req.stakeholder_hints && req.stakeholder_hints.length > 0
        ? req.stakeholder_hints.join(", ")
        : "(none named — research the company's likely buying committee for this product)";
    return `Produce the AccountIntelligenceArtifact to PREPARE a rep for an UPCOMING first call. NO call has happened yet — do NOT invent, quote, or summarize any conversation.

# Product context
${req.product_context}

# Account (company the rep is about to meet)
${req.account_name_hint ?? "(none provided)"}

# People the rep expects to meet (research each)
${people}

# Current timestamp (use for metadata.generated_at + captured_at)
${now}

Steps:
1. account_name = the company above. opportunity_name = a short, sensible deal label.
2. Run web_search, in priority order, to: (a) find the BUYING COMMITTEE for this product at this company — the finance/sales/security/etc. people who own THIS decision — by name (with LinkedIn) where possible, and list any role you can't put a name to as an open seat to confirm on the call; (b) triangulate each already-named person's LinkedIn / title / background; (c) surface 2-3 MATERIAL recent events (each relevance anchored to product_context). Budget: ${MAX_WEB_SEARCHES} searches — spend MOST of them on the committee.
3. participants + stakeholders = the buying committee you found (named people, with LinkedIn) PLUS any roles you identified but couldn't name (as open seats to confirm). Include any names the rep gave above. None are confirmed attendees — note that in confidence.
4. recent_events: EXTERNAL events only. Do NOT include a "discovery call" / "the call itself" event — no call has occurred.
5. pre_call_brief is the CENTERPIECE: ONE prescriptive primary_objective, opening_angle, 4-6 questions_to_qualify (with rationale), landmines, evidence_to_bring. This is what the rep walks in with.
6. Call emit_substrate ONCE.

Voice: every line must change what the rep does next. Do NOT fabricate quotes or call content — none exists yet. Where you're inferring (e.g., likely pain, likely committee), say so.`;
  }
  return `Produce the AccountIntelligenceArtifact for the deal described in this discovery call transcript.

# Product context
${req.product_context}

# Account name hint (if provided)
${req.account_name_hint ?? "(none — extract from transcript)"}

# Current timestamp (use for metadata.generated_at + recent_events captured_at)
${now}

# Discovery call transcript

\`\`\`
${req.transcript}
\`\`\`

Steps:
1. Identify the account name. If hint provided, prefer it; if not, extract from transcript.
2. Identify EVERY participant (prospect + internal rep team). Note role.
3. Build the meeting block: title (from the transcript header), date (ISO), meeting_type, and attendees — for EACH attendee capture { name, title/role, company, side }. side = "seller" for the rep's own company (the vendor running the call) and "buyer" for the prospect's company. Then extract the agenda: the ordered topics the call set out to cover, taken from what was actually stated on the call (not invented). These are customer-safe — everyone listed was on the call.
4. Run web_search to: triangulate each prospect stakeholder's LinkedIn URL, look up the account's public profile, surface 1-2 material recent events about the company. Budget: ${MAX_WEB_SEARCHES} searches total. Stop early if you have enough.
5. Build the full artifact: account, recent_events (include the call itself + at least one external event you found), stakeholders (with LinkedIn URLs), competitive_context, pre_call_brief (ONE prescriptive primary_objective), meeting (attendees + agenda).
6. Call emit_substrate ONCE with the complete artifact.

Voice: every line must change what the rep does next. Quote the transcript verbatim where the prospect said something load-bearing.`;
}

export async function runIntakeSubstrate(
  req: IntakeSubstrateRequest,
): Promise<IntakeSubstrateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  const client = new Anthropic({ apiKey });
  const now = req.generated_at ?? new Date().toISOString();

  const t0 = Date.now();
  let searchCount = 0;
  let emitted: {
    account_name: string;
    opportunity_name: string;
    participants: IntakeSubstrateResult["participants"];
    artifact: AccountIntelligenceArtifact;
    raw: unknown;
  } | null = null;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserPrompt(req, now) },
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Cache the static system prompt (+ the tools that render before it) so
      // repeat passes / iterations read the prefix at ~0.1x instead of full
      // price. Output-neutral: the model sees the identical prompt.
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: MAX_WEB_SEARCHES,
        } as unknown as Anthropic.Tool,
        EMIT_SUBSTRATE_TOOL,
      ],
      messages,
    });
    messages.push({ role: "assistant", content: response.content });
    logUsage(`intake.iter${iter}`, MODEL, response.usage);

    // Count searches on every response, including the turn that also emits.
    // With server-side web_search the model usually searches AND emits in the
    // same turn, so counting only on non-emit turns undercounts (to 0), which
    // made a fully-grounded brief look like it had never searched.
    searchCount += response.content.filter(
      (b) => b.type === "server_tool_use" && b.name === "web_search",
    ).length;

    const emitBlock = response.content.find(
      (b) => b.type === "tool_use" && b.name === "emit_substrate",
    );
    if (emitBlock && emitBlock.type === "tool_use") {
      const input = emitBlock.input as {
        account_name?: string;
        opportunity_name?: string;
        participants?: IntakeSubstrateResult["participants"];
        artifact?: AccountIntelligenceArtifact;
      };
      if (
        !input.account_name ||
        !input.opportunity_name ||
        !input.artifact ||
        !input.participants
      ) {
        throw new Error(
          "emit_substrate called with missing required fields: " +
            JSON.stringify({
              has_account_name: !!input.account_name,
              has_opportunity_name: !!input.opportunity_name,
              has_artifact: !!input.artifact,
              has_participants: !!input.participants,
            }),
        );
      }
      emitted = {
        account_name: input.account_name,
        opportunity_name: input.opportunity_name,
        participants: input.participants,
        artifact: input.artifact,
        raw: emitBlock.input,
      };
      break;
    }

    if (response.stop_reason !== "tool_use") {
      break;
    }
  }

  if (!emitted) {
    throw new Error(
      "Intake substrate agent did not emit_substrate within iteration cap",
    );
  }

  return {
    artifact: emitted.artifact,
    account_name: emitted.account_name,
    opportunity_name: emitted.opportunity_name,
    participants: emitted.participants,
    search_count: searchCount,
    latency_ms: Date.now() - t0,
    raw_tool_input: emitted.raw,
  };
}
