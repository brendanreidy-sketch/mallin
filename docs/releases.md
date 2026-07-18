# Release ledger

Ongoing record of Production deployments to `mallin.io`, newest first. Each entry
records the live deployment and its immediate rollback target. Baseline: the
2026-07-18 incident recovery. The `recovery-stable-2026-07-18` tag marks commit
`9f339ca`; the recovered live deployment at the time was `dpl_D3pMf…`, built from
commit `50da444`. Tags mark commits; deployments are separate build artifacts —
this ledger records the two separately per release.

## 2026-07-18 — Hide empty prior-call block on /prep

- **Change:** `/prep` `PriorCallBlock` now returns null when both `what_surfaced`
  and `to_think_through` are absent/empty, so mismatched-schema artifacts
  (`{ summary, evidence_ids }`) no longer render an empty "What was said last time"
  shell. One focused commit; no data, styling, call-site, or other behavior change.
- **Commit:** `05d9f12` (on `main`).
- **Release tag:** `release-2026-07-18-hide-empty-prior-call-block` → commit `05d9f12`.
- **Live deployment:** `dpl_W4Nc8G1N99zskJmWY9okAWk6FuBB` (`revops-autopilot-mjmxwhm1d`), built from commit `05d9f12`.
- **Immediate rollback:** deployment `dpl_D3pMfanqace2xvypx8fwoR2NmES6` (`revops-autopilot-4cg343102`), built from commit `50da444`.
  Rollback command: `vercel alias set https://revops-autopilot-4cg343102-roomrefund.vercel.app mallin.io`
  - **Note (tag vs deployment):** this rollback deployment is *not* the commit the
    `recovery-stable-2026-07-18` tag points to. That tag points to commit `9f339ca`
    (a docs-only commit made after `50da444`); the deployment was built from `50da444`.
    Tag and deployment are separate references — keep them distinct, and do not treat
    the tag commit as the rollback build.
- **Canary tests (build `dpl_EDqF9dqyonAEKtETwqD3qSS9Hqki`):** rich-content deal
  (block renders), no-synthesis deal (block absent), SaaS demo empty-synthesis deal
  (block hidden) — all passed.
- **Live verification (`mallin.io`):** homepage 200, sign-in 200, cockpit,
  Cast & Crew Prep with the populated prior-call block, SaaS demo Prep with the empty
  block hidden — all confirmed.
- **Status:** CLOSED.
