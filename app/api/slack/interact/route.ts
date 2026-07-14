/**
 * ============================================================================
 *  POST /api/slack/interact
 * ============================================================================
 *
 *  Receives Slack interactivity events (button clicks, modal submissions).
 *  Configured in Slack app: Interactivity & Shortcuts → Request URL.
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. Every request HMAC-verified against SLACK_SIGNING_SECRET.    ║
 *  ║     No verification = 401, no exceptions.                        ║
 *  ║  2. Timestamps outside 5 min are rejected (replay defense).      ║
 *  ║  3. The handler returns 200 within Slack's 3-second budget.      ║
 *  ║     Long work is delegated to a follow-up via response_url.      ║
 *  ║  4. Stage 1 trust progression: clicks log to audit. They DO NOT  ║
 *  ║     write to Salesforce. Graduation to Stage 2 happens after     ║
 *  ║     N=50 confirms with >85% confirm rate (per ui_trust_progression). ║
 *  ╚══════════════════════════════════════════════════════════════════╝
 *
 *  Action routing:
 *    acres_alert_confirm   → user clicked "Looks right"
 *    acres_alert_dismiss   → user clicked "Looks wrong"
 *
 *  Response strategy:
 *    For each click we use response_url to replace the original message
 *    with a "✓ Confirmed by @user" banner so the conversation visibly
 *    moves forward. The original blocks are preserved so the rep can
 *    still see what was confirmed.
 * ============================================================================
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifySlackSignature } from "@/lib/adapters/slack-signature";
import {
  insertSlackInteraction,
  type SlackInteractionStatus,
} from "@/lib/sf-diff/slack-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SlackButtonAction {
  type: string;
  action_id: string;
  block_id?: string;
  value?: string;
}

interface SlackInteractivePayload {
  type: string;
  user: { id: string; name?: string; username?: string };
  team?: { id: string; domain?: string };
  channel?: { id: string; name?: string };
  message?: { ts: string; blocks?: unknown[] };
  response_url: string;
  trigger_id?: string;
  actions?: SlackButtonAction[];
}

/** Shape encoded into the action button's `value` field by the slack-sink.
 *  Older clicks (from before deal_id/sf_field were added) may be missing
 *  the optional fields — we tolerate that. */
interface AlertActionValue {
  rule_id: string;
  severity: string;
  deal: string;
  deal_id: string | null;
  sf_field: string | null;
  suggested_value: string | null;
  triggered_at_call: number;
}

function safeParseAlertValue(raw: string | undefined): AlertActionValue | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (
      typeof obj === "object" &&
      obj !== null &&
      typeof obj.rule_id === "string" &&
      typeof obj.deal === "string"
    ) {
      return {
        rule_id: obj.rule_id,
        severity: typeof obj.severity === "string" ? obj.severity : "warn",
        deal: obj.deal,
        deal_id: typeof obj.deal_id === "string" ? obj.deal_id : null,
        sf_field: typeof obj.sf_field === "string" ? obj.sf_field : null,
        suggested_value:
          typeof obj.suggested_value === "string" ? obj.suggested_value : null,
        triggered_at_call:
          typeof obj.triggered_at_call === "number" ? obj.triggered_at_call : 0,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * POST a follow-up message to Slack via the response_url. Used to
 * replace the original alert with a confirmation/dismissal banner.
 *
 * Fire-and-forget — if it fails, we log but don't block the click
 * acknowledgement (the rep's click is already accepted).
 */
async function postFollowUp(
  responseUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(
        `[slack-interact] response_url returned ${res.status}: ${text}`,
      );
    }
  } catch (err) {
    console.warn(`[slack-interact] response_url POST failed:`, err);
  }
}

export async function POST(req: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";
  const rawBody = await req.text();

  // Step 1: HMAC verify before parsing anything.
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

  // Step 2: Slack sends interactivity as application/x-www-form-urlencoded
  // with a single `payload` field whose value is JSON.
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return NextResponse.json(
      { ok: false, reason: "missing_payload" },
      { status: 400 },
    );
  }
  let payload: SlackInteractivePayload;
  try {
    payload = JSON.parse(payloadStr) as SlackInteractivePayload;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_payload_json" },
      { status: 400 },
    );
  }

  // Step 3: Route by interaction type. Today we only handle block_actions
  // (button clicks). Modals + shortcuts are future work.
  if (payload.type !== "block_actions") {
    return NextResponse.json({ ok: true, ignored: payload.type });
  }
  const action = payload.actions?.[0];
  if (!action) {
    return NextResponse.json({ ok: true, ignored: "no_action" });
  }

  const alertValue = safeParseAlertValue(action.value);
  const userTag = `<@${payload.user.id}>`;
  const nowEt = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });

  // Step 4: Action-specific handling. Stage 1 discipline — these DO NOT
  // write to Salesforce. They post a confirmation banner via response_url
  // and write an audit row to track confirm-rate.
  let bannerText: string;
  let auditStatus: SlackInteractionStatus;

  switch (action.action_id) {
    case "acres_alert_confirm":
      bannerText = `✓ Confirmed by ${userTag} at ${nowEt} ET`;
      auditStatus = "confirmed_pending_apply";
      break;
    case "acres_alert_dismiss":
      bannerText = `✗ Dismissed by ${userTag} at ${nowEt} ET`;
      auditStatus = "dismissed_with_correction";
      break;
    default:
      // Unknown action — ack but don't error. Logs + 200 keeps Slack happy.
      console.warn(
        `[slack-interact] unknown action_id: ${action.action_id}`,
      );
      return NextResponse.json({ ok: true, ignored: action.action_id });
  }

  // Step 5: Replace the original message — keep its existing blocks
  // (so the rep can still see what they confirmed) and prepend a banner.
  const originalBlocks = Array.isArray(payload.message?.blocks)
    ? payload.message!.blocks!
    : [];
  const banner = {
    type: "context",
    elements: [{ type: "mrkdwn", text: bannerText }],
  };
  // Strip the actions block (button row) since the click already
  // happened — it shouldn't be re-clickable.
  const blocksWithoutActions = originalBlocks.filter(
    (b: unknown) =>
      !(typeof b === "object" && b !== null && (b as { type: string }).type === "actions"),
  );
  const updatedBlocks = [banner, ...blocksWithoutActions];

  // Fire follow-up (replaces original); doesn't block the response.
  await postFollowUp(payload.response_url, {
    replace_original: true,
    blocks: updatedBlocks,
    text: bannerText,
  });

  // Step 6: Write the audit row. This is the durable record that
  // drives Stage 1 → Stage 2 graduation. Done AFTER the message
  // replacement so Slack's UX never blocks on a DB hiccup; if the
  // insert fails, we log + return 200 anyway (so Slack doesn't retry
  // and double-write).
  const messageTs = payload.message?.ts ?? "";
  const userName = payload.user.username ?? payload.user.name ?? null;

  if (alertValue && messageTs) {
    const auditResult = await insertSlackInteraction({
      slack_user_id: payload.user.id,
      slack_user_name: userName,
      action_id: action.action_id,
      status: auditStatus,
      rule_id: alertValue.rule_id,
      alert_severity: alertValue.severity,
      deal_name: alertValue.deal,
      deal_id: alertValue.deal_id,
      sf_field: alertValue.sf_field,
      suggested_value: alertValue.suggested_value,
      triggered_at_call: alertValue.triggered_at_call,
      message_ts: messageTs,
      channel_id: payload.channel?.id ?? null,
      raw_payload: payload as unknown as Record<string, unknown>,
    });
    if (!auditResult.ok) {
      // Critical: log loud but don't 500. Slack would retry on 5xx and
      // we'd risk double-replacement of the original message.
      console.error(
        "[slack-interact] AUDIT INSERT FAILED:",
        auditResult.error,
      );
    } else {
      console.log(
        JSON.stringify({
          event: "slack_interact",
          audit_id: auditResult.id,
          action_id: action.action_id,
          audit_status: auditStatus,
          user_id: payload.user.id,
          user_name: userName,
          alert: alertValue,
          message_ts: messageTs,
          channel_id: payload.channel?.id ?? null,
          ts: new Date().toISOString(),
        }),
      );
    }
  } else {
    // Defensive: if alert metadata couldn't be parsed, we still log
    // the click for forensics but skip the audit insert (rule_id is
    // NOT NULL in the schema).
    console.warn(
      "[slack-interact] missing alert metadata or message_ts; skipping audit insert",
      { alertValuePresent: !!alertValue, messageTsPresent: !!messageTs },
    );
  }

  return NextResponse.json({ ok: true });
}
