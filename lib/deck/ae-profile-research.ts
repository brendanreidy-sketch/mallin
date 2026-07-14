/**
 * AE self-enrichment for the deck intro slide.
 *
 * Given the AE's own name + company, uses Anthropic's web_search tool to find
 * their LinkedIn profile and draft a short, factual intro (title + one-line
 * bio) for the "Meet your rep" slide. Mirrors stakeholder-research: strict JSON
 * out, never fabricates, returns null on any failure so the caller can fall
 * back to whatever the AE already has.
 *
 * This only ever PROPOSES. The value is shown to the AE to confirm/edit before
 * `ae_profile_confirmed` is set — nothing here writes to a deck directly.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_SEARCHES = 4;

export interface AeProfileProposal {
  /** Their current title, e.g. "Account Executive". Omitted if not found. */
  title?: string;
  /** One factual sentence for a customer intro slide. Omitted if not found. */
  bio?: string;
  /** LinkedIn profile URL if a confident match was found. */
  linkedin_url?: string;
  /** True when the agent is NOT confident it identified the right person. */
  low_confidence: boolean;
}

function buildSystemPrompt(): string {
  return `You are helping a sales rep (an Account Executive) write a short, credible self-introduction for the opening slide of a deck they'll present to a prospect. You are given the rep's OWN name and company. Find THEM — the specific person at that company — from public sources (LinkedIn, the company team page, press).

Write a factual, understated intro in the rep's voice-neutral third person — the kind of one-liner that builds quiet credibility without bragging. No hype, no adjectives like "seasoned" or "results-driven".

OUTPUT FORMAT (strict JSON, no prose around it):
{
  "title": "<their current job title, e.g. 'Account Executive'; omit if unknown>",
  "bio": "<ONE factual sentence — where they've worked / what they focus on / relevant tenure; omit if you can't source it>",
  "linkedin_url": "<their LinkedIn profile URL if you find a confident match; omit otherwise>",
  "low_confidence": <true if you are NOT confident you found the right specific person, else false>
}

Rules:
- Only facts you can source. NEVER invent a title, employer, tenure, or achievement.
- Common names collide — if you can't distinguish the right person at the stated company, set "low_confidence": true and omit the fields you're unsure of.
- The bio is at most one sentence, ~20 words. Factual, not promotional.`;
}

function buildUserPrompt(name: string, company?: string | null): string {
  return `Find and introduce this rep:

NAME: ${name}
COMPANY: ${company?.trim() || "(company not provided — search by name and note low confidence if ambiguous)"}

Search the web, confirm it's the right person, and return the JSON. JSON only.`;
}

function extractJson(text: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    const v = tryParse(fence[1]);
    if (v) return v;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1));
  return null;
}

/**
 * Propose an AE intro profile from name + company. Never throws — returns null
 * on missing key / model error / unparseable output.
 */
export async function proposeAeProfile(
  name: string,
  company?: string | null,
): Promise<AeProfileProposal | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[ae-profile-research] ANTHROPIC_API_KEY missing; skipping");
    return null;
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(trimmed, company) }],
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
  } catch (err) {
    console.warn(
      `[ae-profile-research] ${trimmed} :: anthropic error :: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }

  let combined = "";
  for (const block of response.content) {
    if (block.type === "text") combined += block.text;
  }
  const parsed = extractJson(combined);
  if (!parsed) {
    console.warn(`[ae-profile-research] ${trimmed} :: unparseable :: ${combined.slice(0, 160)}`);
    return null;
  }

  const str = (v: unknown, max: number): string | undefined => {
    const t = typeof v === "string" ? v.trim() : "";
    return t ? t.slice(0, max) : undefined;
  };
  const url = str(parsed.linkedin_url, 300);

  return {
    title: str(parsed.title, 80),
    bio: str(parsed.bio, 240),
    linkedin_url: url && /^https?:\/\//.test(url) ? url : undefined,
    low_confidence: parsed.low_confidence === true,
  };
}
