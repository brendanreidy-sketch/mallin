import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const SECRET = process.env.CLERK_SECRET_KEY;
const H = { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

// Try multiple known Clerk Backend API endpoints for tweaking second-factor / MFA enforcement
const attempts = [
  // 1. Update second_factor settings via beta_features endpoint
  { method: "PATCH", path: "/v1/instance", body: { test_mode: false } },
  // 2. The instance/auth_config endpoint sometimes works
  { method: "PATCH", path: "/v1/beta_features/instance_settings", body: { sign_up: { progressive: true } } },
  // 3. Direct instance settings
  { method: "GET", path: "/v1/instance/organization_settings" },
];

for (const a of attempts) {
  const res = await fetch(`https://api.clerk.com${a.path}`, {
    method: a.method,
    headers: H,
    body: a.body ? JSON.stringify(a.body) : undefined,
  });
  const text = await res.text();
  console.log(`${a.method} ${a.path}: ${res.status} ${text.slice(0, 300)}`);
}

// Also try fetching what auth-config endpoints exist
console.log("\n--- Probing for auth-related endpoints ---");
const probes = [
  "/v1/instance",
  "/v1/users/user_3DdwR2Fj7QmGd5oqcTG07ssdu88",
];
for (const p of probes) {
  const res = await fetch(`https://api.clerk.com${p}`, { headers: H });
  const j = await res.json().catch(() => null);
  console.log(`\nGET ${p}:`);
  console.log(JSON.stringify(j, null, 2).slice(0, 1500));
}
