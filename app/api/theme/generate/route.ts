/**
 * POST /api/theme/generate
 *
 * Takes a natural-language prompt ("make it denser with a warmer
 * accent") and returns a ThemeConfig matching the bounded schema,
 * plus a human-readable summary and any unmet requests.
 *
 * Architecture:
 *   - Anthropic structured output via `output_config.format` —
 *     the schema is the wrong-move-is-impossible bound (per
 *     memory: integrity_preserving_friction.md).
 *   - Defense-in-depth: post-parse runtime validation via
 *     validateThemeConfig before the value is returned to the
 *     client. If validation fails, return the default theme + log.
 *   - No streaming — response is small (~300 tokens), latency is
 *     dominated by the LLM forward pass, not network.
 *   - Model: claude-opus-4-7 (per claude-api skill default).
 *
 * Auth: requires a signed-in user (Clerk). The endpoint doesn't
 * write any data — theme persistence is client-side (localStorage)
 * in v0, server-side per-tenant in v1.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import {
  DEFAULT_THEME,
  THEME_BOUNDS,
  type ThemeConfig,
  type ThemeGenerationResponse,
  validateThemeConfig,
} from "@/lib/theme/types";
import { THEME_GENERATION_SCHEMA } from "@/lib/theme/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 1024;
const MAX_PROMPT_LEN = 600;

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const SYSTEM_PROMPT = `You are Mallin's theme-customization assistant.

Mallin is an AI operating layer for revenue execution. Default UI: monochrome with one slate-blue accent, operator-voice typography, evidence-as-visual-primitive, governed approval gates. Current production theme is dark mode, comfortable density, slate-blue accent (HSL 204, 40%, 67%), system fonts, subtle border radius.

YOUR JOB: read the rep's natural-language request and produce a ThemeConfig that honors what's possible within the bounded schema. Return JSON that strictly matches the schema.

# What you can change (the entire customizable surface)

  - mode: dark | light
  - density: compact | comfortable | spacious
  - accent (HSL): hue 0-360, saturation 0-100, lightness 30-70 ONLY
  - fontFamily: system | serif | mono
  - borderRadius: sharp | subtle | rounded | pill
  - sections.{recentEvents,stakeholders,coach}DefaultExpanded: booleans

# What you cannot change — these aren't cosmetic

  - Sources, citations, evidence display — structural, part of the cognition contract
  - Approval gates, trust-progression stages — governance, not theming
  - The recommendation structure (risk → move → evidence → temporal → accountable) — cognition contract
  - Provenance tags, audit trail visibility — trust posture
  - Removing or hiding any field — only how it looks, not whether it's there

If the user asks for something outside the customizable set, add ONE sentence to unmet_requests explaining why. Brief, honest, operator-voice. Example: "Hiding source citations is not customizable — sources are part of the cognition contract, not the visual theme."

# How to interpret the request — REFERENCE APPLICATIONS, not lookup tables

Humans describe themes stylistically: "like Linear," "like a Bloomberg terminal," "more editorial." Map these to the bounded schema using your understanding of those references. The mapping should feel right, not mechanical.

A FEW ANCHORS (these are examples, not constraints — interpret freely):

  - Bloomberg / financial terminals → compact density, mono font, sharp corners, cool accent (cyan/teal, hue 180-200), saturated
  - Linear → comfortable density, system font, subtle corners, indigo/violet accent (hue 240-270), medium saturation
  - Notion → comfortable density, system font, rounded corners, muted warm accent
  - Apple / iOS HIG → spacious density, system font, rounded corners, blue accent (hue 210-220)
  - Editorial / NYT / The Atlantic → comfortable density, serif font, subtle corners, restrained warm accent (hue 15-30, low saturation)
  - Brutalist → compact density, mono font, sharp corners, high-saturation accent
  - Terminal / hacker / VSCode → compact density, mono font, sharp corners, green or amber accent
  - Stripe Dashboard → comfortable density, system font, subtle corners, indigo accent

For vague requests:
  - "warmer" → shift hue toward 15-45 OR raise saturation slightly while keeping the existing hue if it's already cool
  - "cooler" → shift hue toward 180-240
  - "less corporate" → away from blue toward warmer hues, smaller density, more rounded corners
  - "more serious" → toward serif or mono, away from rounded corners
  - "more modern" → comfortable density, subtle corners, indigo or violet accent
  - "more minimal" → sharp corners, system font, lower-saturation accent
  - "nicer" / "prettier" — pick a reasonable direction; don't ask for clarification

Use judgment. The schema enforces what's possible; you decide how to interpret what they said. Pick a direction and commit — the rep can iterate if it's not quite right.

# Constraints that must always hold

  - Accent lightness stays in 30-70 (40-65 ideal for readability). Values outside 30-70 will be rejected.
  - Preserve fields the user didn't mention by leaving them at the current values (baseline below)
  - If they reference an application by name and you don't recognize it confidently, infer the most reasonable mapping based on what kind of product it is, then move on

# Current theme (baseline — only change what the user asked for)

${JSON.stringify(DEFAULT_THEME, null, 2)}

Return JSON. Summary is one sentence, operator voice, no marketing copy. If the user named a reference application, the summary can mention it ("Shifted toward a Linear-style palette and density.").`;

interface RequestBody {
  prompt?: unknown;
  currentTheme?: unknown;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return badRequest("Unauthorized", 401);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return badRequest("ANTHROPIC_API_KEY not configured", 500);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return badRequest("`prompt` is required and must be a non-empty string");
  }
  if (prompt.length > MAX_PROMPT_LEN) {
    return badRequest(`Prompt must be ${MAX_PROMPT_LEN} characters or fewer`);
  }

  // Caller may pass their current theme so the model knows the baseline
  // to mutate from. If absent, we use DEFAULT_THEME via the system prompt.
  const currentTheme = validateThemeConfig(body.currentTheme) ?? DEFAULT_THEME;

  const userPrompt = `Current theme:\n${JSON.stringify(currentTheme, null, 2)}\n\nRep request: ${prompt}\n\nReturn the updated theme as JSON.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      // Structured output via the bounded schema. The schema is the
      // integrity-preserving boundary: the model cannot return fields
      // outside it, which means it cannot mutate structural elements.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: {
        format: {
          type: "json_schema",
          schema: THEME_GENERATION_SCHEMA,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return badRequest("Rate limited — try again in a moment", 429);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(
        `[theme/generate] anthropic ${err.status}: ${err.message}`,
      );
      return badRequest(err.message, err.status ?? 500);
    }
    console.error("[theme/generate] unexpected error:", err);
    return badRequest("Unexpected error", 500);
  }

  // Extract the JSON-shaped text block from the response.
  let rawJson = "";
  for (const block of response.content) {
    if (block.type === "text") rawJson += block.text;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    console.error(
      "[theme/generate] failed to parse model output as JSON:",
      err,
      "raw=",
      rawJson.slice(0, 500),
    );
    return badRequest("Model returned unparseable output", 502);
  }

  const result = parsed as Partial<ThemeGenerationResponse>;
  const newTheme = validateThemeConfig(result.theme);
  if (!newTheme) {
    console.error(
      "[theme/generate] model output failed validation:",
      JSON.stringify(result).slice(0, 500),
    );
    return badRequest(
      "Model returned a theme that doesn't match the bounded schema",
      502,
    );
  }

  // Clamp accent lightness defensively even if validation passed —
  // belt + suspenders against any edge where the schema let something
  // marginal through.
  newTheme.accent.lightness = Math.min(
    THEME_BOUNDS.lightness.max,
    Math.max(THEME_BOUNDS.lightness.min, newTheme.accent.lightness),
  );

  const summary =
    typeof result.summary === "string" && result.summary.length > 0
      ? result.summary.slice(0, 240)
      : "Theme updated.";
  const unmetRaw = Array.isArray(result.unmet_requests)
    ? result.unmet_requests
    : [];
  const unmet_requests = unmetRaw
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .slice(0, 8)
    .map((s) => s.slice(0, 300));

  const body_out: ThemeGenerationResponse = {
    theme: newTheme,
    summary,
    unmet_requests,
  };

  return NextResponse.json(body_out);
}
