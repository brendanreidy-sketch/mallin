/**
 * Founder usage snapshot — who signed up, and are they using it.
 *
 *   npm run metrics
 *   (or: npx tsx --env-file=.env.local scripts/metrics/usage.ts)
 *
 * Read-only. Excludes demo tenants. The number that matters is ACTIVATION:
 * signed up → built at least one brief (the signup → first-brief funnel).
 * "Cold" = signed up but never produced a brief — that's where the risk is.
 *
 * `plan` / conversions show once migration 016 (billing) is applied; until
 * then the script degrades gracefully.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set — run with: npx tsx --env-file=.env.local scripts/metrics/usage.ts");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

function day(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}
function ago(d: Date | null): string {
  if (!d) return "never";
  const h = (Date.now() - new Date(d).getTime()) / 3.6e6;
  if (h < 1) return "just now";
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

async function main() {
  await client.connect();

  const cols = (
    await client.query(
      `select column_name from information_schema.columns where table_name = 'tenants'`,
    )
  ).rows.map((r) => r.column_name as string);
  const hasPlan = cols.includes("plan");
  const hasCreated = cols.includes("created_at");
  const hasDomain = cols.includes("email_domain");

  const planSel = hasPlan ? "t.plan" : "'—'::text as plan";
  const createdSel = hasCreated ? "t.created_at" : "null::timestamptz as created_at";
  const domainSel = hasDomain ? "t.email_domain, t.utm_source" : "null::text as email_domain, null::text as utm_source";
  const orderBy = hasCreated
    ? "t.created_at DESC NULLS LAST"
    : "max(o.last_activity_at) DESC NULLS LAST";

  const { rows } = await client.query(`
    SELECT
      t.id, t.name, ${planSel}, ${createdSel}, ${domainSel},
      count(distinct o.id) AS deals,
      count(distinct o.id) FILTER (WHERE ea.opportunity_id IS NOT NULL) AS briefed,
      max(o.last_activity_at) AS last_activity,
      count(distinct date(o.last_activity_at)) AS active_days
    FROM tenants t
    LEFT JOIN opportunities o ON o.tenant_id = t.id
    LEFT JOIN (
      SELECT DISTINCT opportunity_id FROM execution_artifacts WHERE is_current
    ) ea ON ea.opportunity_id = o.id
    WHERE t.is_demo = false${hasPlan ? " AND t.plan IN ('free', 'pro')" : ""}
    GROUP BY t.id
    ORDER BY ${orderBy}
  `);

  const total = rows.length;
  const activated = rows.filter((r) => Number(r.briefed) > 0).length;
  const cold = total - activated;
  const returners = rows.filter((r) => Number(r.active_days) >= 2).length;
  const pro = hasPlan ? rows.filter((r) => r.plan === "pro").length : 0;
  const last7 = hasCreated
    ? rows.filter((r) => r.created_at && Date.now() - new Date(r.created_at).getTime() < 7 * 864e5).length
    : null;

  console.log(
    `\n  MALLIN — usage snapshot  (${hasPlan ? "B2C self-serve only — free + pro" : "excludes demo tenants"})\n`,
  );
  console.log(`  Signups (all-time):  ${total}`);
  if (last7 !== null) console.log(`  Signups (last 7d):   ${last7}`);
  console.log(`  Activated (≥1 brief): ${activated}   ·   Cold (0 briefs): ${cold}`);
  console.log(`  Returners (2+ days):  ${returners}`);
  if (hasPlan) console.log(`  Pro (paying):         ${pro}`);
  if (!hasPlan) console.log(`  (plan/conversions appear once migration 016 is applied)`);

  if (hasDomain) {
    // Team-formation signal: 2+ signups from one domain = a B2B/pilot forming.
    const domainCounts = new Map<string, number>();
    const srcCounts = new Map<string, number>();
    for (const r of rows) {
      if (r.email_domain) domainCounts.set(r.email_domain, (domainCounts.get(r.email_domain) ?? 0) + 1);
      const sKey = r.utm_source || "direct/unknown";
      srcCounts.set(sKey, (srcCounts.get(sKey) ?? 0) + 1);
    }
    const teams = [...domainCounts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
    const sources = [...srcCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(
      `  Team signals:         ${teams.length ? teams.map(([d, n]) => `${d} (${n})`).join(", ") : "none yet (2+ signups from one domain = a team forming)"}`,
    );
    console.log(`  Top sources:          ${sources.map(([sN, n]) => `${sN}:${n}`).join("  ·  ") || "—"}`);
  }

  console.log("\n  " + pad("WHO", 26) + pad("SIGNED UP", 12) + pad("DEALS", 7) + pad("BRIEFED", 9) + pad("DAYS", 6) + "LAST SEEN");
  console.log("  " + "─".repeat(72));
  for (const r of rows) {
    const who = (r.name as string) || "—";
    console.log(
      "  " +
        pad(who, 26) +
        pad(day(r.created_at), 12) +
        pad(String(r.deals), 7) +
        pad(String(r.briefed), 9) +
        pad(String(r.active_days), 6) +
        ago(r.last_activity),
    );
  }
  console.log("");

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
