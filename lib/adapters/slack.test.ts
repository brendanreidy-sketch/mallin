/**
 * Unit tests for the Slack adapter.
 *
 * We never hit Slack here — `fetch` is mocked.
 *
 * Webhook path (postToSlack):
 *   1. Missing env returns ok=false without calling fetch
 *   2. Default channel uses SLACK_WEBHOOK_URL
 *   3. Manager channel uses SLACK_MANAGER_WEBHOOK_URL when set
 *   4. Manager falls back to general when manager URL unset
 *   5. HTTP 4xx/5xx surfaces in the result
 *   6. Username defaults to REVOPS_SYSTEM_NAME, then "Mallin"
 *
 * DM path (postSlackDM):
 *   7. Missing bot token returns ok=false without calling fetch
 *   8. Empty user ID list returns ok=false
 *   9. Successful DM opens conversation then posts message
 *  10. conversations.open failure surfaces in the result
 *  11. chat.postMessage failure surfaces in the result
 *  12. isBotDMConfigured reflects env state
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  postToSlack,
  postSlackDM,
  isBotDMConfigured,
} from "./slack";

interface EnvBag {
  SLACK_WEBHOOK_URL?: string;
  SLACK_MANAGER_WEBHOOK_URL?: string;
  SLACK_BOT_TOKEN?: string;
  REVOPS_SYSTEM_NAME?: string;
}

const originalEnv: EnvBag = {
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
  SLACK_MANAGER_WEBHOOK_URL: process.env.SLACK_MANAGER_WEBHOOK_URL,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  REVOPS_SYSTEM_NAME: process.env.REVOPS_SYSTEM_NAME,
};

function clearEnv(): void {
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_MANAGER_WEBHOOK_URL;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.REVOPS_SYSTEM_NAME;
}

function restoreEnv(): void {
  if (originalEnv.SLACK_WEBHOOK_URL !== undefined)
    process.env.SLACK_WEBHOOK_URL = originalEnv.SLACK_WEBHOOK_URL;
  else delete process.env.SLACK_WEBHOOK_URL;
  if (originalEnv.SLACK_MANAGER_WEBHOOK_URL !== undefined)
    process.env.SLACK_MANAGER_WEBHOOK_URL = originalEnv.SLACK_MANAGER_WEBHOOK_URL;
  else delete process.env.SLACK_MANAGER_WEBHOOK_URL;
  if (originalEnv.SLACK_BOT_TOKEN !== undefined)
    process.env.SLACK_BOT_TOKEN = originalEnv.SLACK_BOT_TOKEN;
  else delete process.env.SLACK_BOT_TOKEN;
  if (originalEnv.REVOPS_SYSTEM_NAME !== undefined)
    process.env.REVOPS_SYSTEM_NAME = originalEnv.REVOPS_SYSTEM_NAME;
  else delete process.env.REVOPS_SYSTEM_NAME;
}

describe("postToSlack (webhook path)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearEnv();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("returns error and does not call fetch when SLACK_WEBHOOK_URL is unset", async () => {
    const result = await postToSlack({ text: "hello" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.error).toMatch(/not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the general webhook by default", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/A/B/C";
    process.env.REVOPS_SYSTEM_NAME = "Mallin";

    const result = await postToSlack({ text: "hello" });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.webhook_used).toBe("general");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/A/B/C",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.username).toBe("Mallin");
    expect(body.text).toBe("hello");
  });

  it("falls back to general when channel=manager but manager URL unset", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/A/B/C";
    const result = await postToSlack({ text: "esc" }, "manager");
    expect(result.ok).toBe(true);
    expect(result.webhook_used).toBe("general");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/A/B/C",
      expect.any(Object),
    );
  });

  it("uses manager URL when set and channel=manager", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/G/E/N";
    process.env.SLACK_MANAGER_WEBHOOK_URL =
      "https://hooks.slack.com/services/M/G/R";
    const result = await postToSlack({ text: "esc" }, "manager");
    expect(result.ok).toBe(true);
    expect(result.webhook_used).toBe("manager");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/M/G/R",
      expect.any(Object),
    );
  });

  it("returns ok=false when fetch returns a 4xx/5xx", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/A/B/C";
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal_error",
    });
    const result = await postToSlack({ text: "hi" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toContain("HTTP 500");
    expect(result.error).toContain("internal_error");
  });

  it("returns ok=false when fetch throws", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/A/B/C";
    fetchMock.mockRejectedValue(new Error("network down"));
    const result = await postToSlack({ text: "hi" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.error).toBe("network down");
  });

  it("defaults username to 'Mallin' when REVOPS_SYSTEM_NAME is unset", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/A/B/C";
    await postToSlack({ text: "hi" });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.username).toBe("Mallin");
  });

  it("respects an explicit username override", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/A/B/C";
    process.env.REVOPS_SYSTEM_NAME = "Mallin";
    await postToSlack({ text: "hi", username: "Custom" });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.username).toBe("Custom");
  });
});

describe("postSlackDM (Bot API path)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearEnv();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("returns error and does not call fetch when SLACK_BOT_TOKEN is unset", async () => {
    const result = await postSlackDM({ text: "hello" }, ["U123"]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.webhook_used).toBe("dm");
    expect(result.error).toMatch(/SLACK_BOT_TOKEN not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns error when no user IDs are provided", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    const result = await postSlackDM({ text: "hello" }, []);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no user IDs/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens conversation then posts message on success", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    fetchMock
      .mockResolvedValueOnce({
        // conversations.open
        ok: true,
        status: 200,
        json: async () => ({ ok: true, channel: { id: "D123" } }),
      })
      .mockResolvedValueOnce({
        // chat.postMessage
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ts: "1700000000.000100" }),
      });

    const result = await postSlackDM(
      { text: "hello", blocks: [{ type: "section", text: { type: "mrkdwn", text: "x" } }] },
      ["U_REP", "U_MGR"],
    );

    expect(result.ok).toBe(true);
    expect(result.webhook_used).toBe("dm");
    expect(result.channel_id).toBe("D123");
    expect(result.message_ts).toBe("1700000000.000100");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Verify conversations.open was called with comma-joined users.
    const openCall = fetchMock.mock.calls[0];
    expect(openCall[0]).toBe("https://slack.com/api/conversations.open");
    const openBody = JSON.parse((openCall[1] as RequestInit).body as string);
    expect(openBody.users).toBe("U_REP,U_MGR");

    // Verify chat.postMessage was called with the channel ID.
    const postCall = fetchMock.mock.calls[1];
    expect(postCall[0]).toBe("https://slack.com/api/chat.postMessage");
    const postBody = JSON.parse((postCall[1] as RequestInit).body as string);
    expect(postBody.channel).toBe("D123");
    expect(postBody.text).toBe("hello");
    expect(Array.isArray(postBody.blocks)).toBe(true);
  });

  it("surfaces conversations.open failures", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: "user_not_found" }),
    });

    const result = await postSlackDM({ text: "hi" }, ["U_BAD"]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("user_not_found");
    expect(fetchMock).toHaveBeenCalledTimes(1); // didn't reach chat.postMessage
  });

  it("surfaces chat.postMessage failures", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, channel: { id: "D456" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: false, error: "channel_not_found" }),
      });

    const result = await postSlackDM({ text: "hi" }, ["U_REP"]);

    expect(result.ok).toBe(false);
    expect(result.channel_id).toBe("D456");
    expect(result.error).toContain("channel_not_found");
  });

  it("trims whitespace from user IDs and skips empties", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, channel: { id: "D789" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ts: "1.0" }),
      });

    await postSlackDM({ text: "hi" }, ["  U_REP  ", "", "U_MGR"]);

    const openBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(openBody.users).toBe("U_REP,U_MGR");
  });
});

describe("isBotDMConfigured", () => {
  const before = process.env.SLACK_BOT_TOKEN;

  afterEach(() => {
    if (before !== undefined) process.env.SLACK_BOT_TOKEN = before;
    else delete process.env.SLACK_BOT_TOKEN;
  });

  it("returns false when SLACK_BOT_TOKEN is unset", () => {
    delete process.env.SLACK_BOT_TOKEN;
    expect(isBotDMConfigured()).toBe(false);
  });

  it("returns true when SLACK_BOT_TOKEN is set", () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    expect(isBotDMConfigured()).toBe(true);
  });
});
