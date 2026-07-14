/**
 * Captures the 12 Arcade-walkthrough screenshots of the /prep cockpit.
 * Each screenshot maps 1:1 to a tooltip in TOOLTIPS.md.
 *
 * Output: docs/landing-concepts/assets/cockpit-arcade-screens/NN-<slug>.png
 *
 * Auth contract: see _auth.mjs. Requires storageState.json. If missing,
 * fails fast with the save-auth-state.mjs instruction.
 *
 * Viewport is 1440x800 @ devicePixelRatio 2 → 2880x1600 PNGs. Matches
 * Arcade's default canvas; uploads render edge-to-edge without scaling.
 *
 * Re-run anytime the cockpit UI changes — Arcade lets you swap individual
 * screenshots without rebuilding the demo.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { authStatePath } from "./_auth.mjs";

const outDir = resolve(
  process.cwd(),
  "docs/landing-concepts/assets/cockpit-arcade-screens",
);
mkdirSync(outDir, { recursive: true });

const storageState = authStatePath();

const DEAL_ID = "f030dad2-0951-4669-adb2-343c1f6e5ca5";
const cockpitUrl = `https://mallin.io/prep?dealId=${DEAL_ID}`;

const VIEWPORT = { width: 1440, height: 800 };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState,
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

console.log("→ Navigating to cockpit…");
await page.goto(cockpitUrl, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(3500);
if (!page.url().includes("/prep")) {
  console.error("✗ Did not land on /prep — auth state likely stale.");
  console.error("  Re-run: node scripts/decks/save-auth-state.mjs");
  await browser.close();
  process.exit(1);
}
console.log(`  Landed: ${page.url()}`);

// ── Helpers ──────────────────────────────────────────────────────────

async function smoothScrollTo(targetY, durationMs = 800) {
  await page.evaluate(
    ({ targetY, durationMs }) => {
      const startY = window.scrollY;
      const delta = targetY - startY;
      const startTime = performance.now();
      function ease(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      }
      return new Promise((resolve) => {
        function step(now) {
          const t = Math.min((now - startTime) / durationMs, 1);
          window.scrollTo(0, startY + delta * ease(t));
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
    },
    { targetY, durationMs },
  );
  await page.waitForTimeout(300);
}

async function snap(n, slug) {
  const num = String(n).padStart(2, "0");
  const filename = `${num}-${slug}.png`;
  const path = resolve(outDir, filename);
  await page.screenshot({ path, fullPage: false });
  console.log(`  ✓ ${filename}`);
}

async function clickChip(label) {
  const chip = page.locator(`button:has-text("+ ${label}")`).first();
  if ((await chip.count()) === 0) {
    console.log(`  · chip "${label}" not found — skipping`);
    return false;
  }
  await chip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await chip.click();
  return true;
}

async function restoreSection(label) {
  const eye = page
    .locator(`button[aria-label="Hide ${label} section"]`)
    .first();
  if ((await eye.count()) === 0) return false;
  await eye.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await eye.click({ force: true });
  await page.waitForTimeout(300);
  return true;
}

// ── Captures ─────────────────────────────────────────────────────────

console.log("\n[1] hero");
await page.waitForTimeout(800);
await smoothScrollTo(0, 400);
await snap(1, "hero");

console.log("\n[2] recent events expanded");
await clickChip("Recent events");
await page.waitForTimeout(900);
const re = page
  .locator('button[aria-label="Hide Recent events section"]')
  .first();
if (await re.count()) await re.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await snap(2, "recent-events");
await restoreSection("Recent events");

console.log("\n[3] strategic priorities expanded");
await clickChip("Strategic priorities");
await page.waitForTimeout(900);
const sp = page
  .locator('button[aria-label="Hide Strategic priorities section"]')
  .first();
if (await sp.count()) await sp.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await snap(3, "strategic-priorities");
await restoreSection("Strategic priorities");

console.log("\n[4] in the room expanded");
await clickChip("In the room");
await page.waitForTimeout(900);
const itr = page
  .locator('button[aria-label="Hide In the room section"]')
  .first();
if (await itr.count()) await itr.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await snap(4, "in-the-room");
await restoreSection("In the room");

console.log("\n[5] competitive context expanded");
await clickChip("Competitive context");
await page.waitForTimeout(900);
const cc = page
  .locator('button[aria-label="Hide Competitive context section"]')
  .first();
if (await cc.count()) await cc.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await snap(5, "competitive-context");
await restoreSection("Competitive context");

console.log("\n[6] walking in expanded");
await clickChip("Walking in");
await page.waitForTimeout(900);
const wi = page
  .locator('button[aria-label="Hide Walking in section"]')
  .first();
if (await wi.count()) await wi.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await snap(6, "walking-in");
await restoreSection("Walking in");

console.log("\n[7] notes trigger visible");
await smoothScrollTo(900, 700);
await page.waitForTimeout(600);
const addNote = page.locator('button:has-text("Add note")').first();
if (await addNote.count()) {
  await addNote.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
}
await snap(7, "notes-trigger");

console.log("\n[8] notes composer mid-type");
if (await addNote.count()) {
  await addNote.click();
  await page.waitForTimeout(800);
  const textarea = page.locator("textarea").first();
  if (await textarea.count()) {
    await textarea.click();
    await textarea.fill("");
    await textarea.type(
      "Talked to Cara — confirmed Heritage IT not formally engaged yet.",
      { delay: 25 },
    );
    await page.waitForTimeout(400);
    await snap(8, "notes-composer");

    console.log("\n[9] note saved");
    // Finish the note then save
    await textarea.type(
      " Need to land before holiday 2026 deadline.",
      { delay: 25 },
    );
    await page.waitForTimeout(400);
    const save = page.locator('button:has-text("Save")').first();
    if (await save.count()) {
      await save.click();
      await page.waitForTimeout(1800);
    }
    await snap(9, "note-saved");
  } else {
    console.log("  · textarea not found — skipping 8 & 9");
  }
} else {
  console.log("  · Add note trigger not found — skipping 8 & 9");
}

console.log("\n[10] coach trigger visible");
await smoothScrollTo(1700, 800);
await page.waitForTimeout(700);
const coachTrigger = page.locator('button:has-text("Coach")').first();
if (await coachTrigger.count()) {
  await coachTrigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
}
await snap(10, "coach-trigger");

console.log("\n[11] coach question typed");
if (await coachTrigger.count()) {
  await coachTrigger.click();
  await page.waitForTimeout(1000);
  const coachInput = page.locator("textarea").last();
  if (await coachInput.count()) {
    await coachInput.click();
    await coachInput.fill("");
    await coachInput.type(
      "What's the strongest opening for the Wednesday follow-up call?",
      { delay: 25 },
    );
    await page.waitForTimeout(500);
    await snap(11, "coach-question");

    console.log("\n[12] coach response (waiting for stream)…");
    await coachInput.press("Enter");
    // Wait for streaming response. Cap at 25s.
    const response = page
      .locator(
        '[class*="turnAssistant"], [class*="streaming"], [data-role="assistant"]',
      )
      .first();
    await response.waitFor({ timeout: 25000 }).catch(() => {
      console.log("  · streaming locator timed out; capturing anyway");
    });
    // Give the stream a few seconds to fill in
    await page.waitForTimeout(7000);
    await snap(12, "coach-response");
  } else {
    console.log("  · coach textarea not found — skipping 11 & 12");
  }
} else {
  console.log("  · Coach trigger not found — skipping 11 & 12");
}

console.log("\n→ Done.");
console.log(`✓ Screenshots in ${outDir}`);
console.log("  Next: drag them into Arcade in numeric order.");
await context.close();
await browser.close();
