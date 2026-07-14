/**
 * ============================================================================
 *  Sourcing agent — ICP in, qualified prospects out (agnostic engine)
 * ============================================================================
 *
 * The genuinely new outbound capability (the inbound SDR never sources — it
 * waits for visitors). Company-agnostic: it consumes an OutboundConfig and
 * NOTHING hard-coded. It reasons from two governing dimensions —
 *   INDUSTRY   (where to look), and
 *   PERSONA    (who to reach, matched by duties/pains, not just a title) —
 * finds real companies with a live trigger, names a real decision-maker with a
 * LinkedIn URL, tags which industry + persona each prospect matched, and drafts
 * an operator-voice first touch tied to the trigger.
 *
 * Mirrors lib/sdr/company-research-agent.ts: a bounded web_search loop + a
 * terminal forced-emit tool. Accuracy over completeness — real, verifiable
 * companies and people only; uncertainty is marked, not hidden.
 *
 * Discipline baked in from memory:
 *   - feedback_stakeholder_linkedin_urls: every contact MUST carry a LinkedIn
 *     URL (workflow step, not a nice-to-have).
 *   - news_to_product_relevance / voice_compression_rule: why_fit + hook are
 *     operator voice, tied to the config's offering, every line earns its place.
 *   - No paid verification service (user constraint): emails are pattern
 *     guesses at best and flagged; LinkedIn is the safer first touch.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import type { OutboundConfig } from "./config";
import type { SdrPersona } from "../types";
import { seniorityGuidance } from "./seniority";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 8_000;
const MAX_WEB_SEARCHES = 12;
const MAX_ITERATIONS = MAX_WEB_SEARCHES + 3;

/** How confident we are the email is real. We never verify — so never "verified". */
export type EmailConfidence = "pattern_guess" | "unknown";

export interface ProspectContact {
  name: string;
  role: string;
  /** MANDATORY per feedback_stakeholder_linkedin_urls — the safe first touch. */
  linkedin_url?: string;
  /** first.last@domain guess ONLY. Unverified — never blast. */
  email_guess?: string;
  email_confidence?: EmailConfidence;
}

export interface Prospect {
  company: string;
  website?: string;
  /** Which configured industry this prospect matched. */
  matched_industry?: string;
  /** Which configured persona role the contact matched (by duties/pains). */
  matched_persona?: string;
  /** Operator voice, tied to the offering — why THIS company, for the customer. */
  why_fit: string;
  /** The live signal + why it makes now the moment. */
  trigger_event: string;
  contact: ProspectContact;
  /** One-line personalized angle for the opener. */
  outreach_hook: string;
  /** A short, send-ready first touch (LinkedIn/email), tied to the trigger. */
  first_touch: string;
  confidence: "strong" | "plausible" | "weak";
}

export interface SourcingResult {
  prospects: Prospect[];
  search_count: number;
  latency_ms: number;
}

/** Optionally narrow a run to one industry and/or one persona. */
export interface SourcingFocus {
  industry?: string;
  persona?: string;
}

function personaBlock(p: SdrPersona): string {
  const bits = [
    `- ${p.role}`,
    p.duties ? `  duties: ${p.duties}` : "",
    p.pains?.length ? `  pains: ${p.pains.join("; ")}` : "",
    p.cares_about?.length ? `  cares about: ${p.cares_about.join("; ")}` : "",
  ];
  return bits.filter(Boolean).join("\n");
}

function systemPrompt(config: OutboundConfig, focus?: SourcingFocus): string {
  const industries = focus?.industry
    ? config.industries.filter((i) => i.name.toLowerCase() === focus.industry!.toLowerCase())
    : config.industries;
  const personas = focus?.persona
    ? config.personas.filter((p) => p.role.toLowerCase().includes(focus.persona!.toLowerCase()))
    : config.personas;

  return `You are a senior outbound researcher building a target list for ${config.company_name}. You find REAL companies that fit a precise, configured ICP and have a live reason to be contacted now, name a REAL decision-maker matching a target persona, and draft a first touch. You use web_search to ground everything — you never invent companies, people, or facts.

# WHAT ${config.company_name.toUpperCase()} SELLS (anchor every judgment to this)
${config.offering}

# INDUSTRIES TO SOURCE (the WHERE)
${industries.map((i) => `- ${i.name}${i.fit_notes ? ` — ${i.fit_notes}` : ""}`).join("\n")}

# TARGET PERSONAS (the WHO — match by duties/pains, NOT just a job title)
${personas.map(personaBlock).join("\n")}

${seniorityGuidance(config.target_seniority)}

# COMPANY FILTERS (the right kind of company)
${(config.company_filters ?? []).map((f) => `- ${f}`).join("\n") || "- (none specified)"}

# TRIGGER EVENTS (a fitting company WITH a live trigger is the whole point — prioritize these)
${config.trigger_events.map((t) => `- ${t}`).join("\n")}

# DISQUALIFIERS (exclude on sight)
${config.disqualifiers.map((d) => `- ${d}`).join("\n")}

# METHOD
1. Work industry by industry. Within an industry, search for companies matching the filters that ALSO show a trigger event (funding, exec hires, job reqs, leadership posts). The trigger is what makes them worth reaching now.
2. For each candidate, confirm it's real and not a disqualifier; find its website.
3. Find ONE real decision-maker whose ACTUAL job maps to one of the target personas — match on their duties/pains, not just a matching title. Get their LinkedIn URL (MANDATORY — search "[name] [company] linkedin"; only use a real linkedin.com/in profile, not a Crunchbase or company page). If you cannot find a specific named person with a real LinkedIn, lower confidence or skip the company.
4. Optionally infer a pattern-guess email (first.last@domain) ONLY if you can see the company's email pattern — mark it "pattern_guess". Else leave blank, email_confidence "unknown". We do NOT verify emails.
5. Tag each prospect: matched_industry (which configured industry) and matched_persona (which configured persona role the contact maps to).

# WRITING (operator voice — every line earns its place)
- why_fit: 1-2 sentences on why THIS company fits ${config.company_name} specifically, through the lens of what they sell AND the matched persona's pains. Concrete, not generic firmographics.
- trigger_event: the specific signal + a date/timeframe if you have it.
- outreach_hook: one line — the specific angle that makes the opener land for that persona.
- first_touch: 2-4 sentences, ready to send on LinkedIn or email, addressed to the persona and referencing the real trigger. No fluff, no "I hope this finds you well," no feature dump. Sound like a sharp operator who did their homework.

# RULES
- Accuracy over completeness. A short list of real, well-triggered, correctly-attributed prospects beats a long list of guesses.
- Confidence: "strong" = clear fit + confirmed live trigger + named persona-match with a real LinkedIn; "plausible" = fits but trigger or person is softer; "weak" = fits the profile but no confirmed trigger or specific person.
- When you have enough, call emit_prospects ONCE. Never reply in plain text.`;
}

const EMIT_TOOL: Anthropic.Tool = {
  name: "emit_prospects",
  description: "Emit the researched prospect list. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      prospects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" },
            website: { type: "string" },
            matched_industry: { type: "string" },
            matched_persona: { type: "string" },
            why_fit: { type: "string" },
            trigger_event: { type: "string" },
            contact: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                linkedin_url: { type: "string" },
                email_guess: { type: "string" },
                email_confidence: { type: "string", enum: ["pattern_guess", "unknown"] },
              },
              required: ["name", "role"],
            },
            outreach_hook: { type: "string" },
            first_touch: { type: "string" },
            confidence: { type: "string", enum: ["strong", "plausible", "weak"] },
          },
          required: [
            "company",
            "why_fit",
            "trigger_event",
            "contact",
            "outreach_hook",
            "first_touch",
            "confidence",
          ],
        },
      },
    },
    required: ["prospects"],
  },
};

export async function sourceProspects(
  config: OutboundConfig,
  opts: { count: number; focus?: SourcingFocus; exclude?: string[] },
  options: { client?: Anthropic } = {},
): Promise<SourcingResult> {
  const client =
    options.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const excludeLine =
    opts.exclude && opts.exclude.length
      ? `\n\nDo NOT include any of these already-known companies:\n${opts.exclude.map((c) => `- ${c}`).join("\n")}`
      : "";
  const focusLine = opts.focus?.industry || opts.focus?.persona
    ? `\n\nFocus this run${opts.focus.industry ? ` on the ${opts.focus.industry} industry` : ""}${opts.focus.persona ? ` and the ${opts.focus.persona} persona` : ""}.`
    : "";

  const userPrompt = `Find ${opts.count} prospects that fit the configured ICP and have a live trigger event. Prioritize companies where a real trigger is visible in the last ~90 days. For each, name one real decision-maker whose job maps to a target persona, WITH a real LinkedIn URL, tag the matched industry + persona, and draft a first touch tied to the trigger.${focusLine}${excludeLine}

Use web_search to ground everything, then call emit_prospects once.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const t0 = Date.now();
  let searchCount = 0;
  let prospects: Prospect[] | null = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt(config, opts.focus),
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES } as unknown as Anthropic.Tool,
        EMIT_TOOL,
      ],
      messages,
    });
    messages.push({ role: "assistant", content: response.content });

    // Count searches on every response, including the one that emits — with
    // server-side web_search the model often searches and emits in one turn.
    searchCount += response.content.filter(
      (b) => b.type === "server_tool_use" && b.name === "web_search",
    ).length;

    const emit = response.content.find(
      (b) => b.type === "tool_use" && b.name === EMIT_TOOL.name,
    );
    if (emit && emit.type === "tool_use") {
      const parsed = emit.input as { prospects?: Prospect[] };
      prospects = parsed.prospects ?? [];
      break;
    }

    if (response.stop_reason !== "tool_use") break;
  }

  if (!prospects) {
    throw new Error("Sourcing agent did not emit a prospect list within the iteration cap");
  }
  return { prospects, search_count: searchCount, latency_ms: Date.now() - t0 };
}
