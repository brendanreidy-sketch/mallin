/**
 * ============================================================================
 *  Slack request signing — HMAC verification per the standard Slack docs
 *  https://api.slack.com/authentication/verifying-requests-from-slack
 * ============================================================================
 *
 *  Every interactivity / events POST from Slack carries:
 *    - x-slack-request-timestamp: unix seconds when Slack sent the req
 *    - x-slack-signature:         "v0=" + HMAC_SHA256(secret, "v0:ts:body")
 *
 *  We verify both. Timestamp must be within 5 minutes (replay defense).
 *  Signature compared in constant time.
 *
 *  Returns a discriminated result so callers can distinguish ok vs the
 *  specific failure reason (useful for telemetry / debugging Slack
 *  request URL setup).
 * ============================================================================
 */

import crypto from "node:crypto";

export type SlackSigVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

const TIMESTAMP_TOLERANCE_S = 60 * 5; // 5 minutes

/**
 * Verify a Slack-originating POST.
 *
 * @param signingSecret  The app's Signing Secret (from Basic Information
 *                       page in the Slack app config).
 * @param timestamp      The x-slack-request-timestamp header value.
 * @param signature      The x-slack-signature header value.
 * @param rawBody        The unparsed POST body (must be the literal bytes
 *                       Slack sent — re-serialization breaks HMAC).
 * @param now            Current time in seconds (override for tests).
 */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  now: number = Math.floor(Date.now() / 1000),
): SlackSigVerifyResult {
  if (!signingSecret) {
    return { ok: false, reason: "signing_secret_unset" };
  }
  if (!timestamp || !signature) {
    return { ok: false, reason: "missing_signature_headers" };
  }
  const tsNum = parseInt(timestamp, 10);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  if (Math.abs(now - tsNum) > TIMESTAMP_TOLERANCE_S) {
    return { ok: false, reason: "timestamp_outside_tolerance" };
  }

  const baseString = `v0:${timestamp}:${rawBody}`;
  const computed =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(baseString)
      .digest("hex");

  // Length must match before timingSafeEqual or it throws.
  if (computed.length !== signature.length) {
    return { ok: false, reason: "signature_mismatch" };
  }
  const equal = crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature),
  );
  if (!equal) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}
