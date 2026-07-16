/**
 * Proactive-nudge dry run.
 *
 * Scans a tenant's live deals and prints the moves Mallín WOULD push — no Slack
 * send. This exercises the detection engine (lib/proactive/detect-nudges) that
 * powers the "system reaches out" layer. Delivery via lib/adapters/slack
 * `postToSlack` is a deliberate, gated enablement step — not auto-wired here, so
 * nothing goes to a workspace's Slack unsolicited.
 *
 * Run: npm run proactive:scan -- <tenantId>
 */
import { scanTenantForNudges, composeNudgeText } from "@/lib/proactive/detect-nudges";

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error("Usage: npm run proactive:scan -- <tenantId>");
    process.exit(2);
  }

  const nudges = await scanTenantForNudges(tenantId, Date.now());

  if (nudges.length === 0) {
    console.log("No proactive nudges — every deal is moving (or none have a current brief).");
    return;
  }

  console.log(`\n${nudges.length} nudge(s) Mallín would push for tenant ${tenantId}:\n`);
  for (const n of nudges) {
    console.log(`  ▸ [${n.kind}] ${n.dealName}`);
    for (const line of composeNudgeText(n).replace(/\*/g, "").split("\n")) {
      console.log(line ? `      ${line}` : "");
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
