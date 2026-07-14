/**
 * Verification query: pull the most-recent slack_interactions row and
 * print every field the user listed in the audit checklist:
 *   deal_id, sf_field, suggested_value, action_id,
 *   Slack user ID/name, message timestamp, raw payload (truncated).
 *
 * Also prints the row UUID so it can be referenced.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .split("\n")
  .reduce((a, l) => {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) a[m[1]] = m[2];
    return a;
  }, {});

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const total = await client.query(
    "SELECT count(*)::int AS c FROM slack_interactions",
  );
  console.log(`\nTotal rows in slack_interactions: ${total.rows[0].c}`);

  if (total.rows[0].c === 0) {
    console.log("(no rows yet — click a button in Slack)");
    process.exit(0);
  }

  const result = await client.query(
    `SELECT
       id,
       slack_user_id, slack_user_name,
       action_id, status,
       rule_id, alert_severity, deal_name, deal_id,
       sf_field, suggested_value, triggered_at_call,
       message_ts, channel_id, created_at,
       jsonb_pretty(raw_payload) AS raw_payload_pretty
     FROM slack_interactions
     ORDER BY created_at DESC
     LIMIT 3`,
  );

  for (const [idx, row] of result.rows.entries()) {
    console.log(`\n────────── Row ${idx + 1} ──────────`);
    console.log(`UUID                : ${row.id}`);
    console.log(`created_at          : ${row.created_at.toISOString()}`);
    console.log(`Slack user ID       : ${row.slack_user_id}`);
    console.log(`Slack user name     : ${row.slack_user_name ?? "(null)"}`);
    console.log(`action_id           : ${row.action_id}`);
    console.log(`status              : ${row.status}`);
    console.log(`rule_id             : ${row.rule_id}`);
    console.log(`alert_severity      : ${row.alert_severity}`);
    console.log(`deal_name           : ${row.deal_name ?? "(null)"}`);
    console.log(`deal_id             : ${row.deal_id ?? "(null)"}`);
    console.log(`sf_field            : ${row.sf_field ?? "(null)"}`);
    console.log(`suggested_value     : ${row.suggested_value ?? "(null)"}`);
    console.log(`triggered_at_call   : ${row.triggered_at_call ?? "(null)"}`);
    console.log(`message_ts          : ${row.message_ts}`);
    console.log(`channel_id          : ${row.channel_id ?? "(null)"}`);
    const rp = row.raw_payload_pretty ?? "(null)";
    const rpTruncated = rp.length > 800 ? rp.slice(0, 800) + "\n  ... [truncated]" : rp;
    console.log(`raw_payload         :\n${rpTruncated}`);
  }

  console.log("\n────────── Confirm-rate by sf_field ──────────");
  const byField = await client.query(`
    SELECT
      sf_field,
      count(*) FILTER (WHERE status = 'confirmed_pending_apply')   AS confirms,
      count(*) FILTER (WHERE status = 'dismissed_with_correction') AS dismisses,
      count(*)                                                     AS total
    FROM slack_interactions
    WHERE sf_field IS NOT NULL
    GROUP BY sf_field
    ORDER BY total DESC
  `);
  if (byField.rows.length === 0) {
    console.log("(no rows with sf_field set — alerts may be missing the primary field)");
  } else {
    for (const r of byField.rows) {
      const rate = r.total > 0 ? ((r.confirms / r.total) * 100).toFixed(1) : "n/a";
      console.log(
        `  ${r.sf_field}: ${r.confirms}/${r.total} confirmed (${rate}%) · ${r.dismisses} dismissed`,
      );
    }
  }
} finally {
  await client.end();
}
