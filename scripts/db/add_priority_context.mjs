// Append Marcus's priority-stack context to the existing
// commercial_reality.situation_summary. Keeps existing structure;
// adds two sentences of rep-voice context for what's actually on
// Marcus's plate and the sign-now-activate-later unlock.

import { Client } from "pg";
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const DEAL_ID = "bd13a2e7-025c-42cd-80d1-2fa5a66090d2";
const r = await c.query(
  `SELECT id, artifact FROM execution_artifacts WHERE opportunity_id=$1 AND is_current=true`,
  [DEAL_ID],
);
const { id, artifact } = r.rows[0];

const PRIORITY_BLOCK =
  " Marcus's stack right now is converting the PowerBank LOI into a real deployment, the next capital raise, and closing the next 1-2 site LOIs. TMS is realistically #6 or #7 for him — a 'yes eventually, not yet.' The unlock is sign-now-activate-later: lock pricing this quarter, defer billing until the first SPV is live.";

if (artifact.commercial_reality?.situation_summary) {
  let summary = artifact.commercial_reality.situation_summary;

  // Clean up the analyst-register phrase
  summary = summary.replaceAll(
    "applying a capital-allocation lens",
    "weighing every dollar against deploying another data-center site",
  );

  // Append priority context if not already present
  if (!summary.includes("sign-now-activate-later")) {
    summary = summary + PRIORITY_BLOCK;
  }

  artifact.commercial_reality.situation_summary = summary;
  console.log("✓ commercial_reality.situation_summary updated");
}

await c.query(
  `UPDATE execution_artifacts SET artifact=$1::jsonb WHERE id=$2`,
  [JSON.stringify(artifact), id],
);
console.log(`✓ artifact ${id} saved`);
await c.end();
