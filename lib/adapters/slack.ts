/**
 * ============================================================================
 *  Slack adapter — webhooks (channel posts) + Bot Web API (DMs)
 * ============================================================================
 *
 *  Two transport paths share the same Block Kit payload:
 *
 *  1. **Incoming webhook** (postToSlack)
 *     - Bound to ONE channel at OAuth time.
 *     - Used for fallback / channel-wide visibility.
 *     - Env: SLACK_WEBHOOK_URL, SLACK_MANAGER_WEBHOOK_URL.
 *
 *  2. **Bot Web API** (postSlackDM)
 *     - Sends a 1:1 or multi-party DM to a list of user IDs.
 *     - Opens a conversation via `conversations.open`, then posts to
 *       the resulting channel via `chat.postMessage`.
 *     - Used because reps and managers ignore channel pings; DMs trigger
 *       push notifications + show in their unread list.
 *     - Env: SLACK_BOT_TOKEN (xoxb-...).
 *     - Required scopes: chat:write, im:write, mpim:write.
 *
 *  When the sink decides which path to use:
 *    - SLACK_BOT_TOKEN set + rep/manager Slack IDs known → DM path.
 *    - Otherwise → webhook path (channel post with @-mentions).
 *
 *  Used by: lib/sf-diff/slack-sink.ts
 *  Tested by: lib/adapters/slack.test.ts
 * ============================================================================
 */

export type SlackChannel = "general" | "manager";

export interface SlackPostResult {
  ok: boolean;
  status: number;
  /** Which transport was used. "general"/"manager" = webhook;
   *  "dm" = Bot Web API DM. */
  webhook_used: SlackChannel | "dm";
  /** For DM path, the channel ID of the opened conversation
   *  (so callers can post follow-ups in the same thread). */
  channel_id?: string;
  /** Slack-side timestamp of the posted message. Useful for threading
   *  follow-ups (e.g. coaching reply when the rep marks complete). */
  message_ts?: string;
  error?: string;
}

/** A Slack Block Kit block — see https://api.slack.com/block-kit
 *  We don't strictly type every block variant; the shape is
 *  open-ended and Slack validates server-side. */
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackPayload {
  /** Plain-text fallback for clients that don't render blocks (mobile
   *  notifications, screen readers). Required by Slack. */
  text: string;
  /** Rich Block Kit content. Optional; Slack falls back to `text`
   *  if blocks are missing or invalid. */
  blocks?: SlackBlock[];
  /** Override the default bot name in the message header. Defaults
   *  to REVOPS_SYSTEM_NAME (or "Mallin" if unset). Webhook-only —
   *  the Bot API uses the bot's configured profile name. */
  username?: string;
  /** Emoji shortcode like ":bar_chart:" — appears as the avatar. */
  icon_emoji?: string;
}

/** Minimal env reader — destructured for unit-test injection. */
interface SlackEnv {
  SLACK_WEBHOOK_URL?: string;
  SLACK_MANAGER_WEBHOOK_URL?: string;
  SLACK_BOT_TOKEN?: string;
  REVOPS_SYSTEM_NAME?: string;
}

function readEnv(): SlackEnv {
  return {
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
    SLACK_MANAGER_WEBHOOK_URL: process.env.SLACK_MANAGER_WEBHOOK_URL,
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    REVOPS_SYSTEM_NAME: process.env.REVOPS_SYSTEM_NAME,
  };
}

/* ────────────────────────────────────────────────────────────────────
 *  Path 1: Incoming webhook (channel post)
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Post a Block Kit (or plain-text) message to a Slack incoming webhook.
 *
 * @param payload  The message contents.
 * @param channel  Which webhook URL to use. "manager" routes to
 *                 SLACK_MANAGER_WEBHOOK_URL if set, else falls back to
 *                 SLACK_WEBHOOK_URL. "general" always uses
 *                 SLACK_WEBHOOK_URL.
 * @returns        Result with HTTP status + which webhook was used.
 *                 Never throws — errors are returned in `error`.
 */
export async function postToSlack(
  payload: SlackPayload,
  channel: SlackChannel = "general",
): Promise<SlackPostResult> {
  const env = readEnv();

  // Resolve which webhook to use. Manager → manager URL if set,
  // else fall back to general so escalations are never silently dropped.
  let url: string | undefined;
  let webhookUsed: SlackChannel;
  if (channel === "manager" && env.SLACK_MANAGER_WEBHOOK_URL) {
    url = env.SLACK_MANAGER_WEBHOOK_URL;
    webhookUsed = "manager";
  } else {
    url = env.SLACK_WEBHOOK_URL;
    webhookUsed = "general";
  }

  if (!url) {
    return {
      ok: false,
      status: 0,
      webhook_used: webhookUsed,
      error: `SLACK_WEBHOOK_URL not set (channel=${channel})`,
    };
  }

  const sysName = env.REVOPS_SYSTEM_NAME || "Mallin";
  const finalPayload = {
    username: payload.username ?? sysName,
    icon_emoji: payload.icon_emoji ?? ":bar_chart:",
    text: payload.text,
    blocks: payload.blocks,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalPayload),
    });
    const ok = res.ok;
    const errorText = ok ? undefined : `HTTP ${res.status}: ${await res.text()}`;
    return {
      ok,
      status: res.status,
      webhook_used: webhookUsed,
      error: errorText,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      webhook_used: webhookUsed,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ────────────────────────────────────────────────────────────────────
 *  Path 2: Bot Web API (DM — 1:1 or multi-party)
 * ──────────────────────────────────────────────────────────────────── */

/** Slack Web API base URL. */
const SLACK_API = "https://slack.com/api";

/**
 * Open a 1:1 or multi-party DM channel for a list of user IDs.
 * Returns the channel ID to post into.
 *
 * - 1 user      → 1:1 DM (im channel)
 * - 2+ users    → multi-party DM (mpim channel) — bot is auto-included
 *
 * @internal Exposed for testing. Most callers should use postSlackDM.
 */
export async function openConversation(
  userIds: string[],
  botToken: string,
): Promise<{ ok: boolean; channel_id?: string; error?: string }> {
  if (userIds.length === 0) {
    return { ok: false, error: "openConversation: empty userIds" };
  }
  // Slack expects comma-separated IDs.
  const usersParam = userIds.map((id) => id.trim()).filter(Boolean).join(",");
  if (!usersParam) {
    return { ok: false, error: "openConversation: all userIds empty" };
  }

  try {
    const res = await fetch(`${SLACK_API}/conversations.open`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ users: usersParam }),
    });
    // Slack always returns 200 with an `ok` field; check that.
    const data = (await res.json()) as {
      ok: boolean;
      channel?: { id: string };
      error?: string;
    };
    if (!data.ok) {
      return {
        ok: false,
        error: `conversations.open: ${data.error ?? "unknown_error"}`,
      };
    }
    return { ok: true, channel_id: data.channel?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send a Slack DM (1:1 or group) to the listed user IDs using the
 * Bot User OAuth Token.
 *
 * Implementation:
 *   1. Open a conversation with the users via conversations.open.
 *   2. Post the Block Kit message to that channel via chat.postMessage.
 *
 * @param payload  Block Kit + plain-text fallback (same shape as webhook path).
 * @param userIds  Slack user IDs to include. 1 → DM. 2+ → group DM.
 * @returns        Result with HTTP status, channel ID, and message ts.
 *                 Never throws — errors are returned in `error`.
 */
export async function postSlackDM(
  payload: SlackPayload,
  userIds: string[],
): Promise<SlackPostResult> {
  const env = readEnv();
  if (!env.SLACK_BOT_TOKEN) {
    return {
      ok: false,
      status: 0,
      webhook_used: "dm",
      error: "SLACK_BOT_TOKEN not set",
    };
  }
  const cleanIds = userIds.map((id) => id.trim()).filter(Boolean);
  if (cleanIds.length === 0) {
    return {
      ok: false,
      status: 0,
      webhook_used: "dm",
      error: "postSlackDM: no user IDs provided",
    };
  }

  // Step 1: open the conversation.
  const opened = await openConversation(cleanIds, env.SLACK_BOT_TOKEN);
  if (!opened.ok || !opened.channel_id) {
    return {
      ok: false,
      status: 0,
      webhook_used: "dm",
      error: opened.error ?? "conversations.open returned no channel",
    };
  }

  // Step 2: post the message.
  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: opened.channel_id,
        text: payload.text,
        blocks: payload.blocks,
        // Username/icon overrides only apply to webhook posts; chat.postMessage
        // uses the bot's profile. We omit them here.
      }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      ts?: string;
      error?: string;
    };
    if (!data.ok) {
      return {
        ok: false,
        status: res.status,
        webhook_used: "dm",
        channel_id: opened.channel_id,
        error: `chat.postMessage: ${data.error ?? "unknown_error"}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      webhook_used: "dm",
      channel_id: opened.channel_id,
      message_ts: data.ts,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      webhook_used: "dm",
      channel_id: opened.channel_id,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Convenience: returns true when the Bot DM path is configured. */
export function isBotDMConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}
