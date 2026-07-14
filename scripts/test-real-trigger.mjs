/**
 * test-real-trigger.mjs
 *
 *   Fires ONE real call from the Cipher corpus through /api/calls/process
 *   with dryRun=true. The route runs the full pipeline:
 *     extractor → tier split → writer (skipped on dryRun) → verification
 *     detector → Slack fan-out for newly-triggered alerts.
 *
 *   Expected outcome:
 *     - Slack DM lands per qualifying verification alert
 *     - No Salesforce write happens (dryRun=true)
 *     - Console prints verification_alerts_for_this_call + slack_alerts_sent
 *
 *   This proves the loop end-to-end without touching SF.
 *
 *   Usage:
 *     node scripts/test-real-trigger.mjs                  # default: Cipher call 1
 *     node scripts/test-real-trigger.mjs --call 4         # Cipher call 4
 *     node scripts/test-real-trigger.mjs --deal "Cipher Mining%"   # different match
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .split("\n")
  .reduce((a, l) => {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      a[m[1]] = m[2];
      process.env[m[1]] = m[2];
    }
    return a;
  }, {});

// CLI flags (lightweight)
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const idx = argv.indexOf(name);
  if (idx === -1 || idx === argv.length - 1) return fallback;
  return argv[idx + 1];
};
const callNum = parseInt(flag("--call", "1"), 10);
const dealPattern = flag("--deal", "Cipher Mining%");

// Resolve deal + link + the chosen call
const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const dq = await c.query(
  `SELECT id, name FROM opportunities WHERE name ILIKE $1 LIMIT 1`,
  [dealPattern],
);
if (dq.rows.length === 0) {
  console.error(`No deal matching "${dealPattern}"`);
  await c.end();
  process.exit(1);
}
const deal = dq.rows[0];
const lq = await c.query(
  `SELECT sf_opp_id FROM sf_opportunity_links
   WHERE opportunity_id = $1 AND unlinked_at IS NULL
   LIMIT 1`,
  [deal.id],
);
if (lq.rows.length === 0) {
  console.error(`No active SF link for ${deal.name}`);
  await c.end();
  process.exit(1);
}
const sfOppId = lq.rows[0].sf_opp_id;

const cq = await c.query(
  `SELECT id, title, started_at, duration_seconds, summary
   FROM calls
   WHERE opportunity_id = $1 AND summary IS NOT NULL
   ORDER BY started_at ASC`,
  [deal.id],
);
await c.end();
if (cq.rows.length < callNum) {
  console.error(`Only ${cq.rows.length} calls; --call ${callNum} out of range`);
  process.exit(1);
}
const call = cq.rows[callNum - 1];

console.log(`\n→ Deal:    ${deal.name} (${deal.id})`);
console.log(`  SF opp:  ${sfOppId}`);
console.log(`  Call:    ${callNum}/${cq.rows.length} — ${call.title}`);
console.log(`  Started: ${call.started_at.toISOString()}\n`);

const res = await fetch("http://localhost:3000/api/calls/process", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    dealId: deal.id,
    sfOppId,
    dryRun: true, // critical — we don't want SF writes from this test
    callSource: `test_real_trigger_${call.started_at.toISOString().slice(0, 10)}`,
    correlationId: `test_real_trigger_${Date.now()}`,
    call: {
      title: call.title,
      started_at: call.started_at.toISOString(),
      duration_seconds: call.duration_seconds,
      summary: call.summary,
      call_index: callNum,
      total_calls_so_far: callNum,
    },
  }),
});

const body = await res.json();
console.log(`HTTP ${res.status}\n`);

console.log("─── verification_alerts_for_this_call ───");
const alerts = body.verification_alerts_for_this_call ?? [];
if (alerts.length === 0) {
  console.log("  (none — no gaps newly triggered on this call)");
} else {
  for (const a of alerts) {
    console.log(`  • [${a.severity}] ${a.rule_label}`);
    console.log(`    rule_id: ${a.rule_id}`);
    console.log(`    sf_fields: ${a.sf_fields.join(", ")}`);
    if (a.next_call_ask) {
      console.log(`    next ask: ${a.next_call_ask.who} → "${a.next_call_ask.question}"`);
    }
  }
}

console.log("\n─── slack_alerts_sent ───");
const sent = body.slack_alerts_sent ?? [];
if (sent.length === 0) {
  console.log("  (no Slack posts attempted)");
} else {
  for (const s of sent) {
    const tag = s.sent ? "✓" : "✗";
    console.log(`  ${tag} ${s.rule_label} [${s.severity}]`);
    if (s.message_ts) console.log(`     message_ts: ${s.message_ts}`);
    if (s.error) console.log(`     error: ${s.error}`);
  }
}

console.log(`\nFor full response: rerun with > /tmp/r.json and inspect.`);
console.log(`Latency: ${body.elapsed_ms}ms · dry_run=${body.dry_run}\n`);
