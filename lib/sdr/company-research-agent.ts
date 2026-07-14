/**
 * ============================================================================
 *  Company Research Agent — auto-build an SDR knowledge base
 * ============================================================================
 *
 * Given a company name (+ optional website), web-researches what they sell and
 * produces a draft SDR profile: a fuller offering, a products/services catalog,
 * buyer personas (role → duties / pains / decision drivers), and the factual
 * knowledge the agent may state. The customer REVIEWS + edits before it goes
 * live — so this is acquisition (auto-populate), not auto-trust.
 *
 * Mirrors lib/agents/intake-substrate-agent.ts: a bounded web_search loop + a
 * terminal forced-emit tool. Run once at setup (cache + refresh), never in a
 * live chat — see stable_cognition_layer.md.
 *
 * Discipline (matches the SDR's hard knowledge limit): only emit verifiable
 * facts. No invented pricing, certifications, or capabilities.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SdrPersona, SdrProduct } from "./types";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 4_000;
const MAX_WEB_SEARCHES = 6;
const MAX_ITERATIONS = MAX_WEB_SEARCHES + 2;

export interface CompanyProfileDraft {
  offering: string;
  products: SdrProduct[];
  personas: SdrPersona[];
  knowledge: string[];
}

export interface CompanyResearchResult {
  draft: CompanyProfileDraft;
  search_count: number;
  latency_ms: number;
}

const SYSTEM_PROMPT = `You research a company so its AI SDR knows the FULL breadth of what they sell and who they sell to — not just one product. Given a company name and (ideally) a website, use web_search to learn what they actually do, then produce a draft profile.

# IDENTITY — RESEARCH THE RIGHT COMPANY
If a website/domain is provided, the company AT that domain is THE company. Research that exact business and anchor EVERYTHING to it — IGNORE other companies that merely share the name (e.g. given mallin.io, research the software company at mallin.io, NOT a same-named metal recycler). Start by reading that site. If no website is given, the name may be ambiguous — search carefully, prefer the business matching any context given, and if you genuinely can't tell which company it is, say so in the offering rather than confidently profiling the wrong one.

Produce:
- offering: 1-2 sentences capturing what the company sells overall.
- products: every distinct product or service line you can verify — each with a name, a short description, and "for_who" (the buyer/use-case it fits). Be reasonably complete; a company often sells several things.
- personas: the buyer roles they sell to. For each: role (title), duties (what they do day-to-day), pains (the problems that role typically faces that this company's offering speaks to), cares_about (their decision drivers). Infer sensible personas from the products + industry.
- knowledge: factual statements the SDR may state to a prospect. ONLY verifiable facts (what they do, integrations, segments served). NO invented pricing, certifications, or capabilities — if you can't verify it, leave it out.

# RULES
- Accuracy over completeness. If you can't confirm something, omit it. The customer reviews everything before it goes live.
- Spend web searches on: the company site / what they sell, their product pages, their customers/segments. Don't waste searches.
- When you have enough, call emit_company_profile ONCE. Never reply in plain text.`;

const EMIT_TOOL: Anthropic.Tool = {
  name: "emit_company_profile",
  description: "Emit the researched company profile draft. Call once.",
  input_schema: {
    type: "object",
    properties: {
      offering: { type: "string" },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            for_who: { type: "string" },
          },
          required: ["name", "description"],
        },
      },
      personas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string" },
            duties: { type: "string" },
            pains: { type: "array", items: { type: "string" } },
            cares_about: { type: "array", items: { type: "string" } },
          },
          required: ["role"],
        },
      },
      knowledge: { type: "array", items: { type: "string" } },
    },
    required: ["offering", "products", "personas", "knowledge"],
  },
};

export async function researchCompany(
  input: { company_name: string; website?: string },
  options: { client?: Anthropic } = {},
): Promise<CompanyResearchResult> {
  const client =
    options.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Research this company for its AI SDR.

company_name: ${input.company_name}
${input.website ? `website (AUTHORITATIVE — research the company at THIS domain, ignore same-named others): ${input.website}` : "(no website given — search the name carefully; beware same-named companies)"}

Use web_search, then call emit_company_profile once with offering, products, personas, knowledge.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const t0 = Date.now();
  let searchCount = 0;
  let draft: CompanyProfileDraft | null = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES } as unknown as Anthropic.Tool,
        EMIT_TOOL,
      ],
      messages,
    });
    messages.push({ role: "assistant", content: response.content });

    // Count searches on every turn, including the one that also emits (server
    // web_search usually searches AND emits together — counting only on
    // non-emit turns undercounts to 0).
    searchCount += response.content.filter(
      (b) => b.type === "server_tool_use" && b.name === "web_search",
    ).length;

    const emit = response.content.find(
      (b) => b.type === "tool_use" && b.name === EMIT_TOOL.name,
    );
    if (emit && emit.type === "tool_use") {
      const i = emit.input as Partial<CompanyProfileDraft>;
      draft = {
        offering: i.offering ?? "",
        products: i.products ?? [],
        personas: i.personas ?? [],
        knowledge: i.knowledge ?? [],
      };
      break;
    }

    if (response.stop_reason !== "tool_use") break;
  }

  if (!draft) throw new Error("Company research did not emit a profile within the iteration cap");
  return { draft, search_count: searchCount, latency_ms: Date.now() - t0 };
}
