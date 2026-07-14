/**
 * Unit tests for verifySlackSignature.
 *
 * We construct valid signatures using the same HMAC routine Slack uses,
 * then mutate inputs to verify each failure mode is caught.
 */

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifySlackSignature } from "./slack-signature";

const SECRET = "test_signing_secret_abc123";

function sign(timestamp: string, body: string, secret = SECRET): string {
  return (
    "v0=" +
    crypto
      .createHmac("sha256", secret)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")
  );
}

describe("verifySlackSignature", () => {
  const now = 1_700_000_000;
  const ts = String(now);
  const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";

  it("accepts a correctly-signed recent request", () => {
    const sig = sign(ts, body);
    const result = verifySlackSignature(SECRET, ts, sig, body, now);
    expect(result.ok).toBe(true);
  });

  it("rejects when signing secret is empty", () => {
    const sig = sign(ts, body);
    const result = verifySlackSignature("", ts, sig, body, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signing_secret_unset");
  });

  it("rejects when timestamp header is missing", () => {
    const sig = sign(ts, body);
    const result = verifySlackSignature(SECRET, null, sig, body, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_signature_headers");
  });

  it("rejects when signature header is missing", () => {
    const result = verifySlackSignature(SECRET, ts, null, body, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_signature_headers");
  });

  it("rejects an invalid (non-numeric) timestamp", () => {
    const sig = sign("not-a-number", body);
    const result = verifySlackSignature(
      SECRET,
      "not-a-number",
      sig,
      body,
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_timestamp");
  });

  it("rejects timestamps older than 5 minutes (replay defense)", () => {
    const oldTs = String(now - 60 * 6);
    const sig = sign(oldTs, body);
    const result = verifySlackSignature(SECRET, oldTs, sig, body, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timestamp_outside_tolerance");
  });

  it("rejects timestamps from the future beyond tolerance", () => {
    const futureTs = String(now + 60 * 6);
    const sig = sign(futureTs, body);
    const result = verifySlackSignature(SECRET, futureTs, sig, body, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timestamp_outside_tolerance");
  });

  it("rejects when signature was signed with a different secret", () => {
    const sigFromAttacker = sign(ts, body, "different_secret");
    const result = verifySlackSignature(SECRET, ts, sigFromAttacker, body, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects when body has been tampered with after signing", () => {
    const sig = sign(ts, body);
    const tamperedBody = body + "&extra=1";
    const result = verifySlackSignature(SECRET, ts, sig, tamperedBody, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects a signature of mismatched length without throwing", () => {
    const result = verifySlackSignature(SECRET, ts, "v0=short", body, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });
});
