/**
 * Smoke test for the pilot signup email path.
 *
 * Sends a single test email through the actual sendPilotSignupNotification
 * helper (lib/email/resend.ts) to verify:
 *   1. RESEND_API_KEY is loaded from .env.local
 *   2. The key has the right scope (sending)
 *   3. The verified mallin.io domain accepts the from address
 *   4. The HTML + text bodies render
 *   5. brendan@mallin.io actually receives it
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/_smoke/pilot-signup-email.ts
 *
 * Delete this file once the integration is confirmed live.
 */

import { sendPilotSignupNotification } from "../../lib/email/resend";

async function main() {
  console.log("→ Sending smoke-test pilot signup notification...");
  const start = Date.now();

  const result = await sendPilotSignupNotification({
    name: "Smoke Test",
    email: "smoke-test@example.invalid",
    company: "Smoke Test Co (ignore — automated test)",
    role: "Test Engineer",
    team_size: "1–5 AEs",
    current_stack: ["Salesforce", "Slack", "Gong"],
    trigger: "missed_quarter",
    notes:
      "This is an automated smoke test from scripts/_smoke/pilot-signup-email.ts. " +
      "Confirms RESEND_API_KEY + RESEND_FROM_EMAIL are wired correctly. " +
      "Safe to ignore / delete.",
  });

  const ms = Date.now() - start;

  if (result.ok) {
    console.log(`✓ Email sent successfully in ${ms}ms`);
    console.log(`  Resend message id: ${result.id}`);
    console.log(`  Check brendan@mallin.io for delivery.`);
    process.exit(0);
  } else {
    console.error(`✗ Email send FAILED after ${ms}ms`);
    console.error(`  Error: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error in smoke test:", err);
  process.exit(2);
});
