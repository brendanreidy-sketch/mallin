import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SECRET = process.env.CLERK_SECRET_KEY;
const H = { Authorization: `Bearer ${SECRET}` };

// 1. Instance settings — what first-factor strategies are enabled
const inst = await fetch("https://api.clerk.com/v1/instance", { headers: H }).then(r => r.json());
console.log("\n=== Instance auth_config ===");
console.log(JSON.stringify(inst.auth_config ?? inst, null, 2).slice(0, 2000));

// 2. The demo user — what strategies do they have available
const users = await fetch("https://api.clerk.com/v1/users?email_address[]=demo@mallin.io", { headers: H }).then(r => r.json());
const u = Array.isArray(users) ? users[0] : null;
if (u) {
  console.log("\n=== Demo user auth state ===");
  console.log("id:", u.id);
  console.log("password_enabled:", u.password_enabled);
  console.log("totp_enabled:", u.totp_enabled);
  console.log("backup_code_enabled:", u.backup_code_enabled);
  console.log("two_factor_enabled:", u.two_factor_enabled);
  console.log("verified_email_addresses:", (u.email_addresses ?? []).filter(e => e.verification?.status === "verified").map(e => e.email_address));
}
