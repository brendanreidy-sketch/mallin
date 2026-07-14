/**
 * Records an INTERACTIVE scroll-through of the /prep cockpit:
 *   - Uses saved Playwright auth state (no ticket minting)
 *   - Lands on the real cockpit (with progressive-disclosure chips)
 *   - Opens each chip in sequence, pausing on each expanded section
 *   - Scrolls smoothly through, ending on the closer
 *
 * Usage:
 *   node scripts/decks/record-cockpit-interactive.mjs <output-dir>
 *
 * Auth contract: see _auth.mjs. If storageState.json is missing, fails fast
 * and tells you to run save-auth-state.mjs.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { authStatePath } from "./_auth.mjs";

const outDir = process.argv[2] || "./docs/landing-concepts/assets/cockpit-tour-v2";
mkdirSync(outDir, { recursive: true });

const storageState = authStatePath();

const DEAL_ID = "f030dad2-0951-4669-adb2-343c1f6e5ca5"; // John's Olive & June opp
const cockpitUrl = `https://mallin.io/prep?dealId=${DEAL_ID}`;

// Smaller viewport → larger-feeling text. 1280x800 is sales-demo sweet spot.
const VIEWPORT = { width: 1280, height: 800 };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState,
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  recordVideo: { dir: outDir, size: VIEWPORT },
});
const page = await context.newPage();

console.log("→ Navigating to cockpit…");
await page.goto(cockpitUrl, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(3000);

const currentUrl = page.url();
console.log(`→ Current URL: ${currentUrl}`);
if (!currentUrl.includes("/prep")) {
  console.error("✗ Did not land on /prep — auth state likely stale.");
  console.error("  Re-run: node scripts/decks/save-auth-state.mjs");
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(2500); // let cockpit substrate fully render

// Smooth scroll helper
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

// Click a chip by its label, returns true if clicked
async function clickChip(label) {
  const sel = `button:has-text("+ ${label}")`;
  const chip = page.locator(sel).first();
  if (await chip.count() === 0) {
    console.log(`  · chip "${label}" not visible — skipping`);
    return false;
  }
  await chip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await chip.click();
  console.log(`  ✓ expanded: ${label}`);
  return true;
}

// === Recording beats ===

// Beat 1: hero hold — let viewer see "Hi <name>" greeting + Primary Decision Focus
console.log("Beat 1: top of cockpit");
await page.waitForTimeout(2500);

// Beat 2: scroll down a touch so the chip drawer is visible
console.log("Beat 2: scroll to chip drawer");
await smoothScrollTo(450, 1800);
await page.waitForTimeout(1800);

// Beat 3: expand "Recent events" — most info-rich chip
console.log("Beat 3: expand Recent events");
await clickChip("Recent events");
await page.waitForTimeout(800);
// Scroll the newly-expanded section into view
await smoothScrollTo(700, 1500);
await page.waitForTimeout(3000); // hold so viewer reads

// Beat 4: expand "In the room" — stakeholders
console.log("Beat 4: expand In the room");
// Scroll down to find the chip
await smoothScrollTo(1200, 1500);
await clickChip("In the room");
await page.waitForTimeout(800);
await smoothScrollTo(1500, 1200);
await page.waitForTimeout(3000);

// Beat 5: expand "Strategic priorities" if visible
console.log("Beat 5: expand Strategic priorities");
await clickChip("Strategic priorities");
await page.waitForTimeout(800);
await smoothScrollTo(2200, 1500);
await page.waitForTimeout(2500);

// Beat 6: smooth scroll through the rest to closer
console.log("Beat 6: scroll to closer");
const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
await smoothScrollTo(totalHeight, 3500);
await page.waitForTimeout(2500);

console.log("→ Recording done");
await context.close();
await browser.close();
console.log(`✓ Video saved to ${outDir}`);
