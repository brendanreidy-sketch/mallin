# Release ledger

Ongoing record of Production deployments to `mallin.io`, newest first. Each entry
records the live deployment and its immediate rollback target. Baseline: the
2026-07-18 incident recovery (tag `recovery-stable-2026-07-18`).

## 2026-07-18 — Hide empty prior-call block on /prep

- **Change:** `/prep` `PriorCallBlock` now returns null when both `what_surfaced`
  and `to_think_through` are absent/empty, so mismatched-schema artifacts
  (`{ summary, evidence_ids }`) no longer render an empty "What was said last time"
  shell. One focused commit; no data, styling, call-site, or other behavior change.
- **Commit:** `05d9f12` (on `main`).
- **Live deployment:** `dpl_W4Nc8G1N99zskJmWY9okAWk6FuBB` (`revops-autopilot-mjmxwhm1d`).
- **Immediate rollback:** `dpl_D3pMfanqace2xvypx8fwoR2NmES6` (tag `recovery-stable-2026-07-18`).
  Rollback command: `vercel alias set https://revops-autopilot-4cg343102-roomrefund.vercel.app mallin.io`
- **Canary tests (build `dpl_EDqF9dqyonAEKtETwqD3qSS9Hqki`):** rich-content deal
  (block renders), no-synthesis deal (block absent), SaaS demo empty-synthesis deal
  (block hidden) — all passed.
- **Live verification (`mallin.io`):** homepage 200, sign-in 200, cockpit,
  SaaS demo Prep with empty block hidden — all confirmed. Cast & Crew populated
  block: verified on canary from the same commit; the diff is a pure additive early
  return that cannot affect populated blocks.
