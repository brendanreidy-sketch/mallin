/**
 * ============================================================================
 *  Slack sink — EscalationAlert → action-first DM (or channel fallback)
 * ============================================================================
 *
 *  Design principle (from Brendan): channel posts get ignored, even with
 *  @-mentions. DMs trigger push notifications + show in unread lists +
 *  feel like "someone is talking to me, not at the team."
 *
 *  Routing:
 *    SLACK_BOT_TOKEN set + relevant user IDs known
 *      severity == "warn"                → DM rep alone
 *      severity == "escalate_to_manager" → group DM with rep + manager
 *                                          (bot auto-included). Same
 *                                          thread, both notified, real
 *                                          conversation possible.
 *
 *    SLACK_BOT_TOKEN unset (or user IDs missing)
 *      → falls back to webhook channel post with @-mentions for
 *        notification (degraded but never silent).
 *
 *  Message format (action-first):
 *    1. Header                  ⚠️/🚨 + rule label + deal name
 *    2. → DO THIS NEXT          verbatim question, who, why
 *                               (the actual coaching — what to actually
 *                               do, not what's wrong)
 *    3. WHY THIS FIRED          rep_message (the diagnosis)
 *    4. FOR YOUR MANAGER        manager_message  (only on escalations)
 *    5. Context                 rule label · call N of M · K calls missing
 *    6. Footer                  [Open deal] link
 *
 *  Never throws — all transport errors are returned in the SlackPostResult.
 *
 *  Used by: scripts/test-slack.ts (verification path) and any future
 *  pipeline glue (e.g. /api/calls/process) that wants to fan out alerts.
 * ============================================================================
 */

import type { EscalationAlert } from "./methodology-escalation";
import {
  postToSlack,
  postSlackDM,
  isBotDMConfigured,
  type SlackPostResult,
  type SlackBlock,
} from "../adapters/slack";

export interface SlackSinkContext {
  /** Deal name for the header (e.g., "Acme · Q3 renewal"). */
  deal_name: string;
  /** Account name — surfaced in the metadata fields block when set. */
  account_name?: string;
  /** Rep working the account (display name, e.g. "Brendan Reidy").
   *  Surfaced in the metadata fields block. Independent of
   *  rep_slack_id (which is the @-mention target). */
  rep_name?: string;
  /** Stage label — surfaced in the metadata fields block when set. */
  deal_stage?: string;
  /** Deal amount as a display string (e.g., "$45K ARR"). Surfaced in
   *  the metadata fields block when set. We render whatever string is
   *  passed; no formatting magic. */
  deal_amount?: string;
  /** Date of the last call (display string, e.g. "May 8 · 32 min").
   *  Surfaced in the metadata fields block when set. */
  last_call_label?: string;
  /** Salesforce (or substrate) URL to the deal record. When set,
   *  rendered as an "Open in Salesforce" button. */
  deal_url?: string;
  /** Stable deal identifier (SF opp ID or substrate UUID). Encoded
   *  into the button value so audit rows can join back to the deal. */
  deal_id?: string;
  /** Slack user ID of the rep responsible for this deal (e.g.
   *  "U07ABC123"). Used as the DM recipient on warn alerts and as
   *  one of the recipients on escalations. Falls back to env
   *  SLACK_REP_USER_ID. Leave undefined to send to no rep. */
  rep_slack_id?: string;
  /** Slack user ID of the rep's manager. Added to the group DM on
   *  escalate_to_manager alerts. Falls back to env
   *  SLACK_MANAGER_USER_ID. Leave undefined to skip manager. */
  manager_slack_id?: string;
}

/** Build the 2-column "deal at a glance" fields block. Skipped
 *  entirely when no metadata fields are populated, so the message
 *  stays compact when the call pipeline doesn't have rich context. */
function buildDealMetadataBlock(ctx: SlackSinkContext): SlackBlock | null {
  const fields: { type: "mrkdwn"; text: string }[] = [];
  if (ctx.account_name) {
    fields.push({ type: "mrkdwn", text: `*Account*\n${ctx.account_name}` });
  }
  if (ctx.rep_name) {
    fields.push({ type: "mrkdwn", text: `*Rep*\n${ctx.rep_name}` });
  }
  if (ctx.deal_stage) {
    fields.push({ type: "mrkdwn", text: `*Stage*\n${ctx.deal_stage}` });
  }
  if (ctx.deal_amount) {
    fields.push({ type: "mrkdwn", text: `*Amount*\n${ctx.deal_amount}` });
  }
  if (ctx.last_call_label) {
    fields.push({
      type: "mrkdwn",
      text: `*Last call*\n${ctx.last_call_label}`,
    });
  }
  if (fields.length === 0) return null;
  return { type: "section", fields };
}

/** Slack mrkdwn @-mention syntax — `<@U07ABC123>` */
function mentionTag(userId: string | undefined): string {
  if (!userId) return "";
  const id = userId.trim().replace(/^@/, "");
  if (!id) return "";
  return `<@${id}>`;
}

/** First-name salutation. Splits rep_name on space and takes [0].
 *  Falls back to a neutral "Hey," when no name is set. */
function salutation(repName: string | undefined): string {
  if (!repName) return "Hey,";
  const first = repName.trim().split(/\s+/)[0];
  return first ? `Hey ${first},` : "Hey,";
}

/**
 * Build the Block Kit + fallback text for an escalation alert.
 * Pure function — no I/O. Exported for unit testing the format.
 *
 * @param mentionPrefix  Optional `<@U...> ` string to prepend to the
 *                       fallback text (so webhook posts trigger pushes
 *                       even when blocks aren't rendered). Empty
 *                       string for DM path (DMs auto-notify).
 */
export function buildAlertBlocks(
  alert: EscalationAlert,
  ctx: SlackSinkContext,
  mentionPrefix: string,
): { blocks: SlackBlock[]; fallback: string } {
  const isManager = alert.severity === "escalate_to_manager";
  const blocks: SlackBlock[] = [];

  // 1. Header — severity badge + deal name. Single scannable line for
  //    the inbox glance; body below carries the voice.
  const badge = isManager ? "🚨" : "⚠️";
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `${badge} ${ctx.deal_name}`,
      emoji: true,
    },
  });

  // 2. Deal-at-a-glance metadata (2-column fields block). Kept — reps
  //    want the stage/amount/last-call anchors at a glance.
  const metadataBlock = buildDealMetadataBlock(ctx);
  if (metadataBlock) {
    blocks.push(metadataBlock);
    blocks.push({ type: "divider" });
  }

  // 3. The actual message — flowing prose, not stacked labeled
  //    sections. Voice rule: "would a rep say this on the phone?"
  //    Pattern:
  //      Hey {first name},
  //      {diagnosis — the rep_message text, conversational already}
  //      Today — ask {who}: "{question}"
  //      {why this matters, one line}
  const hi = salutation(ctx.rep_name);
  let body = `${hi}\n\n${alert.rep_message}`;
  if (alert.next_call_ask) {
    const a = alert.next_call_ask;
    body += `\n\nToday — ask *${a.who}*: _"${a.question}"_\n${a.why}`;
  }
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: body },
  });

  // 4. Manager loop-in — only on escalations. Phrased as "looping you
  //    in here", since the manager IS in the conversation (group DM),
  //    not the subject of a third-person note. Quoted-block visual
  //    treatment (mrkdwn `> ` prefix) sets it off without screaming.
  if (isManager && alert.manager_message) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `> _Looping you in_ — ${alert.manager_message}`,
      },
    });
  }

  // 6. Action row — Stage 1 trust progression buttons (Looks right /
  //    Looks wrong) plus an Open-in-Salesforce deep link.
  //    Click handlers live at /api/slack/interact (action_id routing).
  //    The `value` field carries the alert identity AND the SF target
  //    (deal_id, primary sf_field) so the audit row written on click
  //    can answer "for field X, what's the confirm rate?" — the data
  //    that earns Stage 2 graduation per ui_trust_progression.md.
  blocks.push({ type: "divider" });
  // Primary SF field — first entry in the alert's sf_fields list.
  // Multi-field alerts pick the first as the canonical anchor for
  // the audit row (kept simple; future work: per-field tracking).
  const primarySfField = alert.sf_fields[0] ?? null;
  const actionValue = JSON.stringify({
    rule_id: alert.rule_id,
    severity: alert.severity,
    deal: ctx.deal_name,
    deal_id: ctx.deal_id ?? null,
    sf_field: primarySfField,
    // Verification-gap alerts flag missing info — they don't propose
    // a fill value. suggested_value stays null until Stage 2 alerts
    // (which DO carry a proposed write) come online.
    suggested_value: null,
    triggered_at_call: alert.triggered_at_call,
  });
  const actionElements: Record<string, unknown>[] = [
    {
      type: "button",
      text: { type: "plain_text", text: "✓ Looks right", emoji: true },
      action_id: "acres_alert_confirm",
      style: "primary",
      value: actionValue,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "Looks wrong", emoji: true },
      action_id: "acres_alert_dismiss",
      value: actionValue,
    },
  ];
  if (ctx.deal_url) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Open in Salesforce", emoji: true },
      url: ctx.deal_url,
      // URL buttons don't need action_id — Slack treats them as
      // out-of-app navigation; no event round-trips back to us.
    });
  }
  blocks.push({ type: "actions", elements: actionElements });

  // 7. Context — rule label + call counters (small footer line)
  const callsMissingLabel = `${alert.calls_missing} call${alert.calls_missing === 1 ? "" : "s"} missing`;
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${alert.rule_label} · call ${alert.triggered_at_call} of ${alert.total_calls} · ${callsMissingLabel}`,
      },
    ],
  });

  // Plain-text fallback (mobile notifications / accessibility / non-block
  // clients). Lead with the deal + action so the lock-screen preview
  // reads like a real message, not a system notification.
  const askLine = alert.next_call_ask
    ? `Ask ${alert.next_call_ask.who}: "${alert.next_call_ask.question}"`
    : alert.rep_message;
  const fallback = `${mentionPrefix}${badge} ${ctx.deal_name} — ${askLine}`;

  return { blocks, fallback };
}

/**
 * Convert an EscalationAlert into a Block Kit message and deliver it
 * via the strongest channel configured.
 *
 * Routing:
 *   - SLACK_BOT_TOKEN set + recipient IDs known → DM (1:1 on warn,
 *                                                   group DM on escalate)
 *   - Otherwise → webhook channel post with @-mention fallback
 */
export async function sendEscalationToSlack(
  alert: EscalationAlert,
  ctx: SlackSinkContext,
): Promise<SlackPostResult> {
  const isManager = alert.severity === "escalate_to_manager";

  // Resolve recipient IDs: explicit ctx wins; otherwise env fallback.
  const repId = (ctx.rep_slack_id ?? process.env.SLACK_REP_USER_ID ?? "").trim();
  const managerId = (
    ctx.manager_slack_id ?? process.env.SLACK_MANAGER_USER_ID ?? ""
  ).trim();

  // Decide on DM vs webhook path.
  const recipients = isManager
    ? [repId, managerId].filter(Boolean)
    : [repId].filter(Boolean);
  const useDM = isBotDMConfigured() && recipients.length > 0;

  let result: SlackPostResult;
  let channelLabel: string;

  if (useDM) {
    // DM path — recipients ARE the audience; no @-mentions needed
    // because everyone in the conversation auto-notifies.
    const { blocks, fallback } = buildAlertBlocks(alert, ctx, "");
    result = await postSlackDM({ text: fallback, blocks }, recipients);
    channelLabel = isManager ? "Manager DM" : "Rep DM";
  } else {
    // Webhook fallback path — post to channel with @-mentions for pings.
    const repMention = mentionTag(repId);
    const managerMention = mentionTag(managerId);
    const fallbackMentions = [
      repMention,
      isManager ? managerMention : "",
    ]
      .filter(Boolean)
      .join(" ");
    const fallbackPrefix = fallbackMentions ? `${fallbackMentions} ` : "";
    const { blocks, fallback } = buildAlertBlocks(alert, ctx, fallbackPrefix);
    const channel = isManager ? "manager" : "general";
    result = await postToSlack(
      {
        text: fallback,
        blocks,
        icon_emoji: isManager ? ":rotating_light:" : ":warning:",
      },
      channel,
    );
    channelLabel = isManager ? "#manager" : "#general";
  }

  // Audit the outbound post (success OR failure). Never throws — if the
  // audit insert fails, the rep-visible flow continues.
  void auditOutbound(alert, ctx, channelLabel, result);

  return result;
}

/**
 * Fire-and-forget audit. Wrapped in try/catch so any insert failure is
 * isolated from the rep-visible alert flow.
 */
async function auditOutbound(
  alert: EscalationAlert,
  ctx: SlackSinkContext,
  channel: string,
  result: SlackPostResult,
): Promise<void> {
  try {
    const { auditSlackOutbound } = await import("./slack-outbound-audit");
    await auditSlackOutbound({
      alert,
      opportunity_id: ctx.deal_id,
      channel,
      result,
    });
  } catch (err) {
    console.warn(
      `[slack-sink] audit hook failed: ${(err as Error).message ?? "unknown"}`,
    );
  }
}

// ============================================================================
//  AlertSink interface implementation
// ============================================================================
//  Wraps the existing direct API (sendEscalationToSlack) so this sink can
//  be plugged into the unified sendToAllSinks fan-out. Existing direct
//  callers (scripts/test-slack.ts, calls/process today) keep working.
// ============================================================================

import type { AlertSink, AlertSinkContext, AlertSinkResult } from "./alert-sinks";

export const slackSink: AlertSink = {
  name: "slack",

  async isConfigured(_tenantId: string): Promise<boolean> {
    // Slack is configured at the env level today (not per-tenant). Once
    // we add per-tenant Slack workspaces we'll look up tenant config here.
    return Boolean(
      process.env.SLACK_WEBHOOK_URL || process.env.SLACK_BOT_TOKEN,
    );
  },

  async send(
    alert,
    ctx: AlertSinkContext,
    _tenantId: string,
  ): Promise<AlertSinkResult> {
    const slackCtx: SlackSinkContext = {
      deal_name: ctx.deal_name,
      account_name: ctx.account_name,
      deal_stage: ctx.deal_stage,
      deal_amount: ctx.deal_amount,
      rep_name: ctx.rep_name,
      rep_slack_id: ctx.rep_slack_id,
      manager_slack_id: ctx.manager_slack_id,
      deal_url: ctx.deal_url,
      last_call_label: ctx.last_call_label,
    };
    const result = await sendEscalationToSlack(alert, slackCtx);
    return {
      sink: "slack",
      ok: result.ok,
      detail: result.ok
        ? { surface: result.webhook_used, channel_id: result.channel_id, message_ts: result.message_ts }
        : undefined,
      error: result.ok ? undefined : result.error,
    };
  },
};
