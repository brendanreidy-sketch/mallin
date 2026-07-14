// One-time migration: move intelligence touches (legacy shortcut)
// to the proper public_signals table.
//
// Old shape (touches table, source_system="intelligence_web_sweep"):
//   subject: "Intelligence sweep — <type>"
//   body: "<summary>\n\nImplication for the rep: <impl>\n\nSource: <url>  ·  Confidence: <conf>"
//
// New shape (public_signals table):
//   summary: "<summary>\n\nImplication: <impl>"
//   source_url: <url>
//   source: derived from URL host
//
// Idempotent: skips touches that already have a matching signal by
// source_external_id. Deletes the touch after successful migration.

import { Client } from "pg";
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = await c.query(`
  SELECT id, tenant_id, account_id, opportunity_id, body, source_external_id, occurred_at
  FROM touches
  WHERE source_system = 'intelligence_web_sweep'
`);
console.log(`found ${r.rows.length} legacy intelligence touches`);

function deriveSource(url) {
  if (!url) return "other";
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("sec.gov")) return "sec_edgar";
  if (u.includes("crunchbase.com")) return "crunchbase";
  if (u.includes("prnewswire.com") || u.includes("businesswire.com") || u.includes("globenewswire.com")) return "press_release";
  if (
    u.includes("techcrunch.com") || u.includes("reuters.com") ||
    u.includes("bloomberg.com") || u.includes("wsj.com") ||
    u.includes("cnbc.com") || u.includes("ft.com")
  ) return "news";
  return "other";
}

let migrated = 0;
let skipped = 0;
for (const t of r.rows) {
  // Parse the legacy body format
  const summaryPart = t.body.split("\n\n")[0] ?? t.body;
  const implMatch = t.body.match(/Implication for the rep:\s*([\s\S]*?)(?:\n\n|$)/);
  const srcMatch = t.body.match(/Source:\s*(\S+)/);
  const implication = implMatch?.[1]?.trim();
  const sourceUrl = srcMatch?.[1];

  const newSummary = implication
    ? `${summaryPart}\n\nImplication: ${implication}`
    : summaryPart;
  const newExternalId = `migrated_${t.source_external_id}`;
  const source = deriveSource(sourceUrl);

  // Idempotency check
  const exists = await c.query(
    `SELECT id FROM public_signals WHERE tenant_id=$1 AND source_external_id=$2`,
    [t.tenant_id, newExternalId],
  );
  if (exists.rows.length > 0) {
    skipped++;
    continue;
  }

  // Insert into public_signals
  const ins = await c.query(
    `INSERT INTO public_signals
       (tenant_id, account_id, summary, observed_at, source, source_system, source_external_id, source_url)
     VALUES ($1, $2, $3, $4, $5, 'intelligence_web_sweep', $6, $7)
     RETURNING id`,
    [t.tenant_id, t.account_id, newSummary, t.occurred_at, source, newExternalId, sourceUrl],
  );
  console.log(`  migrated ${t.source_external_id} -> signal ${ins.rows[0].id} (source=${source})`);

  // Delete the legacy touch
  await c.query(`DELETE FROM touches WHERE id=$1`, [t.id]);
  migrated++;
}

console.log(`\nmigrated: ${migrated}, skipped (already migrated): ${skipped}`);
await c.end();
