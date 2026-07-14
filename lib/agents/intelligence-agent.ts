/**
 * ============================================================================
 *  Intelligence Agent — external web sweep
 * ============================================================================
 *
 *  The "Layer 1" gap Brendan identified: substrate alone (calls, emails,
 *  touches) cannot establish the correct problem frame for a deal. A
 *  9-month-old project-finance startup looks like any other deal in raw
 *  substrate, but its actual buying behavior is shaped by funding stage,
 *  capital structure, founder vs. hired-CFO procurement, and competing
 *  initiatives that the rep can only see by looking outside.
 *
 *  This agent runs at brief-generation time (currently on-demand via
 *  /api/intelligence). Given an account name + key stakeholders, it:
 *
 *    1. Triggers Claude with the WebSearch tool to run a few targeted
 *       searches (account team page, recent news, stakeholder LinkedIn).
 *    2. Distills findings into 1-3 structured items via the
 *       emit_intelligence tool.
 *    3. Returns findings to the caller, which logs them as touches with
 *       source_system="intelligence_web_sweep" so Pass 4 reads them as
 *       substrate on the next regen.
 *
 *  Proof case (illustrative): substrate said "Marcus is the signer
 *  (last name not yet provided)." A web sweep triangulated him to a
 *  Co-Founder + Global BD with no CFO above him. That single finding
 *  flips the whole brief from "navigate procurement process" to "give
 *  a co-founder a story he'd tell himself."
 *
 *  Cost ceiling: ~$0.05–0.10 per sweep (5 searches + tool call).
 *  Cadence: on-demand for now; later, cached per account for 24-48h.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-5";
const MAX_OUTPUT_TOKENS = 4096;
const MAX_WEB_SEARCHES = 5;

export type FindingType =
  | "funding_stage"
  | "recent_signal"
  | "stakeholder_role"
  | "capital_structure"
  | "industry_signal"
  | "missing_role";

export type FindingConfidence = "high" | "medium" | "low";

/**
 * Source enum for public_signals (matches DB CHECK constraint +
 * ExternalSource type in execution-agent-input.ts).
 */
export type ExternalSource =
  | "linkedin"
  | "sec_edgar"
  | "crunchbase"
  | "news"
  | "company_blog"
  | "press_release"
  | "podcast"
  | "conference"
  | "other";

export interface IntelligenceFinding {
  finding_type: FindingType;
  summary: string;
  implication: string;
  source_url: string;
  source: ExternalSource;
  confidence: FindingConfidence;
}

export interface IntelligenceAgentRequest {
  account_name: string;
  account_industry?: string;
  account_headquarters?: string;
  key_stakeholders: Array<{
    name: string;
    title?: string;
    committee_role?: string;
  }>;
}

export interface IntelligenceAgentResult {
  /**
   * One- to two-sentence macro frame for the account: what they're
   * actually doing right now that shapes their buying behavior. Lands
   * on accounts.strategic_priority and substrate.account.strategic_priority.
   */
  strategic_priority: string;
  findings: IntelligenceFinding[];
  search_count: number;
  latency_ms: number;
}

const SYSTEM_PROMPT = `You are an external intelligence agent for a B2B sales team. Given an account name + key stakeholders, run targeted web searches to surface decision-relevant context that the rep cannot see in their CRM substrate.

# WHAT MATTERS

You are NOT producing a generic company profile. You are surfacing 1-3 findings that would CHANGE how the rep approaches their next call. Useful findings:

- **Stage / capital structure** — Is this a project-finance shop, a SaaS company, a public co? Founders or hired execs? No CFO at all? These shape the buying motion.
- **Recent signals** — A funding round in the last 90 days, a partnership LOI, a layoff, a new product launch — anything that just changed their priority stack.
- **Missing roles** — "No CFO listed on team page" is itself a load-bearing signal at an early-stage company.
- **Stakeholder triangulation** — When substrate has partial info on a load-bearing stakeholder (first name only, missing title), triangulate identity from public sources. Surface name + title + lineage (e.g. "ex-BigCo, same as the CEO").
- **Decision logic implications** — A co-founder with a fundraising background filters every spend differently than a hired CFO. Name the implication.

NOT useful:
- Generic company description ("X is a leading provider of...")
- Industry trends with no deal-specific implication
- Information already in the substrate

# THE DISCIPLINE

Run 1-5 searches. Stop when you have decision-relevant findings, not when you've exhausted search budget. Each finding must have:
- Explicit source_url (no hallucination)
- A specific implication for the rep's next move
- Honest confidence (high if directly cited; low if inferred)

When you're done researching, call the emit_intelligence tool with your findings. Do not respond with text — always invoke the tool.`;

const EMIT_TOOL = {
  name: "emit_intelligence",
  description:
    "Emit a strategic_priority (1-2 sentence macro frame) + 1-3 decision-relevant intelligence findings about the account. Each finding must cite a real source URL.",
  input_schema: {
    type: "object" as const,
    properties: {
      strategic_priority: {
        type: "string",
        description:
          "1-2 sentence macro frame: what this account is actually doing right now that shapes their buying behavior. Specific, names key initiatives or constraints. Example: 'Meridian is a $36B PE real estate firm; a new CTO (June 2025) is building out the tech stack while juggling AI initiatives that compete for budget priority.'",
      },
      findings: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            finding_type: {
              type: "string",
              enum: [
                "funding_stage",
                "recent_signal",
                "stakeholder_role",
                "capital_structure",
                "industry_signal",
                "missing_role",
              ],
            },
            summary: {
              type: "string",
              description:
                "One-sentence factual statement. Plain English, names where applicable.",
            },
            implication: {
              type: "string",
              description:
                "One sentence on what this means for the rep's next move. Specific, not generic.",
            },
            source_url: {
              type: "string",
              description:
                "Real URL where this was found. No hallucination.",
            },
            source: {
              type: "string",
              enum: [
                "linkedin",
                "sec_edgar",
                "crunchbase",
                "news",
                "company_blog",
                "press_release",
                "podcast",
                "conference",
                "other",
              ],
              description:
                "Source category — pick the closest match to the source_url. linkedin = profile/post on linkedin.com; sec_edgar = SEC filing; crunchbase = crunchbase.com; news = news article on a media site; company_blog = the company's own website/blog; press_release = wire service (PRNewswire, BusinessWire); podcast = audio interview; conference = conference talk/recording; other = anything else.",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "high = directly cited in source; medium = inferred from multiple sources; low = single source or weak inference.",
            },
          },
          required: [
            "finding_type",
            "summary",
            "implication",
            "source_url",
            "source",
            "confidence",
          ],
        },
      },
    },
    required: ["strategic_priority", "findings"],
  },
};

function buildUserPrompt(req: IntelligenceAgentRequest): string {
  const stakeholderLines = req.key_stakeholders
    .map(
      (s) =>
        `  - ${s.name}${s.title ? ` (${s.title})` : ""}${s.committee_role ? ` [${s.committee_role}]` : ""}`,
    )
    .join("\n");

  return `Run intelligence on this account.

Account: ${req.account_name}
${req.account_industry ? `Industry (per substrate): ${req.account_industry}` : ""}
${req.account_headquarters ? `HQ (per substrate): ${req.account_headquarters}` : ""}

Key stakeholders the rep has mapped:
${stakeholderLines}

Run targeted web searches (account team page, recent news, stakeholder LinkedIn / RocketReach). Surface 1-3 decision-relevant findings via the emit_intelligence tool. Stop when you have substantive findings — don't fill space.`;
}

export async function runIntelligenceSweep(
  req: IntelligenceAgentRequest,
): Promise<IntelligenceAgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }
  const client = new Anthropic({ apiKey });

  const t0 = Date.now();
  let searchCount = 0;
  let strategicPriority: string | null = null;
  let findings: IntelligenceFinding[] | null = null;

  // The model loops: web_search calls return results that come back as
  // user/tool messages, then the model can call web_search again or
  // emit_intelligence. We track the conversation manually.
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserPrompt(req) },
  ];

  // Cap iterations to prevent runaway loops (we have max_uses on the
  // server-side web_search, but emit_intelligence is the terminal call
  // and we should bound the outer loop too).
  const MAX_ITERATIONS = MAX_WEB_SEARCHES + 2;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: MAX_WEB_SEARCHES,
        } as unknown as Anthropic.Tool,
        EMIT_TOOL as unknown as Anthropic.Tool,
      ],
      messages,
    });

    // Append the assistant turn to the conversation.
    messages.push({ role: "assistant", content: response.content });

    // Count web searches on every turn — including the one that also emits.
    // Server-side web_search usually searches AND emits in the same turn, so
    // counting only on non-emit turns undercounts (to 0).
    searchCount += response.content.filter(
      (b) => b.type === "server_tool_use" && b.name === "web_search",
    ).length;

    // Walk content blocks; if emit_intelligence was called, capture it
    // and exit. If web_search was called, the API returns tool_result
    // blocks server-side (they appear in subsequent assistant turns
    // automatically when web_search is server-side).
    const emitBlock = response.content.find(
      (b) => b.type === "tool_use" && b.name === "emit_intelligence",
    );
    if (emitBlock && emitBlock.type === "tool_use") {
      const input = emitBlock.input as {
        strategic_priority?: string;
        findings?: IntelligenceFinding[];
      };
      if (input?.findings && Array.isArray(input.findings)) {
        findings = input.findings;
      }
      if (typeof input?.strategic_priority === "string") {
        strategicPriority = input.strategic_priority;
      }
      break;
    }

    // If the model stopped without calling emit_intelligence, break.
    if (response.stop_reason !== "tool_use") {
      break;
    }
  }

  if (!findings) {
    throw new Error(
      "Intelligence agent did not emit findings within iteration cap",
    );
  }

  return {
    strategic_priority: strategicPriority ?? "",
    findings,
    search_count: searchCount,
    latency_ms: Date.now() - t0,
  };
}
