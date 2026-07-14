/**
 * ============================================================================
 *  Lookalike agent — one seed company in, a judgment-led ICP out
 * ============================================================================
 *
 * The "give me more like THIS one" capability. The customer names a single
 * company they'd want more of (their best-won deal, an ideal-fit account); the
 * agent profiles it and derives a precise OutboundConfig — the industries,
 * personas, firmographic filters, and trigger events that make a company
 * "like this seed" AND a real fit for what the customer sells.
 *
 * JUDGMENT-LED, not superficial: the lookalike axes are chosen through the lens
 * of the customer's `offering` — what makes a company a good BUYER of that,
 * shaped like the seed — not just "same industry, same size." That reuse of the
 * offering as the anchor is the wedge (news_to_product_relevance): the engine
 * finds fits, not firmographic twins.
 *
 * The derived config is the SAME OutboundConfig the sourcing engine already
 * consumes — so this bolts on cleanly: deriveLookalikeConfig(seed) →
 * sourceProspects(config). Mirrors sourcing-agent.ts: a bounded web_search loop
 * + a terminal forced-emit tool. Nothing is invented — the seed is researched,
 * and the derived ICP is grounded in what's actually observable about it.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import type { OutboundConfig, IndustryTarget } from "./config";
import type { SdrPersona } from "../types";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 4_000;
const MAX_WEB_SEARCHES = 6;
const MAX_ITERATIONS = MAX_WEB_SEARCHES + 3;

export interface LookalikeInput {
  /** The one company the customer wants MORE of — the seed to clone the shape of. */
  seedCompany: string;
  /** Optional website to disambiguate same-named companies. */
  seedWebsite?: string;
  /** What the CUSTOMER sells — anchors what "a fit" means; carried into the config unchanged. */
  offering: string;
  /** The customer the agent represents (their name goes on the config). */
  companyName: string;
}

export interface LookalikeResult {
  /** The derived ICP — ready to hand straight to sourceProspects(). */
  config: OutboundConfig;
  /** The agent's grounded read of the seed — shown in review so the derivation is auditable. */
  seedProfile: string;
  /** Why THESE axes make a lookalike (not just firmographic twins) — review-facing. */
  rationale: string;
  searchCount: number;
  latencyMs: number;
}

function systemPrompt(input: LookalikeInput): string {
  return `You are a senior GTM strategist deriving a precise, judgment-led ICP for ${input.companyName}. They will use it to find companies LIKE one seed company they already know is a great fit. You use web_search to ground everything about the seed — you never invent facts about it.

# WHAT ${input.companyName.toUpperCase()} SELLS (this is what "a fit" means — anchor every axis to it)
${input.offering}

# THE SEED COMPANY (the one they want more of)
${input.seedCompany}${input.seedWebsite ? ` (${input.seedWebsite})` : ""}

# YOUR JOB
1. Research the seed company: its industry/sub-vertical, size/stage, business model, sales motion (rep-led vs PLG, deal complexity, buyer committee), the tooling it likely runs, and — critically — WHY it is a good buyer of what ${input.companyName} sells. Ground this in real, searchable facts; if something isn't findable, say so rather than guess.
2. Derive the ICP axes that make a company "like this seed AND a fit for the offering" — NOT superficial firmographic twins. Ask: what is it about the seed that makes it a buyer of ${input.companyName}'s offering, and which OTHER companies share that? Generalize from the seed to a repeatable profile.
   - industries: the industries/sub-verticals where lookalikes live.
   - personas: WHO to reach at a lookalike — match by DUTIES and PAINS, not just a title (role, duties, pains[], cares_about[]).
   - company_filters: the firmographic gate (size, motion, ACV, geo, tooling) that a lookalike must pass.
   - trigger_events: the live signals that mean a lookalike is worth reaching NOW (funding, exec hires, open reqs, migrations, public pain).
   - disqualifiers: shapes that look similar to the seed on the surface but are NOT real fits — exclude on sight.
3. Write seedProfile (a tight, grounded paragraph on what the seed actually is) and rationale (2-3 sentences: what specifically about the seed you're generalizing, and why those axes find fits rather than twins).

# DISCIPLINE
- Grounded, not generic. Every axis should trace to something real about the seed + the offering, in operator language. No filler firmographics.
- Prefer sharper, narrower axes over broad ones — a tight ICP sources better than a loose one.
- When done, call emit_icp ONCE. Never reply in plain text.`;
}

const EMIT_TOOL: Anthropic.Tool = {
  name: "emit_icp",
  description: "Emit the derived lookalike ICP. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      seedProfile: { type: "string", description: "Grounded paragraph on what the seed company actually is." },
      rationale: { type: "string", description: "What you generalized from the seed and why these axes find fits, not twins." },
      industries: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, fit_notes: { type: "string" } },
          required: ["name"],
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
      company_filters: { type: "array", items: { type: "string" } },
      trigger_events: { type: "array", items: { type: "string" } },
      disqualifiers: { type: "array", items: { type: "string" } },
    },
    required: ["seedProfile", "rationale", "industries", "personas", "trigger_events", "disqualifiers"],
  },
};

interface EmitPayload {
  seedProfile: string;
  rationale: string;
  industries: IndustryTarget[];
  personas: SdrPersona[];
  company_filters?: string[];
  trigger_events: string[];
  disqualifiers: string[];
}

/**
 * Research a seed company and derive a judgment-led OutboundConfig for finding
 * lookalikes. The result plugs straight into sourceProspects(). Throws if the
 * agent never emits within the iteration cap.
 */
export async function deriveLookalikeConfig(
  input: LookalikeInput,
  options: { client?: Anthropic } = {},
): Promise<LookalikeResult> {
  const client =
    options.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `Profile ${input.seedCompany}${input.seedWebsite ? ` (${input.seedWebsite})` : ""} and derive the ICP for finding companies like it that would be a fit for ${input.companyName}. Use web_search to ground the seed, then call emit_icp once.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const t0 = Date.now();
  let searchCount = 0;
  let payload: EmitPayload | null = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt(input),
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES } as unknown as Anthropic.Tool,
        EMIT_TOOL,
      ],
      messages,
    });
    messages.push({ role: "assistant", content: response.content });

    searchCount += response.content.filter(
      (b) => b.type === "server_tool_use" && b.name === "web_search",
    ).length;

    const emit = response.content.find(
      (b) => b.type === "tool_use" && b.name === EMIT_TOOL.name,
    );
    if (emit && emit.type === "tool_use") {
      payload = emit.input as EmitPayload;
      break;
    }
    if (response.stop_reason !== "tool_use") break;
  }

  if (!payload) {
    throw new Error("Lookalike agent did not emit an ICP within the iteration cap");
  }

  // Assemble the same OutboundConfig the sourcing engine consumes: the derived
  // targeting axes, with the customer's own identity + offering carried through
  // unchanged (the offering is what keeps sourcing a fit-search, not a twin-search).
  const config: OutboundConfig = {
    company_name: input.companyName,
    website: undefined,
    offering: input.offering,
    industries: payload.industries ?? [],
    personas: payload.personas ?? [],
    company_filters: payload.company_filters ?? [],
    trigger_events: payload.trigger_events ?? [],
    disqualifiers: payload.disqualifiers ?? [],
  };

  return {
    config,
    seedProfile: payload.seedProfile,
    rationale: payload.rationale,
    searchCount,
    latencyMs: Date.now() - t0,
  };
}
