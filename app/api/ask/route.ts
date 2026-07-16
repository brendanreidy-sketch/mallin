/**
 * POST /api/ask — pipeline-level Ask Mallín.
 *
 * The companion to /api/coach (which is per-deal). Loads the whole tenant's
 * deals + briefs, builds a compact pipeline context, and streams Claude's
 * answer as SSE. Grounded strictly in the deals it can see; names them
 * explicitly. Same streaming/encoding contract as /api/coach.
 */

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { loadTenantDeals } from "@/lib/cockpit/load-tenant-deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-5";
const MAX_OUTPUT_TOKENS = 700;

const SYSTEM_PROMPT = `You are Mallín, an AI sales strategist embedded in a rep's workspace.
You answer questions about the rep's WHOLE pipeline. Rules:
- Ground every claim strictly in the deal context provided. Never invent deals, people, or facts.
- Name specific deals when relevant.
- Be concise and direct — a peer rep's voice, not a report. Lead with the answer.
- If the context doesn't contain the answer, say so plainly.`;

type Turn = { role: "user" | "assistant"; content: string };

function badRequest(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const { orgId, userId } = await auth();
  if (!userId) return badRequest("unauthorized", 401);
  if (!orgId) return badRequest("no workspace in context", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON body");
  }
  const b = (body ?? {}) as { question?: unknown; history?: unknown };
  const question =
    typeof b.question === "string" ? b.question.trim().slice(0, 2000) : "";
  if (!question) return badRequest("question is required");

  const rawHistory: unknown[] = Array.isArray(b.history) ? b.history : [];
  const history: Turn[] = rawHistory
    .filter(
      (t): t is Turn =>
        typeof t === "object" &&
        t !== null &&
        ((t as Turn).role === "user" || (t as Turn).role === "assistant") &&
        typeof (t as Turn).content === "string",
    )
    .slice(-12);

  // Load the whole pipeline and build a compact context block.
  const load = await loadTenantDeals(orgId);
  const deals = load.kind === "ok" ? load.deals : [];
  const briefById = new Map(
    (load.kind === "ok" ? load.briefs : []).map((brief) => [brief.id, brief.artifact]),
  );

  const context = deals
    .slice(0, 25)
    .map((d) => {
      const a = briefById.get(d.id);
      const lines = [`DEAL: ${d.name}${d.needsYou ? " [NEEDS YOU]" : " [on track]"}`];
      if (a?.top_line?.text) lines.push(`Situation: ${a.top_line.text}`);
      else if (d.why) lines.push(`Status: ${d.why}`);
      if (a?.how_you_win) lines.push(`How you win: ${a.how_you_win}`);
      const risks = (a?.critical_risks ?? [])
        .filter((r) => r.severity !== "medium")
        .slice(0, 2)
        .map((r) => r.title);
      if (risks.length) lines.push(`Risks: ${risks.join("; ")}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const userPrompt = `The rep's pipeline:\n\n${
    context || "(no deals in this pipeline yet)"
  }\n\n---\nRep's question: ${question}\n\nAnswer using only the pipeline above. Name specific deals.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return badRequest("ANTHROPIC_API_KEY is not configured", 500);
  }
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [];
  for (const turn of history) messages.push({ role: turn.role, content: turn.content });
  messages.push({ role: "user", content: userPrompt });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) =>
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      try {
        const claudeStream = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: SYSTEM_PROMPT,
          messages,
        });
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send(event.delta.text.replace(/\n/g, "\\n"));
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
