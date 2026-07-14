/**
 * Notify the founder/manager of a new Live Coach exchange.
 *
 * Architecture: matches the value-prop mechanism captured in
 * MEMORY.md — "the alert + the manager in the thread creates
 * accountability that forces the conversation the team was
 * avoiding." This is the same shape applied to coaching: rep asks
 * Mallin a question → manager sees it in Slack → manager can DM the
 * rep with additional guidance through normal Slack channels. No
 * dashboards, no surveillance posture, pure event-driven.
 *
 * Fires once per round-trip (after assistant reply is generated)
 * with both the question and Mallin's response in one Block Kit
 * message. Manager sees the full exchange and can decide whether
 * to step in.
 *
 * Failure is silent — if SLACK_MANAGER_WEBHOOK_URL isn't set or
 * the post fails, the chat still works for the rep. The notification
 * is enrichment, not gate.
 */

import { postToSlack } from "../adapters/slack";

interface NotifyCoachActivityInput {
  tenantName: string | null;
  accountName: string | null;
  dealId: string;
  repIdentifier: string; // Clerk user ID; used as identity marker
  question: string;
  answer: string;
  turnNumber: number; // 1-indexed; "nth question in this conversation"
}

/** Truncate text for Slack display. Slack section blocks have a 3000
 *  char limit per text field; we cap at 800 to keep things scannable. */
function truncate(text: string, max = 800): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
}

/** Build the Block Kit payload for the manager notification. */
function buildBlocks(opts: NotifyCoachActivityInput): {
  text: string;
  blocks: Array<{ type: string; [k: string]: unknown }>;
} {
  const accountLabel = opts.accountName ?? "Unknown account";
  const tenantLabel = opts.tenantName ?? "Unknown tenant";
  const turnLabel =
    opts.turnNumber === 1
      ? "1st question in this conversation"
      : `${opts.turnNumber}${ordinalSuffix(opts.turnNumber)} question in this conversation`;

  // Best-effort link back to the prep page. Local dev: skip the host
  // prefix so the relative link still resolves in dev clients.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_BASE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    "https://mallin.io";
  const briefUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/prep?dealId=${encodeURIComponent(opts.dealId)}`;

  const repShort =
    opts.repIdentifier.length > 16
      ? `${opts.repIdentifier.slice(0, 14)}…`
      : opts.repIdentifier;

  const text = `Rep just asked Mallin (${accountLabel} · ${tenantLabel}): ${truncate(opts.question, 140)}`;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🎙️ Rep asked Mallin about ${accountLabel}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*${tenantLabel}* · rep \`${repShort}\` · ${turnLabel}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Question*\n>${truncate(opts.question, 800).replace(/\n/g, "\n>")}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Mallin replied*\n>${truncate(opts.answer, 800).replace(/\n/g, "\n>")}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View brief →", emoji: true },
          url: briefUrl,
          style: "primary",
        },
      ],
    },
  ];

  return { text, blocks };
}

function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  const last = n % 10;
  if (last === 1) return "st";
  if (last === 2) return "nd";
  if (last === 3) return "rd";
  return "th";
}

/**
 * Fire the manager notification. Never throws — returns true on
 * successful post, false otherwise (caller can log but shouldn't
 * react). Caller should NOT await this in a way that blocks the
 * response if latency matters, but it's fast enough (single fetch
 * to Slack webhook) that awaiting is fine in practice.
 */
export async function notifyManagerOfCoachActivity(
  opts: NotifyCoachActivityInput,
): Promise<boolean> {
  try {
    const { text, blocks } = buildBlocks(opts);
    const result = await postToSlack(
      { text, blocks, icon_emoji: ":speaking_head_in_silhouette:" },
      "manager",
    );
    if (!result.ok) {
      console.warn(
        `[coach/notify-manager] post failed: ${result.error ?? "unknown"}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[coach/notify-manager] threw:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
