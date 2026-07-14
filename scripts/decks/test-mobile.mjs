/**
 * Mobile rendering check — emulates iPhone 14 Pro, takes screenshots of:
 *   1. Sign-in page (no auth context; we want the raw sign-in flow)
 *   2. Authenticated cockpit (uses saved Playwright auth state)
 * Lets us see what Dimitrie sees on his phone.
 *
 * Auth contract: see _auth.mjs. If storageState.json is missing, fails fast
 * and tells you to run save-auth-state.mjs.
 *
 * Note: Clerk session cookies are domain-scoped, not UA-scoped — the saved
 * desktop state authenticates the iPhone-emulated context just fine.
 */
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { authStatePath } from "./_auth.mjs";

const outDir = "./docs/landing-concepts/assets/mobile-check";
mkdirSync(outDir, { recursive: true });

const storageState = authStatePath();
const iPhone = devices["iPhone 14 Pro"];

const browser = await chromium.launch({ headless: true });

// 1. Sign-in page — no auth state (want the unauthenticated mobile view)
const anonCtx = await browser.newContext({ ...iPhone });
const anonPage = await anonCtx.newPage();
console.log("=== 1. Mobile sign-in page ===");
await anonPage.goto("https://mallin.io/sign-in", { waitUntil: "networkidle", timeout: 30000 });
await anonPage.waitForTimeout(2500);
await anonPage.screenshot({ path: `${outDir}/01-signin-mobile.png`, fullPage: true });
console.log(`  ✓ saved ${outDir}/01-signin-mobile.png`);
await anonCtx.close();

// 2. Cockpit — authenticated via saved state
const authCtx = await browser.newContext({ ...iPhone, storageState });
const page = await authCtx.newPage();
console.log("\n=== 2. Authenticated cockpit (saved auth state) ===");
const cockpitUrl =
  "https://mallin.io/prep?dealId=f030dad2-0951-4669-adb2-343c1f6e5ca5";
await page.goto(cockpitUrl, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(3500);
console.log(`  Current URL: ${page.url()}`);
if (!page.url().includes("/prep")) {
  console.error("✗ Did not land on /prep — auth state likely stale.");
  console.error("  Re-run: node scripts/decks/save-auth-state.mjs");
  await browser.close();
  process.exit(1);
}
await page.screenshot({ path: `${outDir}/02-cockpit-mobile-top.png`, fullPage: false });

await page.evaluate(() => window.scrollTo(0, 800));
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/03-cockpit-mobile-mid.png`, fullPage: false });

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/04-cockpit-mobile-full.png`, fullPage: true });
console.log(`  ✓ cockpit screenshots saved`);

await browser.close();
console.log(`\n✓ All screenshots in ${outDir}`);
