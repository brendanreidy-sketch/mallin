/**
 * One-time interactive sign-in → saves Playwright auth state.
 *
 * Run this ONCE (or whenever the session expires). It opens a real Chromium
 * window, lets you sign in however you want (Clerk email code, ticket URL,
 * Google SSO when enabled), waits until you land on /prep, then persists
 * cookies + localStorage to ./scripts/decks/storageState.json.
 *
 * All recording scripts (record-cockpit-full-tour.mjs etc.) load that file
 * via context options — no ticket-minting per run.
 *
 * Sessions last as long as Clerk's cookie lifetime (typically 7 days, refreshed
 * on use). Re-run this script when recordings start landing on /sign-in again.
 *
 * Usage:
 *   node scripts/decks/save-auth-state.mjs [profile]
 *
 *   profile defaults to "default". Use named profiles when you want multiple
 *   saved sessions (e.g. "john", "dimitrie", "test-user").
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const profile = process.argv[2] || "default";
const outPath = resolve(
  process.cwd(),
  profile === "default"
    ? "scripts/decks/storageState.json"
    : `scripts/decks/storageState-${profile}.json`,
);

console.log(`→ Auth profile: ${profile}`);
console.log(`→ Will save to: ${outPath}`);
if (existsSync(outPath)) {
  console.log(`⚠ Existing file will be overwritten on save.`);
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();

await page.goto("https://mallin.io/sign-in", { waitUntil: "domcontentloaded" });

console.log("");
console.log("┌─────────────────────────────────────────────────────────────┐");
console.log("│  Sign in in the browser window however you prefer:         │");
console.log("│    · email code                                            │");
console.log("│    · Google SSO (when enabled)                             │");
console.log("│    · paste a one-click ticket URL into the address bar     │");
console.log("│                                                            │");
console.log("│  Once you see /prep load fully, this script will detect    │");
console.log("│  it and save the session automatically.                    │");
console.log("└─────────────────────────────────────────────────────────────┘");
console.log("");

// Poll for the authenticated landing URL. /prep or /dashboard count as signed-in.
// 5-minute window — plenty for the user to walk through email code flow.
const DEADLINE = Date.now() + 5 * 60_000;
while (Date.now() < DEADLINE) {
  const url = page.url();
  if (url.includes("/prep") || url.includes("/dashboard")) {
    console.log(`✓ Detected authenticated route: ${url}`);
    // Give the cockpit a beat to finish setting any post-login cookies
    await page.waitForTimeout(2000);
    break;
  }
  await page.waitForTimeout(1000);
}

if (Date.now() >= DEADLINE) {
  console.error("✗ Timed out waiting for sign-in. Nothing saved.");
  await browser.close();
  process.exit(1);
}

await context.storageState({ path: outPath });
console.log(`✓ Auth state saved to ${outPath}`);
console.log("  Use it from any recording script:");
console.log(`    const context = await browser.newContext({`);
console.log(`      storageState: "${outPath.replace(process.cwd() + "/", "")}",`);
console.log(`      viewport, recordVideo,`);
console.log(`    });`);

await browser.close();
