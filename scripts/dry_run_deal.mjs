/**
 * dry_run_deal.mjs — run the full pipeline on any substrate deal with
 * a confirmed SF link. dryRun=true (no SF writes). Slack DMs fire for
 * qualifying alerts.
 *
 * Usage:
 *   node scripts/dry_run_deal.mjs --name "Clenera%"
 *   node scripts/dry_run_deal.mjs --name "Stockbridge%" --limit 3
 *
 * Flags:
 *   --name "<ILIKE pattern>"   pattern to match opportunities.name (required)
 *   --limit <N>                process only first N calls (default: all)
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

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const idx = argv.indexOf(name);
  if (idx === -1 || idx === argv.length - 1) return fallback;
  return argv[idx + 1];
};
const namePattern = flag("--name", null);
const limit = parseInt(flag("--limit", "0"), 10);

if (!namePattern) {
  console.error("Required: --name \"<ILIKE pattern>\"");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const dq = await c.query(
  `SELECT id, name, stage_label FROM opportunities WHERE name ILIKE $1 LIMIT 1`,
  [namePattern],
);
if (dq.rows.length === 0) {
  console.error(`No deal matching "${namePattern}"`);
  await c.end();
  process.exit(1);
}
const deal = dq.rows[0];
const lq = await c.query(
  `SELECT sf_opp_id FROM sf_opportunity_links
   WHERE opportunity_id = $1 AND unlinked_at IS NULL LIMIT 1`,
  [deal.id],
);
if (lq.rows.length === 0) {
  console.error(`No active SF link for ${deal.name}. Use /sf/diff to confirm a match first.`);
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

const calls = limit > 0 ? cq.rows.slice(0, limit) : cq.rows;
const correlationId = `dryrun_${deal.id.slice(0, 8)}_${Date.now()}`;
console.log(`\n→ Deal:  ${deal.name}`);
console.log(`  Stage: ${deal.stage_label}`);
console.log(`  SF:    ${sfOppId}`);
console.log(`  Calls: ${calls.length} of ${cq.rows.length}`);
console.log(`  CID:   ${correlationId}\n`);

const summary = [];
for (let i = 0; i < calls.length; i++) {
  const call = calls[i];
  const callIndex = i + 1;
  const callSource = `${deal.name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30)}_call_${callIndex}_${call.started_at.toISOString().slice(0, 10)}`;
  console.log(`\n─── Call ${callIndex}/${calls.length}: ${call.title.slice(0, 64)} ───`);

  const t0 = Date.now();
  const res = await fetch("http://localhost:3000/api/calls/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dealId: deal.id,
      sfOppId,
      dryRun: true,
      callSource,
      correlationId,
      call: {
        title: call.title,
        started_at: call.started_at.toISOString(),
        duration_seconds: call.duration_seconds,
        summary: call.summary,
        call_index: callIndex,
        total_calls_so_far: callIndex,
      },
    }),
  });
  const elapsed = Date.now() - t0;
  const json = await res.json();
  if (!json.ok) {
    console.log(`  ✗ HTTP ${res.status} error=${json.error}: ${json.message}`);
    summary.push({ callIndex, http: res.status, error: json.error });
    continue;
  }

  const alerts = json.verification_alerts_for_this_call ?? [];
  const sent = json.slack_alerts_sent ?? [];
  console.log(`  ✓ HTTP 200 · ${elapsed}ms · extractor=${json.extractor?.latency_ms ?? "?"}ms`);
  console.log(`    READ: ${(json.the_read ?? "").slice(0, 140)}`);
  if (alerts.length === 0) {
    console.log(`    (no new verification alerts)`);
  } else {
    for (const a of alerts) {
      const sentRow = sent.find((s) => s.rule_id === a.rule_id);
      const tag = sentRow?.sent ? "✓ slack" : "✗ slack";
      console.log(`    • [${a.severity}] ${a.rule_label}  ${tag}`);
    }
  }
  summary.push({
    callIndex,
    alertsTriggered: alerts.length,
    slackSent: sent.filter((s) => s.sent).length,
    elapsed_ms: elapsed,
  });
}

console.log(`\n═══ Summary ═══`);
let totalAlerts = 0;
let totalSent = 0;
for (const s of summary) {
  totalAlerts += s.alertsTriggered || 0;
  totalSent += s.slackSent || 0;
  console.log(
    `  Call ${s.callIndex}: ${s.alertsTriggered ?? "?"} alerts · ${s.slackSent ?? 0} slack-sent`,
  );
}
console.log(
  `\nTotal: ${totalAlerts} alerts, ${totalSent} Slack DMs.`,
);
console.log(`CID:   ${correlationId}\n`);
