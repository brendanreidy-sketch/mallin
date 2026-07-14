/**
 * News refresh for Account Intelligence artifacts.
 *
 * Uses Anthropic's web_search tool to find recent events about an
 * account, extracted in the three-part-depth template (strategic
 * shift × product capability × buying implication) — same shape
 * humans write manually, so the refresh layer doesn't degrade the
 * cognition contract.
 *
 * Design notes:
 *   - We DO NOT regenerate the account profile, stakeholders, or
 *     pre_call_brief in the daily run. Those are slow-changing;
 *     refreshing them daily would be noise. Only recent_events.
 *   - Existing events are passed to the model so it knows what
 *     NOT to duplicate.
 *   - Every new event is captured_at = now, so the UI can render
 *     a "NEW" badge for the next 24 hours.
 *   - Relevance MUST be written through metadata.product_context —
 *     enforced in the prompt + post-fetch validator.
 *
 * Cost: ~3 web searches + ~2-3k input/output tokens per refresh.
 * At Anthropic pricing (~$0.01/search + claude-sonnet rates) this
 * is well under $0.10 per account-day. Fine for daily cadence.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AccountIntelligenceArtifact,
  RecentEvent,
  Confidence,
} from "../types";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_SEARCHES = 5;
const LOOKBACK_DAYS = 21;

interface RefreshResult {
  /** New events Claude found that weren't in the existing list. */
  new_events: RecentEvent[];
  /** Raw text response (for debugging). */
  raw_response: string;
  /** How many web_search tool calls Claude actually made. */
  search_count: number;
}

function buildSystemPrompt(artifact: AccountIntelligenceArtifact): string {
  const productContext = artifact.metadata.product_context;
  return `You are Mallin's intelligence-refresh agent for a B2B revenue account.

Your job is to find genuinely new, materially relevant news/events about ONE specific company over the last ${LOOKBACK_DAYS} days, and write the operator-grade relevance line for each one — through the lens of what the rep is selling.

PRODUCT CONTEXT (the lens for every relevance line):
${productContext}

THREE-PART DEPTH TEMPLATE — every \`relevance\` field must answer:
  1. Strategic shift this creates — what concretely changed in their operations/org/workflows
  2. Specific product-capability that maps to the change — name the actual module/feature category by its label, not generic platitudes
  3. Buying implication — wider committee? shorter window? new gatekeeper? Prescriptive, not descriptive

REJECT events that are:
  - Generic industry news not tied to this specific company
  - Older than ${LOOKBACK_DAYS} days
  - Already covered in the existing list below
  - Pure marketing / fluff without operational implication
  - Press releases about features/awards/etc. with no strategic weight

OUTPUT FORMAT (strict JSON, no prose around it):
{
  "events": [
    {
      "date": "YYYY-MM-DD",
      "headline": "<one factual sentence>",
      "relevance": "<three-part depth: strategic shift. → capability mapping. → buying implication.>",
      "source_url": "<canonical source URL>",
      "confidence": "high" | "medium" | "low"
    }
  ]
}

If you find nothing materially new, return {"events": []}. Never fabricate. Every event needs a real, accessible source URL.`;
}

function buildUserPrompt(artifact: AccountIntelligenceArtifact): string {
  const { account, recent_events } = artifact;
  const existing = (recent_events ?? [])
    .slice(0, 12)
    .map((e) => `- ${e.date} :: ${e.headline}`)
    .join("\n");

  return `Find new news about this company over the last ${LOOKBACK_DAYS} days:

COMPANY: ${account.name}${account.domain ? ` (${account.domain})` : ""}

EXISTING EVENTS WE ALREADY HAVE (do NOT include these or near-duplicates):
${existing || "(none)"}

Search the web. For each new event, write the relevance through the three-part depth template.

Return JSON only.`;
}

/** Strict-mode JSON extraction — Claude sometimes wraps in fences. */
function extractJson(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Strip code fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch {
        // fall through
      }
    }
    // Find first { and matching }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    return null;
  }
}

function isValidEvent(
  e: unknown,
): e is { date: string; headline: string; relevance: string; source_url: string; confidence?: string } {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.date) &&
    typeof o.headline === "string" &&
    o.headline.length > 0 &&
    typeof o.relevance === "string" &&
    o.relevance.length > 20 && // require minimal depth
    typeof o.source_url === "string" &&
    o.source_url.startsWith("http")
  );
}

function normalizeConfidence(c: string | undefined): Confidence {
  if (c === "high" || c === "medium" || c === "low") return c;
  return "medium";
}

/**
 * Fetches fresh events for an account via Anthropic web_search.
 * Returns parsed/validated events ready to merge. Never throws —
 * on error returns an empty list with a logged warning (refresh is
 * enrichment, not gate).
 */
export async function refreshAccountNews(
  artifact: AccountIntelligenceArtifact,
  opts: { capturedAt?: string } = {},
): Promise<RefreshResult> {
  const empty: RefreshResult = {
    new_events: [],
    raw_response: "",
    search_count: 0,
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[news-refresh] ANTHROPIC_API_KEY missing; skipping");
    return empty;
  }
  if (!artifact.metadata.product_context) {
    console.warn(
      `[news-refresh] artifact for ${artifact.account.name} has no product_context; skipping`,
    );
    return empty;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const capturedAt = opts.capturedAt ?? new Date().toISOString();

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(artifact),
      messages: [{ role: "user", content: buildUserPrompt(artifact) }],
      // `web_search_20250305` is a server-managed tool (Anthropic runs
      // the search itself), shape-distinct from user-defined Tool — the
      // SDK's Tool type requires input_schema which doesn't apply here.
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
      `[news-refresh] ${artifact.account.name} :: anthropic error :: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return empty;
  }

  // Walk all text blocks; ignore tool_use blocks (those are the search
  // calls themselves). The model's final structured answer comes back
  // as text after the tool exchange.
  let combined = "";
  let searchCount = 0;
  for (const block of response.content) {
    if (block.type === "text") {
      combined += block.text;
    } else if ((block as { type: string }).type === "server_tool_use") {
      searchCount += 1;
    }
  }

  const parsed = extractJson(combined);
  if (!parsed || typeof parsed !== "object" || !("events" in parsed)) {
    console.warn(
      `[news-refresh] ${artifact.account.name} :: could not parse JSON :: ${combined.slice(
        0,
        200,
      )}`,
    );
    return { ...empty, raw_response: combined, search_count: searchCount };
  }

  const rawEvents = (parsed as { events: unknown }).events;
  if (!Array.isArray(rawEvents)) {
    return { ...empty, raw_response: combined, search_count: searchCount };
  }

  const newEvents: RecentEvent[] = rawEvents
    .filter(isValidEvent)
    .map((e) => ({
      date: e.date,
      headline: e.headline,
      relevance: e.relevance,
      source: "web_search", // Claude's web_search tool → various publishers
      source_url: e.source_url,
      captured_at: capturedAt,
      confidence: normalizeConfidence(e.confidence),
    }));

  console.log(
    `[news-refresh] ${artifact.account.name} :: ${newEvents.length} new event(s) from ${searchCount} search(es)`,
  );

  return {
    new_events: newEvents,
    raw_response: combined,
    search_count: searchCount,
  };
}
