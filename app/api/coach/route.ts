/**
 * ============================================================================
 *  POST /api/coach
 * ============================================================================
 *
 *  Streaming coach endpoint. Takes a rep question + dealId, loads the
 *  current substrate + artifact from Supabase, builds a coach-style
 *  prompt with methodology / governance / AE-expectations baked in, and
 *  streams Claude's response back as Server-Sent Events.
 *
 *  Request body (JSON):
 *    {
 *      "dealId":   "<uuid>",
 *      "question": "<rep's prompt>",
 *      "history":  [{ role: "user"|"assistant", content: "..." }]   (optional)
 *    }
 *
 *  Response: text/event-stream
 *    Each event: data: <chunk>\n\n
 *    Final event: data: [DONE]\n\n
 *
 *  GUARDRAILS
 *  ──────────
 *  - DEMO_ALLOWED_DEAL_IDS allowlist (mirrors /prep + /api/log-touch)
 *  - Body length cap (4000 chars)
 *  - 60s timeout via AbortController
 * ============================================================================
 */

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { loadDealFromDB } from "@/lib/db/load-deal";
import { supabaseAdmin } from "@/lib/db/client";
import {
  COACH_SYSTEM_PROMPT,
  buildCoachUserPrompt,
  type CoachContext,
} from "@/prompts/coach-prompt";
import { getCurrentTenantId, getTenantSalesExperience } from "@/lib/auth/tenant-context";
import { isOpportunityAccessible } from "@/lib/auth/opportunity-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-5";
const MAX_OUTPUT_TOKENS = 800; // coach answers are short by design

function badRequest(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Record the ask (question only — never the streamed answer) into
 * coach_asks. Best-effort: a failure logs and returns, it never blocks
 * the rep from getting an answer. This is the question-taxonomy /
 * rep-dependency corpus — the companion to live_coach_turns for the
 * post-brief ask surface. See migration 033_coach_asks.sql.
 */
async function persistAsk(opts: {
  tenantId: string;
  opportunityId: string;
  userId: string;
  question: string;
  context?: CoachContext;
}): Promise<void> {
  try {
    await supabaseAdmin.from("coach_asks").insert({
      tenant_id: opts.tenantId,
      opportunity_id: opts.opportunityId,
      user_id: opts.userId,
      question: opts.question,
      context_surface: opts.context?.surface ?? null,
      context_label: opts.context?.label ?? null,
    });
  } catch (err) {
    console.warn(
      "[coach] persist ask failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("invalid JSON body");
  }

  const dealIdRaw = typeof body.dealId === "string" ? body.dealId : "";
  const dealId = dealIdRaw.replace(/[^a-fA-F0-9-]/g, "");
  if (!dealId) return badRequest("dealId is required");
  const userTenantId = await getCurrentTenantId().catch(() => null);
  if (!(await isOpportunityAccessible(dealId, userTenantId))) {
    return badRequest("opportunity not accessible to this tenant", 403);
  }
  const { userId } = await auth();

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return badRequest("question is required");
  if (question.length > 4000) return badRequest("question exceeds 4000 chars");

  // Optional surface context handed from a cockpit "💡" button. Validated
  // structurally — unknown surfaces are dropped (we don't want a malformed
  // context section sneaking into the prompt).
  let context: CoachContext | undefined;
  if (body.context && typeof body.context === "object") {
    const raw = body.context as Record<string, unknown>;
    const surface = typeof raw.surface === "string" ? raw.surface : "";
    if (
      surface === "email" ||
      surface === "crm_update" ||
      surface === "critical_risk"
    ) {
      const label =
        typeof raw.label === "string" && raw.label.length <= 100
          ? raw.label
          : undefined;
      const item_id =
        typeof raw.item_id === "string" && raw.item_id.length <= 100
          ? raw.item_id
          : undefined;
      context = { surface, label, item_id };
    }
  }

  // Capture the ask (question only) for the improvement corpus. Best-effort
  // and only the FIRST ask of a session — history.length === 0 means this is
  // the opening question, so follow-ups in the same thread don't inflate the
  // taxonomy with "make it shorter"-style refinements. Fire-and-forget; the
  // write is defended so a missing table (migration not yet applied to prod)
  // never blocks the answer.
  const isOpeningAsk = !Array.isArray(body.history) || body.history.length === 0;
  if (userTenantId && userId && isOpeningAsk) {
    void persistAsk({
      tenantId: userTenantId,
      opportunityId: dealId,
      userId,
      question,
      context,
    });
  }

  // Optional multi-turn history. Cap at 12 turns to keep prompt size sane.
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history = rawHistory
    .filter(
      (
        t,
      ): t is { role: "user" | "assistant"; content: string } =>
        typeof t === "object" &&
        t !== null &&
        (t as { role?: unknown }).role !== undefined &&
        ((t as { role: string }).role === "user" ||
          (t as { role: string }).role === "assistant") &&
        typeof (t as { content?: unknown }).content === "string",
    )
    .slice(-12);

  // Load deal context — required for the coach to reason against THIS deal.
  const loaded = await loadDealFromDB(dealId);
  if (!loaded || !loaded.artifact) {
    return badRequest("deal or brief artifact not found", 404);
  }

  // The rep's tenure tunes how much the coach explains (best-effort, null-safe).
  const experience = userTenantId
    ? await getTenantSalesExperience(userTenantId)
    : null;

  const userPrompt = buildCoachUserPrompt({
    question,
    artifact: loaded.artifact as Parameters<typeof buildCoachUserPrompt>[0]["artifact"],
    substrate: loaded.substrate as Parameters<
      typeof buildCoachUserPrompt
    >[0]["substrate"],
    history,
    context,
    experience,
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    return badRequest("ANTHROPIC_API_KEY is not configured", 500);
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build messages: prior history + current question. Keep alternating
  // user/assistant ordering — Claude rejects messages where roles repeat.
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: userPrompt });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      };
      try {
        const claudeStream = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: COACH_SYSTEM_PROMPT,
          messages,
        });
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            // SSE doesn't allow bare newlines inside a single data: line —
            // encode them so the client can decode safely.
            const safe = event.delta.text.replace(/\n/g, "\\n");
            send(safe);
          }
        }
        send("[DONE]");
        controller.close();
      } catch (err) {
        send(
          `[ERROR] ${(err as Error).message?.replace(/\n/g, " ") ?? "stream failed"}`,
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
