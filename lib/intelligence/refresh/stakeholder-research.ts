/**
 * Stakeholder web research for Account Intelligence artifacts.
 *
 * Uses Anthropic's web_search tool to build a high-level "who is this person"
 * read — the same triangulation a rep would do by hand before a call (team
 * page → LinkedIn → press), surfaced as a held profile on the deal.
 *
 * Design notes (mirrors news-refresh):
 *   - Operator voice, not analyst register. What the read MEANS for the call.
 *   - Triangulate identity (founder vs. hired exec, background lineage,
 *     missing roles in the org) per stakeholder_triangulation doctrine.
 *   - Never throws — research is enrichment, not a gate. On any failure
 *     returns null and the card shows the held data it already has.
 *   - Held per-deal once fetched; only re-run on explicit refresh.
 *
 * Cost: ~3-4 web searches + ~2k tokens. Runs once per person on first open.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AccountIntelligenceArtifact,
  StakeholderIntel,
  StakeholderWebResearch,
} from "../types";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_SEARCHES = 4;

/** What the model returns, plus a possibly-discovered LinkedIn URL. */
export interface StakeholderResearchResult {
  web_research: StakeholderWebResearch;
  /** LinkedIn URL if the search surfaced one (the caller backfills it if the
   *  stakeholder didn't already have one). */
  linkedin_url?: string;
}

function buildSystemPrompt(productContext: string): string {
  return `You are Mallin's pre-call research agent. A rep is about to get on a call and needs a fast, accurate read on ONE specific person at the account.

Triangulate the person's identity from public sources (company team/leadership page, LinkedIn, press, interviews, RocketReach-style directories). Resolve who they ACTUALLY are — founder vs. hired exec, where they came from, what's notable in their lineage, and anything structurally telling (e.g. a missing role in the org that explains their scope).

PRODUCT CONTEXT (only to color what matters for the call — do NOT turn this into a pitch):
${productContext}

Write in operator voice — compressed, concrete, what it MEANS for the rep. No analyst register, no filler.

OUTPUT FORMAT (strict JSON, no prose around it):
{
  "summary": "<2-3 sentence operator read: who they are, where they came from, why it matters for this call>",
  "highlights": ["<prior role / company worth knowing>", "<a notable move, post, or fact>", "..."],
  "linkedin_url": "<their LinkedIn profile URL if you find it, else omit>",
  "sources": [{ "label": "<short source name, e.g. 'Company leadership page'>", "url": "<url>" }]
}

Rules:
- Only facts you can source. Never fabricate a title, employer, or background.
- If you genuinely can't identify the person with confidence, return {"summary": "Couldn't confidently identify this person from public sources.", "highlights": [], "sources": []}.
- 2-5 highlights max. Every highlight is a fact, not a platitude.`;
}

function buildUserPrompt(
  person: StakeholderIntel,
  account: AccountIntelligenceArtifact["account"],
): string {
  const knownTitle = person.title?.value ? ` (${person.title.value})` : "";
  const knownLinkedin = person.linkedin_url
    ? `\nKnown LinkedIn: ${person.linkedin_url}`
    : "";
  return `Research this person before the call:

PERSON: ${person.name}${knownTitle}
COMPANY: ${account.name}${account.domain ? ` (${account.domain})` : ""}${knownLinkedin}

Search the web, triangulate their identity, and return the JSON read. JSON only.`;
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return JSON.parse(fence[1]);
      } catch {
        /* fall through */
      }
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

function cleanSources(
  raw: unknown,
): StakeholderWebResearch["sources"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is { label?: unknown; url?: unknown } => !!s && typeof s === "object")
    .map((s) => ({
      label:
        typeof s.label === "string" && s.label.trim() ? s.label.trim() : "Source",
      url: typeof s.url === "string" && s.url.startsWith("http") ? s.url : undefined,
    }))
    .slice(0, 6);
}

/**
 * Research one stakeholder via Anthropic web_search. Never throws — returns
 * null on missing key / model error / unparseable output so the caller can
 * fall back to held data.
 */
export async function researchStakeholder(
  person: StakeholderIntel,
  artifact: AccountIntelligenceArtifact,
  opts: { researchedAt?: string } = {},
): Promise<StakeholderResearchResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[stakeholder-research] ANTHROPIC_API_KEY missing; skipping");
    return null;
  }
  const productContext = artifact.metadata.product_context ?? "";
  const researchedAt = opts.researchedAt ?? new Date().toISOString();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(productContext),
      messages: [
        { role: "user", content: buildUserPrompt(person, artifact.account) },
      ],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: MAX_SEARCHES,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
  } catch (err) {
    console.warn(
      `[stakeholder-research] ${person.name} :: anthropic error :: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }

  let combined = "";
  for (const block of response.content) {
    if (block.type === "text") combined += block.text;
  }

  const parsed = extractJson(combined) as Record<string, unknown> | null;
  if (!parsed || typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    console.warn(
      `[stakeholder-research] ${person.name} :: unparseable :: ${combined.slice(0, 160)}`,
    );
    return null;
  }

  const highlights = Array.isArray(parsed.highlights)
    ? parsed.highlights
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
        .slice(0, 5)
    : [];

  const linkedinUrl =
    typeof parsed.linkedin_url === "string" &&
    parsed.linkedin_url.startsWith("http")
      ? parsed.linkedin_url
      : undefined;

  return {
    web_research: {
      summary: parsed.summary.trim(),
      highlights,
      sources: cleanSources(parsed.sources),
      researched_at: researchedAt,
    },
    linkedin_url: linkedinUrl,
  };
}
