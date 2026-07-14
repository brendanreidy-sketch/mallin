/**
 * ============================================================================
 *  test-slack.ts — End-to-end verification of Slack wiring
 * ============================================================================
 *
 *  Sends two synthetic alerts to verify both channel paths:
 *    1. A "warn" alert (verification gap)        → general webhook
 *    2. An "escalate_to_manager" alert           → manager webhook
 *                                                  (falls back if unset)
 *
 *  Run:
 *    npm run slack:test
 *
 *  Required env (set in .env.local):
 *    SLACK_WEBHOOK_URL                — required
 *    SLACK_MANAGER_WEBHOOK_URL        — optional (falls back to general)
 *    REVOPS_SYSTEM_NAME               — optional (defaults to "Mallin")
 *
 *  Exit code:
 *    0 — both posts returned ok
 *    1 — at least one post failed (env unset, network error, 4xx/5xx)
 * ============================================================================
 */

import { sendEscalationToSlack } from "../lib/sf-diff/slack-sink";
import type { EscalationAlert } from "../lib/sf-diff/methodology-escalation";

const sampleWarn: EscalationAlert = {
  rule_id: "test_warn_signer_named",
  rule_label: "Economic buyer / signer not yet named",
  severity: "warn",
  triggered_at_call: 3,
  calls_missing: 1,
  total_calls: 3,
  rep_message:
    "3 calls and the signer still hasn't been on a call. Without them, you're guessing on price and signature date.",
  manager_message: null,
  sf_fields: ["Who_is_the_Economic_Buyer__c"],
  next_call_ask: {
    who: "Greg",
    question: "Who has to sign this off when we're ready to send paper?",
    why: "Without the signer in the conversation, price and timing are just guesses.",
  },
};

const sampleEscalate: EscalationAlert = {
  rule_id: "test_escalate_deal_desk",
  rule_label: "Contract path not locked",
  severity: "escalate_to_manager",
  triggered_at_call: 6,
  calls_missing: 2,
  total_calls: 6,
  rep_message:
    "6 calls in and we still don't have Greg's procurement team looped in. Their contract review takes 2 weeks. Quarter ends in 3. The math doesn't work.",
  manager_message:
    "Cipher: 6 calls in, still no path to the buyer's legal/procurement team. Contract review on their side takes 2 weeks; quarter ends in 3. High slip risk — worth your intervention this week.",
  sf_fields: ["Deal_Desk_Status__c"],
  next_call_ask: {
    who: "Greg",
    question: "Who from your legal or procurement team should we loop in this week?",
    why: "Their review takes two weeks; if we don't start it now, the signature date moves into next quarter.",
  },
};

/** Construct a Salesforce Lightning record URL from the SF login URL.
 *  Converts e.g. https://orgfarm-X.develop.my.salesforce.com
 *  into       https://orgfarm-X.develop.lightning.force.com.
 *  Falls back to a localhost replay URL when SF_LOGIN_URL is unset. */
function sfLightningUrl(opportunityId: string): string {
  const login = process.env.SF_LOGIN_URL;
  if (!login) {
    return `http://localhost:3000/sf/replay?dealId=${opportunityId}`;
  }
  // Replace `.my.salesforce.com` with `.lightning.force.com`
  const base = login
    .replace(".my.salesforce.com", ".lightning.force.com")
    .replace(/\/$/, "");
  return `${base}/lightning/r/Opportunity/${opportunityId}/view`;
}

async function main(): Promise<void> {
  console.log("[test-slack] Sending warn-level test…");
  const r1 = await sendEscalationToSlack(sampleWarn, {
    deal_name: "Acme Corp · Treasury renewal",
    account_name: "Acme Corp",
    rep_name: "Brendan Reidy",
    deal_stage: "Discovery",
    deal_amount: "$45K ARR",
    last_call_label: "May 8 · 32 min",
    deal_id: "006g5000003TEST01",
    deal_url: sfLightningUrl("006g5000003TEST01"),
  });
  console.log("[test-slack] warn result:", r1);

  console.log("[test-slack] Sending escalate-to-manager test…");
  const r2 = await sendEscalationToSlack(sampleEscalate, {
    deal_name: "Cipher · Q3 renewal",
    account_name: "Cipher Industries",
    rep_name: "Brendan Reidy",
    deal_stage: "Negotiation",
    deal_amount: "$120K ARR",
    last_call_label: "May 9 · 47 min",
    deal_id: "006g5000003TEST02",
    deal_url: sfLightningUrl("006g5000003TEST02"),
  });
  console.log("[test-slack] escalate result:", r2);

  if (!r1.ok || !r2.ok) {
    console.error(
      "[test-slack] ✗ One or both posts failed. Check SLACK_WEBHOOK_URL in .env.local.",
    );
    process.exit(1);
  }
  console.log(
    "[test-slack] ✓ Both posts succeeded. Check your Slack channel(s).",
  );
}

main().catch((err) => {
  console.error("[test-slack] Fatal:", err);
  process.exit(1);
});
