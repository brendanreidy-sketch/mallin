// Flip pre-mortem paths from "if you do nothing" framing to "what to do +
// why it helps" framing. Brendan's call: don't put the rep on defense
// against a bad outcome — give them the move and the rationale, in
// rep voice.

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

const REWRITTEN = {
  pricing: {
    // Situation, not warning. Just the dynamic the rep is operating in.
    failure_path:
      "Pedro carries the pricing back to Marcus internally. Marcus is a co-founder, ex-Greenbacker — every dollar lands next to getting another data center site live. A platform invoice doesn't make him money. So whatever shape Pedro brings has to make sense from that seat.",
    // Rebadged as "Why this helps" — positive impact rationale.
    if_no_action:
      "When Pedro builds the structure with you, Marcus hears it from his own co-founder, not from a vendor. He's far more likely to say yes to something Pedro built than something we brought to the table. Pedro becomes the recommender, not the messenger.",
    // Already in good shape from prior pass — kept.
    coaching_prompt:
      "You want to help Pedro win this with Marcus. Pedro is the one who has to convince Marcus — not you. So your job on the next call is to get Pedro to coach you on how to set this up so he can win. Ask him: \"What's going to be important to you to be successful in your conversation with Marcus?\" Then listen.",
    forcing_move:
      "Lock pricing now, defer billing until the first site is live — IF Pedro tells you that's the shape that wins.",
  },
  discount_approval: {
    failure_path:
      "Marcus will likely push back on price, and Pedro will need to bring something back to him. The temptation is to pre-build counter-offers — but you'd be guessing at what Marcus accepts.",
    if_no_action:
      "Pedro is the one who knows what makes Marcus say yes. If you let him tell you what shape wins, you're building a phase-1 that survives the internal conversation — not one you hope survives.",
    coaching_prompt:
      "Same play, different angle. Don't pre-build counter-offers. Ask Pedro: \"If Marcus comes back asking for less, what would make phase-1 feel like the right call to him — not a fallback?\" Let Pedro tell you what wins.",
    forcing_move:
      "If Pedro names a phase-1 shape that fits — make sure deal desk has pre-approved it before May 18. Don't bring options to the call you can't actually offer.",
  },
};

for (const p of artifact.pre_mortem_paths || []) {
  const rw = REWRITTEN[p.primary_driver];
  if (!rw) continue;
  Object.assign(p, rw);
  console.log(`✓ rewrote path: ${p.primary_driver}`);
}

await c.query(
  `UPDATE execution_artifacts SET artifact=$1::jsonb WHERE id=$2`,
  [JSON.stringify(artifact), id],
);
console.log(`\n✓ artifact ${id} flipped to positive framing`);
await c.end();
