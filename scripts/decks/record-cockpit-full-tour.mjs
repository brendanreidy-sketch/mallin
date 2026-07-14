/**
 * Cockpit brief showcase recording:
 *   1. Load saved Playwright auth state → already-signed-in browser context.
 *      Re-run save-auth-state.mjs when the session expires (~7 days).
 *   2. Navigate to /prep?dealId=<John's deal>
 *   3. Hero hold (Primary Decision Focus + greeting visible)
 *   4. Chip expand + restore loop — the differentiated moment
 *      (Recent events → Strategic priorities → In the room →
 *       Competitive context → Walking in)
 *   5. Scroll to closer
 *
 * Auth contract: see _auth.mjs. No ticket fallback. If storageState.json
 * is missing or stale, the script fails fast and tells you to re-save.
 *
 * Notes + Coach beats removed by design — they require interaction with
 * persistent state (prior notes, prior coach threads) that we can't
 * reliably clear, and they pull focus from the brief itself which is
 * the actual value-prop moment.
 *
 * Outputs .webm to docs/landing-concepts/assets/cockpit-full-tour/
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { authStatePath } from "./_auth.mjs";

const outDir = "./docs/landing-concepts/assets/cockpit-full-tour";
mkdirSync(outDir, { recursive: true });

// --anon: skip storageState. Used for the demo cockpit (DEMO_ALLOWED_DEAL_IDS),
// which renders to anonymous visitors but hits a tenant-ownership gate when
// signed in. For the marketing video, anon = what a prospect sees = right.
const anon = process.argv.includes("--anon");

const DEAL_ID = "f030dad2-0951-4669-adb2-343c1f6e5ca5";
const cockpitUrl = `https://mallin.io/prep?dealId=${DEAL_ID}`;

const VIEWPORT = { width: 1280, height: 800 };
const browser = await chromium.launch({ headless: true });
const contextOpts = {
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  recordVideo: { dir: outDir, size: VIEWPORT },
};
if (anon) {
  console.log("→ Anonymous mode (no storageState)");
} else {
  contextOpts.storageState = authStatePath();
}
const context = await browser.newContext(contextOpts);
const page = await context.newPage();

console.log("→ Navigating to cockpit…");
await page.goto(cockpitUrl, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(3500);
console.log(`  Landed: ${page.url()}`);
if (!page.url().includes("/prep")) {
  console.error("✗ Did not land on /prep — auth state likely stale.");
  console.error("  Re-run: node scripts/decks/save-auth-state.mjs");
  await browser.close();
  process.exit(1);
}

// Wait for chip drawer to actually render (not just URL to settle).
const firstChip = page.locator('button:has-text("+ Recent events")').first();
await firstChip
  .waitFor({ timeout: 15000, state: "visible" })
  .catch(() => {
    console.warn("  ⚠ chip drawer didn't appear in 15s — proceeding anyway");
  });

// Debug: dump what the page looks like so we can see if rendering broke.
await page.screenshot({
  path: "./docs/landing-concepts/assets/cockpit-full-tour/_debug-initial.png",
  fullPage: true,
});
const chipCount = await firstChip.count();
console.log(`  · first chip count: ${chipCount}`);
console.log(`  · debug screenshot: _debug-initial.png`);

await page.waitForTimeout(1500);

// ── Helpers ──────────────────────────────────────────────────────────

async function smoothScrollTo(targetY, durationMs) {
  await page.evaluate(({ targetY, durationMs }) => {
    const startY = window.scrollY;
    const delta = targetY - startY;
    const startTime = performance.now();
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    return new Promise((resolve) => {
      function step(now) {
        const t = Math.min((now - startTime) / durationMs, 1);
        window.scrollTo(0, startY + delta * ease(t));
        if (t < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }, { targetY, durationMs });
}

async function clickChip(label) {
  const chip = page.locator(`button:has-text("+ ${label}")`).first();
  if (await chip.count() === 0) {
    console.log(`  · chip "${label}" not found`);
    return false;
  }
  await chip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await chip.click();
  console.log(`  ✓ expanded: ${label}`);
  return true;
}

async function restoreSection(label) {
  const eye = page.locator(`button[aria-label="Hide ${label} section"]`).first();
  if (await eye.count() === 0) {
    console.log(`  · restore button for "${label}" not found`);
    return false;
  }
  await eye.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await eye.click({ force: true });
  console.log(`  ✓ restored: ${label}`);
  return true;
}

// ── BEAT 1: Hero hold ────────────────────────────────────────────────
console.log("\n[Beat 1] Hero hold");
await page.waitForTimeout(2200);

// ── BEAT 2: Scroll to chip drawer ────────────────────────────────────
console.log("\n[Beat 2] Scroll to chip drawer");
await smoothScrollTo(420, 1500);
await page.waitForTimeout(1200);

// ── BEAT 3: Chip loop — expand, read, restore, next ──────────────────
console.log("\n[Beat 3] Chip expand+restore loop");
const chips = [
  "Recent events",
  "Strategic priorities",
  "In the room",
  "Competitive context",
  "Walking in",
];
for (const label of chips) {
  const drawer = page.locator(`button:has-text("+ ${label}")`).first();
  if (await drawer.count() > 0) {
    await drawer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  }
  await clickChip(label);
  await page.waitForTimeout(2400); // hold so viewer reads
  await restoreSection(label);
  await page.waitForTimeout(900);
}

// ── BEAT 4: Scroll to closer ─────────────────────────────────────────
console.log("\n[Beat 4] Closer");
const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
await smoothScrollTo(totalHeight, 3000);
await page.waitForTimeout(2200);

console.log("\n→ Recording done");
await context.close();
await browser.close();
console.log(`✓ Video saved to ${outDir}`);
