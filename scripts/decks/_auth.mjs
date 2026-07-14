/**
 * Shared auth-state contract for every script in scripts/decks/.
 *
 * Contract (per doctrine `playwright_auth_state_doctrine.md`):
 *   - load storageState.json (or storageState-<profile>.json)
 *   - if missing → explicit fail telling the operator to run save-auth-state
 *   - no silent ticket fallback
 *   - no Clerk-specific auth logic inside deck scripts (lives only here +
 *     save-auth-state.mjs)
 *
 * Usage:
 *   import { authStatePath } from "./_auth.mjs";
 *   const storageState = authStatePath();                 // default profile
 *   const storageState = authStatePath("dimitrie");       // named profile
 *   const context = await browser.newContext({ storageState, ... });
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function authStatePath(profile = "default") {
  const filename =
    profile === "default"
      ? "scripts/decks/storageState.json"
      : `scripts/decks/storageState-${profile}.json`;
  const path = resolve(process.cwd(), filename);

  if (!existsSync(path)) {
    console.error(`✗ Auth state not found at ${filename}`);
    console.error("  This script requires a saved Playwright session.");
    console.error("");
    console.error("  Fix:");
    console.error(
      `    node scripts/decks/save-auth-state.mjs${profile === "default" ? "" : " " + profile}`,
    );
    console.error("");
    console.error("  Then re-run this script. Tickets are no longer used for");
    console.error("  recordings — see doctrine: playwright_auth_state_doctrine.md");
    process.exit(1);
  }

  return path;
}
