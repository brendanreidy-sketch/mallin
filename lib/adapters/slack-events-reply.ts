/**
 * Slack chat.postMessage helper — posts directly into a known channel
 * id (DM, mpim, or public channel). Used by the events route to reply
 * inside an existing conversation, where we already have the channel
 * id from the inbound event payload and don't need conversations.open.
 *
 * Distinct from postSlackDM (lib/adapters/slack.ts) which opens a DM
 * given a list of user IDs. Same Bot token, same Web API, different
 * entry path.
 */

const SLACK_API = "https://slack.com/api";

export interface PostToSlackChannelInput {
  channel: string;
  text: string;
  /** When set, post as a threaded reply (visible only inside the
   *  thread). Pass the original message's ts to thread off it. */
  thread_ts?: string;
  /** Block Kit payload (optional). When omitted, posts plain text. */
  blocks?: Array<Record<string, unknown>>;
}

export interface PostToSlackChannelResult {
  ok: boolean;
  status: number;
  message_ts?: string;
  error?: string;
}

export async function postToSlackChannel(
  input: PostToSlackChannelInput,
): Promise<PostToSlackChannelResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return { ok: false, status: 0, error: "SLACK_BOT_TOKEN not set" };
  }
  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: input.channel,
        text: input.text,
        thread_ts: input.thread_ts,
        blocks: input.blocks,
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
        error: `chat.postMessage: ${data.error ?? "unknown_error"}`,
      };
    }
    return { ok: true, status: res.status, message_ts: data.ts };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
