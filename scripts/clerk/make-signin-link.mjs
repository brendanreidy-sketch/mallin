import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SECRET = process.env.CLERK_SECRET_KEY;
const USER_ID = "user_3DdwR2Fj7QmGd5oqcTG07ssdu88";

const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    user_id: USER_ID,
    expires_in_seconds: 3600,
  }),
});

const text = await res.text();
console.log("status:", res.status);
console.log("body:", text);
