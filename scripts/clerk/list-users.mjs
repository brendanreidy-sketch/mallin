import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) {
  console.error("✗ CLERK_SECRET_KEY missing");
  process.exit(1);
}

const res = await fetch("https://api.clerk.com/v1/users?limit=100", {
  headers: { Authorization: `Bearer ${SECRET}` },
});
const users = await res.json();

console.log(`\nUsers in Clerk (${users.length} total):\n`);
for (const u of users) {
  const emails = (u.email_addresses ?? [])
    .map((e) => `${e.email_address}${e.verification?.status === "verified" ? " ✓" : " (unverified)"}`)
    .join(", ");
  console.log(`  ${u.id}`);
  console.log(`    emails: ${emails}`);
  console.log(`    name: ${[u.first_name, u.last_name].filter(Boolean).join(" ") || "(no name)"}`);
  console.log(`    created: ${new Date(u.created_at).toISOString()}`);
  console.log("");
}
