/**
 * One-shot cleanup: delete every rep note on a given deal using the real
 * DELETE /api/notes/[id] endpoint. Authenticates via the saved Playwright
 * storageState (same auth contract as the recording scripts).
 *
 * Usage:
 *   node scripts/decks/cleanup-notes.mjs <dealId>
 *
 * Defaults to John's Olive & June deal if no dealId is passed.
 *
 * No database access, no service-role keys — calls the same HTTP API the
 * UI would call. Idempotent.
 */
import { chromium } from "playwright";
import { authStatePath } from "./_auth.mjs";

const DEAL_ID =
  process.argv[2] || "f030dad2-0951-4669-adb2-343c1f6e5ca5";
const BASE = "https://mallin.io";

const storageState = authStatePath();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState });
const page = await context.newPage();

// We need to ride the same browser session so Clerk cookies flow with
// the fetch. Pop a blank page, then use page.evaluate to make the calls.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

const listResp = await page.evaluate(async ({ base, dealId }) => {
  const r = await fetch(
    `${base}/api/notes?opportunityId=${encodeURIComponent(dealId)}`,
    { credentials: "include" },
  );
  return { status: r.status, body: await r.json().catch(() => null) };
}, { base: BASE, dealId: DEAL_ID });

if (listResp.status !== 200 || !listResp.body?.ok) {
  console.error(
    `✗ Could not list notes (status ${listResp.status}):`,
    listResp.body,
  );
  await browser.close();
  process.exit(1);
}

const notes = listResp.body.notes ?? [];
console.log(`→ Found ${notes.length} note(s) on deal ${DEAL_ID}`);

let deleted = 0;
for (const n of notes) {
  const del = await page.evaluate(async ({ base, id }) => {
    const r = await fetch(`${base}/api/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { base: BASE, id: n.id });

  if (del.status === 200 && del.body?.ok) {
    deleted += 1;
    const preview = (n.body ?? "").slice(0, 60);
    console.log(`  ✓ deleted ${n.id} — "${preview}${(n.body ?? "").length > 60 ? "…" : ""}"`);
  } else {
    console.warn(
      `  · failed to delete ${n.id} (status ${del.status}):`,
      del.body,
    );
  }
}

console.log(`\n→ Done. Deleted ${deleted}/${notes.length}.`);
await browser.close();
