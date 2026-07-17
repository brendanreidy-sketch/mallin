/**
 * Mint a fresh one-click sign-in URL for a demo login. No seeding, no orgs —
 * just a new 1-hour Clerk sign-in token. Use this for repeat logins instead of
 * re-running provision-demo-industries.mjs.
 *
 * Usage: node scripts/clerk/mint-signin-url.mjs --email demo@mallin.io
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const email = (() => {
  const i = process.argv.indexOf("--email");
  return i >= 0 ? process.argv[i + 1] : "demo@mallin.io";
})();

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/\r$/, "").replace(/^(['"])(.*)\1$/, "$2");
  }
}

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET?.startsWith("sk_live_")) {
  console.error("✗ CLERK_SECRET_KEY must be sk_live_* (check .env.local)");
  process.exit(1);
}
const H = { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

const users = await fetch(
  `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
  { headers: H },
).then((r) => r.json());
const user = Array.isArray(users) ? users[0] : null;
if (!user) {
  console.error(`✗ No Clerk user for ${email}. Run provision-demo-industries.mjs first.`);
  process.exit(1);
}

const tok = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: H,
  body: JSON.stringify({ user_id: user.id, expires_in_seconds: 3600 }),
}).then((r) => r.json());
if (!tok?.token) {
  console.error("✗ token mint failed:", JSON.stringify(tok));
  process.exit(1);
}

console.log(`\n  Fresh one-click sign-in URL for ${email} (1h, single use):\n`);
console.log(`  https://mallin.io/sign-in?__clerk_ticket=${tok.token}\n`);
