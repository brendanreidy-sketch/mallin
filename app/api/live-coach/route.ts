/**
 * POST /api/live-coach
 *
 * The rep's real-time in-call advisor. Takes a message (what just
 * happened on the call, or what the rep is wondering) + the deal's
 * full context, returns operator-grade guidance.
 *
 * Differences from /api/coach:
 *   - Works without a Pass 4 artifact (Gianna has Pass 0 / Account
 *     Intelligence but no call transcripts yet)
 *   - Different system prompt — assumes the rep is mid-call or
 *     post-moment, not idle Q&A
 *   - Non-streaming (v0 simplicity; streaming can come later if
 *     responses feel slow)
 *   - Multi-turn history-aware
 *
 * Request body:
 *   { dealId: string, message: string, history: [{ role, content }] }
 *
 * Response (200):
 *   { ok: true, message: string }
 *
 * Guardrails:
 *   - DEMO_ALLOWED_DEAL_IDS allowlist (same as /api/coach)
 *   - Message length cap (2000 chars — chats should be short)
 *   - History cap (12 turns)
 *   - 60s timeout via Anthropic SDK
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { loadDealFromDB } from "@/lib/db/load-deal";
import {
  loadAccountIntelligenceByOpp,
  loadOpportunityShellByDealId,
} from "@/lib/db/load-account-intelligence";
import { supabaseAdmin } from "@/lib/db/client";
import { notifyManagerOfCoachActivity } from "@/lib/coach/notify-manager";
import { getCurrentTenantId, getTenantSalesExperience } from "@/lib/auth/tenant-context";
import { experienceGuidance } from "@/prompts/coach-prompt";
import { isOpportunityAccessible } from "@/lib/auth/opportunity-access";

/** Persist a single turn. Best-effort — failure logs but doesn't
 *  break the chat. We'd rather the rep get an answer than 500 the
 *  whole request because the write failed. */
async function persistTurn(opts: {
  tenantId: string;
  opportunityId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
}): Promise<void> {
  try {
    await supabaseAdmin.from("live_coach_turns").insert({
      tenant_id: opts.tenantId,
      opportunity_id: opts.opportunityId,
      user_id: opts.userId,
      role: opts.role,
      content: opts.content,
    });
  } catch (err) {
    console.warn(
      `[live-coach] persist ${opts.role} turn failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 600; // 5-line max per voice rule, plenty of room

// Gate replaced with tenant-membership check via
// `isOpportunityAccessible` (see lib/auth/opportunity-access.ts).

function badRequest(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

const SYSTEM_PROMPT = `You are Mallin. You have been observing this deal — you already know the account, the stakeholders, the recent events, the strategic priorities. The rep is mid-call and just told you what happened. You don't react to their message. You speak from what you already understand.

# Voice — lower entropy than a chat assistant

You are NOT an assistant. You are an operator sitting next to the rep at the meeting. Every sentence is observation or instruction. Nothing else.

The reply opens with the operational insight — never with a preface, never with acknowledgment. Banned openers (these mark assistant-voice and are forbidden):
- "Got it"
- "Sure"
- "Here's what I think"
- "That makes sense"
- "Good question"
- "I see"
- "Understood"
- "Let me think"
- Any restatement of what the rep said
- Any "you're dealing with..." setup line

Open the response with the move or the signal interpretation. The first word of every reply is doing operational work.

# Structure — three things, five lines maximum

1. **The signal** — one line. What their observation actually means in this deal's context. Operator terms only.
2. **The move** — one or two lines. "Try: '<exact words>'" OR "Pivot to: <specific thing>" OR "Ask: '<exact question>'". Specific words, not categories.
3. **The why** — one short phrase. Causal, not motivational.

If the rep's message is genuinely ambiguous (you literally can't tell what happened), ask ONE clarifying question and stop. Do NOT pre-empt by asking a clarifying question when their meaning is clear — assume reasonable interpretation.

# Hard rules

- Reference the prospect and the account by name when relevant — not generically
- Operator voice only. NEVER use: "EB", "the economic buyer", "capital allocation filter", "close window", "smoking gun", "litmus test", "decision criteria" (unspecific), generic AI-coach phrasing, "I think", "I believe", "in my opinion"
- No bullet points unless listing concrete questions or options. Sentences.
- No "you should consider" — say what TO DO
- No speculation about objections that haven't happened
- No recommending "have a discovery call" or other vague platitudes
- If they ask something not about THIS deal, redirect in one line and stop

# What you already know

You have the full account intelligence (recent events, stakeholder profiles, strategic priorities, competitive context) and if applicable the deal-state artifact for THIS prospect. Reason from it. Don't restate it — the rep can see it on the page. Refer to it operationally ("Macrina's gap is the real issue here," not "I see that Macrina departed in November").

You are coaching one rep through one call. Stay there.`;

function buildContextBlock(opts: {
  accountName: string | null;
  intel: unknown;
  pass4: unknown;
}): string {
  const blocks: string[] = [];
  if (opts.accountName) {
    blocks.push(`<account>${opts.accountName}</account>`);
  }
  if (opts.intel) {
    blocks.push(
      `<account_intelligence>\n${JSON.stringify(opts.intel, null, 2)}\n</account_intelligence>`,
    );
  }
  if (opts.pass4) {
    blocks.push(
      `<deal_state_artifact>\n${JSON.stringify(opts.pass4, null, 2)}\n</deal_state_artifact>`,
    );
  }
  return blocks.join("\n\n");
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

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return badRequest("message is required");
  if (message.length > 2000) return badRequest("message exceeds 2000 chars");

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history = rawHistory
    .filter(
      (t): t is { role: "user" | "assistant"; content: string } =>
        typeof t === "object" &&
        t !== null &&
        ((t as { role?: unknown }).role === "user" ||
          (t as { role?: unknown }).role === "assistant") &&
        typeof (t as { content?: unknown }).content === "string",
    )
    .slice(-12);

  // Load deal context. Account Intelligence (Pass 0) ALWAYS preferred
  // because it exists pre-transcripts. Pass 4 (deal state) loaded if
  // available. At least ONE must exist for the coach to be useful.
  const shell = await loadOpportunityShellByDealId(dealId);
  if (!shell) return badRequest("deal not found", 404);

  const intel = await loadAccountIntelligenceByOpp(dealId);
  const dealLoaded = await loadDealFromDB(dealId);
  const pass4 = dealLoaded?.artifact ?? null;

  if (!intel && !pass4) {
    return badRequest(
      "no account intelligence or call artifact for this deal yet",
      404,
    );
  }

  // Resolve the rep's Clerk user ID for turn persistence. Demo bypass
  // path may hit this without auth — in that case we skip persistence
  // rather than reject (the chat still works, just isn't recorded).
  const { userId: clerkUserId } = await auth().catch(() => ({ userId: null }));
  const shouldPersist = Boolean(clerkUserId);

  // Count existing user-role turns for this (tenant, opp, user)
  // BEFORE persisting the new one. Gives us the "Nth question in this
  // conversation" label for the manager notification.
  let questionNumber = 1;
  if (shouldPersist) {
    const { count } = await supabaseAdmin
      .from("live_coach_turns")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", shell.tenant_id)
      .eq("opportunity_id", dealId)
      .eq("user_id", clerkUserId as string)
      .eq("role", "user");
    questionNumber = (count ?? 0) + 1;
  }

  // Persist the user turn BEFORE the model call so even if the
  // Anthropic call fails, we still know what the rep asked.
  if (shouldPersist) {
    await persistTurn({
      tenantId: shell.tenant_id,
      opportunityId: dealId,
      userId: clerkUserId as string,
      role: "user",
      content: message,
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return badRequest("ANTHROPIC_API_KEY not configured", 500);
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const contextBlock = buildContextBlock({
    accountName: shell.account_name,
    intel,
    pass4,
  });

  // The rep's tenure tunes how much the coach explains (best-effort, null-safe).
  const experience = userTenantId
    ? await getTenantSalesExperience(userTenantId)
    : null;
  const expGuide = experienceGuidance(experience);
  const expBlock = expGuide ? `# WHO YOU'RE COACHING\n${expGuide}\n\n` : "";

  // Compose messages: history first, then current message wrapped with context
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({
    role: "user",
    content: `${expBlock}${contextBlock}\n\n<rep_message>\n${message}\n</rep_message>`,
  });

  try {
    const completion = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Sonnet 4.6 with thinking disabled + effort: low is the right
      // config for a real-time chat: low latency, tight voice
      // discipline, no overthinking that pads the response. The
      // operator-voice rule (5 lines, three-part structure) is
      // enforced by the system prompt — the model should default
      // to terse anyway. See shared/model-migration.md → "non-
      // thinking chat workloads."
      thinking: { type: "disabled" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: "low" } as any,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text =
      completion.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim() || "(no response)";

    if (shouldPersist) {
      await persistTurn({
        tenantId: shell.tenant_id,
        opportunityId: dealId,
        userId: clerkUserId as string,
        role: "assistant",
        content: text,
      });

      // Fire-and-await manager notification. Resolve tenant name so
      // the Slack message has human-readable context ("Mallin Demo ·
      // Gianna Donadio", not a UUID). Failure is silent — the chat
      // already responded successfully to the rep.
      const { data: tenantRow } = await supabaseAdmin
        .from("tenants")
        .select("name")
        .eq("id", shell.tenant_id)
        .maybeSingle();
      await notifyManagerOfCoachActivity({
        tenantName: tenantRow?.name ?? null,
        accountName: shell.account_name,
        dealId,
        repIdentifier: clerkUserId as string,
        question: message,
        answer: text,
        turnNumber: questionNumber,
      });
    }

    return NextResponse.json({ ok: true, message: text });
  } catch (err) {
    console.error("[/api/live-coach] anthropic error:", err);
    return badRequest(
      err instanceof Error ? err.message : "anthropic call failed",
      500,
    );
  }
}
