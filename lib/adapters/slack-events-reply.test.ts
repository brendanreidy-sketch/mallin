/**
 * Unit tests for postToSlackChannel — the Events-API reply helper.
 *
 * Like the other Slack adapter tests, we mock global.fetch and verify
 * the shape of the outbound request + the handling of Slack's
 * `ok:true|false` response envelope.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { postToSlackChannel } from "./slack-events-reply";

const TOKEN_BEFORE = process.env.SLACK_BOT_TOKEN;

describe("postToSlackChannel", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    if (TOKEN_BEFORE !== undefined) process.env.SLACK_BOT_TOKEN = TOKEN_BEFORE;
    else delete process.env.SLACK_BOT_TOKEN;
    vi.restoreAllMocks();
  });

  it("returns error when SLACK_BOT_TOKEN is unset", async () => {
    const r = await postToSlackChannel({ channel: "D123", text: "hi" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/SLACK_BOT_TOKEN not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts plain text successfully and returns message_ts", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, ts: "1700.000200" }),
    });

    const r = await postToSlackChannel({
      channel: "D123",
      text: "hello",
      thread_ts: "1699.000100",
    });

    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.message_ts).toBe("1700.000200");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("D123");
    expect(body.text).toBe("hello");
    expect(body.thread_ts).toBe("1699.000100");
  });

  it("surfaces Slack error envelope", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: "channel_not_found" }),
    });

    const r = await postToSlackChannel({ channel: "Dbad", text: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("channel_not_found");
  });

  it("returns ok=false when fetch throws", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const r = await postToSlackChannel({ channel: "D123", text: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network down");
  });
});
