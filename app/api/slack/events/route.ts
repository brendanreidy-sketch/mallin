/**
 * ============================================================================
 *  POST /api/slack/events
 * ============================================================================
 *
 *  Slack Events API endpoint. Phase 1 is listen-only: receive events,
 *  verify them, ack quickly, post a placeholder reply so the rep knows
 *  the wire is alive. Phase 2 will route messages to an intent
 *  classifier and call the existing agents (recall / verification /
 *  extractor).
 *
 *  Configured in Slack app: Event Subscriptions → Request URL.
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. Every request HMAC-verified against SLACK_SIGNING_SECRET.    ║
 *  ║     Same verifier as /api/slack/interact.                        ║
 *  ║  2. URL verification handshake (one-time, on Slack setup) is     ║
 *  ║     answered before any signature checks — that's the documented ║
 *  ║     handshake path and Slack treats it specially.                ║
 *  ║  3. Bot messages (subtype: bot_message OR user equals bot user)  ║
 *  ║     are dropped to prevent feedback loops (bot replies to itself ║
 *  ║     replies to itself...).                                       ║
 *  ║  4. Phase 1 is listen-only. NO agent calls. NO writes. Just an   ║
 *  ║     ack post that says "I heard you; conversational layer is     ║
 *  ║     wiring up." This proves end-to-end plumbing in isolation.    ║
 *  ║  5. Slack expects a 200 within 3 seconds or it retries. We       ║
 *  ║     respond immediately and post the ack message asynchronously  ║
 *  ║     (fire-and-forget) so heavy work never blocks the ack.        ║
 *  ╚══════════════════════════════════════════════════════════════════╝
 * ============================================================================
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/adapters/slack-signature";
import { postToSlackChannel } from "@/lib/adapters/slack-events-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SlackEventEnvelope {
  /** "url_verification" on initial setup; "event_callback" for real events. */
  type: string;
  /** Present on url_verification — must be echoed back. */
  challenge?: string;
  /** Present on event_callback — the actual event payload. */
  event?: SlackEvent;
  /** Slack uses event_id + retry headers for deduplication & at-least-once
   *  delivery. We rely on Slack-side retry semantics for now. */
  event_id?: string;
  team_id?: string;
  api_app_id?: string;
}

interface SlackEvent {
  type: string; // "message" | "app_mention" | ...
  subtype?: string; // "bot_message" | undefined
  user?: string; // user id of sender
  bot_id?: string; // present when sent by a bot
  text?: string;
  channel?: string; // channel id (DM = D..., MPIM = G..., channel = C...)
  channel_type?: string; // "im" | "mpim" | "channel" | "group"
  ts?: string; // message timestamp
  thread_ts?: string; // if reply in thread
  app_id?: string;
}

export async function POST(req: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";
  const rawBody = await req.text();

  // Step 1: parse the envelope. We need the `type` BEFORE signature
  // verification only to detect the URL verification handshake, since
  // some Slack docs note the handshake bypasses normal sig checks in
  // practice during initial setup. To be safe we ALSO verify the
  // signature on handshake — Slack DOES send a valid one.
  let envelope: SlackEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEventEnvelope;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_json" },
      { status: 400 },
    );
  }

  // Step 2: HMAC verify (same verifier as /api/slack/interact).
  const verification = verifySlackSignature(
    signingSecret,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
    rawBody,
  );
  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, reason: verification.reason },
      { status: 401 },
    );
  }

  // Step 3: URL verification handshake. Slack sends this once when you
  // first set the Request URL — we must echo the `challenge` field.
  if (envelope.type === "url_verification" && envelope.challenge) {
    return NextResponse.json({ challenge: envelope.challenge });
  }

  // Step 4: Only handle event_callback envelopes.
  if (envelope.type !== "event_callback" || !envelope.event) {
    return NextResponse.json({ ok: true, ignored: envelope.type });
  }

  const event = envelope.event;

  // Step 5: Drop bot/self-messages to prevent feedback loops.
  if (event.bot_id || event.subtype === "bot_message" || event.app_id) {
    return NextResponse.json({ ok: true, ignored: "bot_or_self" });
  }

  // Step 6: Only act on the event types we care about for v1 — DMs,
  // group DMs, and @-mentions. Channel posts that don't mention us
  // are dropped (we're not a channel listener).
  const isDM = event.channel_type === "im";
  const isGroupDM = event.channel_type === "mpim";
  const isMention = event.type === "app_mention";
  if (!isDM && !isGroupDM && !isMention) {
    return NextResponse.json({ ok: true, ignored: "wrong_channel_type" });
  }

  // Step 7: Phase 1 ack. Fire-and-forget so the 200 lands inside
  // Slack's 3-second budget even if Slack's API is slow. Phase 2
  // will replace this stub with intent routing.
  if (event.channel && event.text) {
    void postToSlackChannel({
      channel: event.channel,
      thread_ts: event.thread_ts ?? event.ts,
      text:
        "I'm listening — the conversational layer is wiring up (Phase 1). " +
        "Right now I receive your message but can't reason about deals yet. " +
        "Phase 2 will wire the intent router; the agents (recall / " +
        "verification / extractor) are already built.",
    }).catch((err) => {
      console.warn("[slack-events] ack post failed:", err);
    });
  }

  return NextResponse.json({ ok: true });
}
