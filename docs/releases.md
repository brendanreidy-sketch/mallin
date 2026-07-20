# Release ledger

Ongoing record of Production deployments to `mallin.io`, newest first. Each entry
records the live deployment and its immediate rollback target. Baseline: the
2026-07-18 incident recovery. The `recovery-stable-2026-07-18` tag marks commit
`9f339ca`; the recovered live deployment at the time was `dpl_D3pMf…`, built from
commit `50da444`. Tags mark commits; deployments are separate build artifacts —
this ledger records the two separately per release.

## 2026-07-18 — Gmail drafts-only (direct send retired)

- **Change:** Mallín now **only creates Gmail drafts and never sends**. Every direct-send path
  is removed: the `/api/gmail/send` route is deleted, and the action-queue `email_send` executor
  (the second `messages.send` path) is deleted. All producers/UI convert to drafts — EmailComposer
  and BookReview primary action is **"Save to Gmail Drafts"**; the EmailComposer "Queue" and the
  deck-sharing surface enqueue `email_draft`. **`email_send` is retired to a deprecated, read-only
  legacy type**: historical `email_send` rows remain readable/displayable, but creation, execution,
  and retry are explicitly rejected at the enqueue, execute, and approve boundaries (defense-in-depth
  on top of the disabled dispatch case). The `/prep` drafts-route auth was fixed (Clerk `auth()` vs
  a header shim), the `gmail.compose` scope comment corrected (it is a **restricted** scope; CASA
  status unresolved — see the OAuth audit), and the privacy policy + composer wording aligned to
  drafts-only.
- **Commits (exactly four):** `a49f8c9` (drafts-route auth + scope comment) · `754afd4` (remove
  send paths → drafts) · `5498cde` (legacy `email_send` safety guards) · `b4d2d78` (drafts-only
  wording). On `main`.
- **Release tag:** `release-2026-07-18-gmail-drafts-only` → commit `b4d2d78`.
- **Live deployment:** `dpl_3bkNtF4be5U285Q1niDtVpCMsupp` (`revops-autopilot-d4oaxlezr`), built from commit `b4d2d78`.
- **Immediate rollback:** deployment `dpl_9chQnaBip7KkxDxUXf4DUYTREc4x` (`revops-autopilot-je3p9fu5r`), built from commit `01d02f9` (the prior settings-entry-point release).
  Rollback command: `vercel alias set https://revops-autopilot-je3p9fu5r-roomrefund.vercel.app mallin.io`
- **Scope removed vs behavior:** no OAuth scope change (`gmail.compose` + `openid` + `email`
  unchanged). **Token revocation and isolated-OAuth-testing infrastructure were deliberately NOT
  included** — they remain separate future work (see `docs/backlog.md` and the drafts-only plan).
- **Canary acceptance (build `dpl_2eSDjsuSV4vz4yYqHwhEuLmP8u2h`, identical source):** queue-guard
  test (enqueue throws before insert; execute/retry rejected; row count unchanged), `/api/gmail/send`
  absent from build manifest, zero `messages.send` / `Send via Gmail`, one real draft created in
  builtalone@gmail.com Drafts (not Sent), demo-org **Gmail "Not connected"** verified, BookReview
  drafts-only, homepage/sign-in/cockpit/prep render.
- **Live verification (`mallin.io`, post-promotion):** homepage 200, sign-in 200, cockpit, prep,
  Gmail connected (builtalone@gmail.com), "Save to Gmail Drafts" + drafts-only wording, BookReview
  drafts-only controls, `/api/gmail/send` absent (build manifest), legacy `email_send`
  create/execute/retry rejected with the historical failed row unchanged. Demo-org "Not connected"
  treated as valid from the pre-promotion canary run on the identical, unmodified deployment. No
  message sent; OAuth connection unchanged; no new `email_send` row.
- **Note:** one test draft ("Mallin Canary Draft Test — Do Not Send") remains in builtalone@gmail.com
  Drafts by design; the owner will delete it manually. The single historical `email_send` row (status
  `failed`, real-org tenant) is left untouched and is read-only.
- **Status:** CLOSED.

## 2026-07-18 — Settings entry point on cockpit + prep top bars

- **Change:** new shared `components/nav/settings-link.tsx` (`SettingsLink`) added to the
  `/cockpit` header and the `/prep` top bar, immediately before Sign out, linking to the
  existing `/settings/integrations` page (Gmail + HubSpot connect). Surfacing only — no
  integration, auth, navigation, data, or other-styling changes. Does not mount the app
  shell/sidebar.
- **Commit:** `01d02f9` (on `main`).
- **Release tag:** `release-2026-07-18-settings-entry-point` → commit `01d02f9`.
- **Live deployment:** `dpl_9chQnaBip7KkxDxUXf4DUYTREc4x` (`revops-autopilot-je3p9fu5r`), built from commit `01d02f9`.
- **Immediate rollback:** deployment `dpl_W4Nc8G1N99zskJmWY9okAWk6FuBB` (`revops-autopilot-mjmxwhm1d`), built from commit `05d9f12` (tag `release-2026-07-18-hide-empty-prior-call-block`).
  Rollback command: `vercel alias set https://revops-autopilot-mjmxwhm1d-roomrefund.vercel.app mallin.io`
- **Canary tests (build `dpl_7jV7U6o4WGE5tGxvaMuZQ9ZxAqD1`):** all 7 acceptance criteria passed —
  link visible on cockpit + prep, opens integrations, correct connected/disconnected state
  (Gmail connected in real org, not connected in demo org), return nav works, existing controls
  unchanged, light + dark correct, real + demo orgs.
- **Live verification (`mallin.io`):** demo-org cockpit + prep show the link; clicking navigates
  to `/settings/integrations` with correct state; homepage 200, sign-in 200. Real-org paths are
  byte-identical to the canary-tested commit.
- **Known follow-up (not in this release):** the `/prep` top bar overflows on mobile (~375px) —
  pre-existing; this link adds ~80px. Logged as backlog item #1.
- **Status:** CLOSED.

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
