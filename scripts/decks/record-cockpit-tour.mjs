/**
 * Records a smooth scroll-through of any Mallin cockpit URL.
 * Outputs a .webm video that can be uploaded or converted to mp4.
 *
 * Usage:
 *   node scripts/decks/record-cockpit-tour.mjs <url> <output-dir>
 *
 * Default URL is the public Olive & June share route, but the script also
 * works against authenticated routes (e.g. /prep?dealId=...) because every
 * deck script loads saved Playwright auth state per the shared contract.
 *
 * Auth contract: see _auth.mjs. If storageState.json is missing, fails fast
 * and tells you to run save-auth-state.mjs.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { authStatePath } from "./_auth.mjs";

const url =
  process.argv[2] ||
  "https://mallin.io/share/000f32b2-2499-420f-add0-1c125f622ad6";
const outDir = process.argv[3] || "./docs/landing-concepts/assets/cockpit-tour";

mkdirSync(outDir, { recursive: true });

const storageState = authStatePath();

// Viewport sized for a landing-page hero video (16:9, large enough to read)
const VIEWPORT = { width: 1440, height: 900 };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState,
  viewport: VIEWPORT,
  deviceScaleFactor: 2, // retina-quality output
  recordVideo: {
    dir: outDir,
    size: VIEWPORT,
  },
});
const page = await context.newPage();

console.log(`→ Loading ${url}`);
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800); // settle

// Smooth scroll script — drives window.scrollTo with eased steps
async function smoothScrollTo(targetY, durationMs) {
  await page.evaluate(
    async ({ targetY, durationMs }) => {
      const startY = window.scrollY;
      const delta = targetY - startY;
      const startTime = performance.now();
      function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
      return new Promise((resolve) => {
        function step(now) {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / durationMs, 1);
          window.scrollTo(0, startY + delta * ease(t));
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
    },
    { targetY, durationMs },
  );
}

// Find total scrollable height
const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
console.log(`→ Total scroll height: ${totalHeight}px`);

// Beat 1: Land on the hero, hold ~2.5s
console.log("Beat 1: hero hold");
await page.waitForTimeout(2500);

// Beat 2: Scroll to ~25% (account profile + one-line) over 3s, hold 2s
console.log("Beat 2: scrolling to one-line + facts");
await smoothScrollTo(totalHeight * 0.18, 3000);
await page.waitForTimeout(2000);

// Beat 3: Scroll to ~40% (recent events) over 3.5s, hold 2.5s
console.log("Beat 3: scrolling to recent events");
await smoothScrollTo(totalHeight * 0.38, 3500);
await page.waitForTimeout(2500);

// Beat 4: Scroll to ~60% (stakeholders) over 3s, hold 2s
console.log("Beat 4: scrolling to stakeholders");
await smoothScrollTo(totalHeight * 0.58, 3000);
await page.waitForTimeout(2000);

// Beat 5: Scroll to ~78% (competitive context / walking in) over 3s, hold 2s
console.log("Beat 5: scrolling to walking-in");
await smoothScrollTo(totalHeight * 0.78, 3000);
await page.waitForTimeout(2000);

// Beat 6: Scroll to end (footer / branding), hold 2s
console.log("Beat 6: scrolling to closer");
await smoothScrollTo(totalHeight, 2500);
await page.waitForTimeout(2000);

console.log("→ Done. Closing & saving video…");
await context.close();
await browser.close();

console.log(`✓ Video saved to ${outDir}`);
