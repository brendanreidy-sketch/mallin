# Release ledger

Ongoing record of Production deployments to `mallin.io`, newest first. Each entry
records the live deployment and its immediate rollback target. Baseline: the
2026-07-18 incident recovery. The `recovery-stable-2026-07-18` tag marks commit
`9f339ca`; the recovered live deployment at the time was `dpl_D3pMf…`, built from
commit `50da444`. Tags mark commits; deployments are separate build artifacts —
this ledger records the two separately per release.

## 2026-07-21 — Operating-layer stabilization (Deals rows · Home-in-shell · Ask a11y · nav flash)

- **Change:** Four presentational + shell-navigation fixes to the authenticated operating
  layer, shipped as one release:
  1. **`/deals` responsive rows** — `.drow` grid `minmax(0,1fr)` + `min-width:0` + `display:block`
     on name/next + a ≤720px collapse, so deal name and "Next:" no longer collide and long text
     truncates instead of overflowing the viewport.
  2. **Home = Cockpit inside AppShell** — `/cockpit` (the canonical Home route) now renders inside
     the operating-layer `AppShell`, so clicking the sidebar "Home" no longer drops the user out of
     the shell. Cockpit's own header is hidden on desktop (sidebar supplies it) and returns ≤720px.
  3. **`/ask` dark-mode control readability** — dedicated `.askStarter`/`.askSubmit` classes (not the
     shared `.chip2`) give the starter prompts and the Ask button an explicit `--ck-` background +
     inherited font, fixing unreadable light-on-light controls in dark mode.
  4. **Home-nav flash fix** — deleted the obsolete `app/cockpit/loading.tsx` (a hardcoded-cream,
     shell-less skeleton) so navigating to Home no longer flashes cream / blinks the sidebar; the
     current shell stays visible for the ~440–930 ms `/cockpit` render, then swaps.
- **No database, tenant, Clerk, Gmail/OAuth, or deal-intelligence changes** — presentational and
  shell-navigation only. Deal queries, ranking, grouping, greeting, brief, `/prep` links, Ask
  streaming/model/prompt, auth, and tenant behavior are unchanged.
- **Application commits (four, distinct, no squash):**
  `a35c7f9` (deals rows) · `cdfa65e` (Home-in-shell) · `cb66259` (Ask a11y) · `12eebf0` (nav-flash / loading.tsx delete).
  Application SHA (`main`): `12eebf0`.
- **Release tag:** `release-2026-07-21-operating-layer-stabilization` → commit `12eebf0` (annotated).
- **Live deployment:** **`dpl_Ghf6pjmJ24xuHUVfbmdBTw82Pjm8`** (`revops-autopilot-ge5lcpirg`), built from
  `12eebf0`. Provenance: Vercel commit status success + GitHub Deployment `5549212800` (env Production,
  ref `12eebf0`). Verified the exact deployment serves `mallin.io` (served assets `?dpl=dpl_Ghf6…`).
- **Immediate rollback:** **`dpl_ArGMWz56tRZQ8bknCK2CHsUePY7q`** (`revops-autopilot-he4vtnu9e`), the prior
  Prep desktop-shell release (Ready).
  Rollback command: `vercel alias set https://revops-autopilot-he4vtnu9e-roomrefund.vercel.app mallin.io`
- **Superseded (not promoted):** `dpl_HoW71WzhSQsXQzRpzDbnFh1VA38K` (the three-commit candidate, before the
  nav-flash fix).
- **Post-promotion verification (`mallin.io`, authenticated):** `/` `/sign-in` `/how-it-works` `/pilot`
  2xx; `/cockpit` in AppShell with Home highlighted + all three deals; `/deals` no overflow + correct
  Prep links; `/ask` streamed a real deal-grounded answer with readable controls; `/prep` (Cast & Crew)
  renders; `/new?mode=upcoming` 200. No console errors. Two 503s appeared on initial RSC prefetches
  (`/cockpit?_rsc`, `/new?dealId&_rsc`) — transient cold-starts, 200 on 5/5 retests, not recurring.
  Clerk org/tenant correct ("Mallin · Brendan Reidy"). Owner accepted the flash-free Home transition
  manually + real phone at canary.
- **Status:** CLOSED.

## 2026-07-21 — Prep desktop shell: flush full-width workspace + mobile header wrap

- **Change:** Presentational redesign of the `/prep` **shell only**. Desktop (≥1001px):
  drop the floating rounded-card treatment (no radius/shadow/border), widen the shell
  toward the viewport, cut the dead space above the chrome, and **fold the standalone
  "All deals" back-link into the top utility bar** (reusing the shared `BackLink`
  unchanged — only its standalone margin is neutralised) so the chrome reads as one
  connected header instead of three stacked bands. Mobile/tablet (≤1000px): the utility
  bar now **wraps deliberately** — "All deals" on its own compact row, the growing
  spacer removed, every control (Add next call · theme · Settings · Sign out · Mark
  closed · Log touch) packing left and wrapping — fixing the prior clipping where
  Settings onward were cut off. **No change to Prep wording, deal data, deal selection,
  tabs, Gmail draft behavior, Action Queue, Ask Coach, navigation, Settings/Sign out,
  authentication, or Supabase/Clerk logic — presentational only.**
- **Commits (two):** `626a1c5` (desktop shell) · `be8e819` (mobile header wrapping fix).
  On `main` (fast-forward, no squash). Diff = exactly `app/prep/page.tsx` (+3/−1) +
  `app/prep/prep.module.css` (+48).
- **Release tag:** `release-2026-07-21-prep-desktop-shell` → commit `be8e819` (annotated).
- **Live deployment:** **`dpl_ArGMWz56tRZQ8bknCK2CHsUePY7q`** (`revops-autopilot-e7yzir14q`),
  built from `be8e819`. Provenance: Vercel commit status success + GitHub Deployment
  `5546775182` (env Production, ref `be8e819`).
- **Immediate rollback:** **`dpl_DMGoZmpMZ3ww47pK2yAd6NXUhcQF`** (`revops-autopilot-he4vtnu9e`),
  the prior cockpit-timezone release.
  Rollback command: `vercel alias set https://revops-autopilot-he4vtnu9e-roomrefund.vercel.app mallin.io`
- **Acceptance:** typecheck/build clean; desktop accepted on the literal authenticated
  canary (one connected chrome row, flush workspace); mobile accepted by the owner on a
  real phone at portrait (All deals own row, all controls visible/tappable, no clipping,
  no horizontal scroll) and corroborated by measurement on the real bar at 375px & 390px
  (8 controls, 0 clipped). Post-promotion `mallin.io`: `/` 200, `/sign-in` 200, marketing
  200, `/cockpit` Clerk-gated, `/prep` 200, no 5xx.
- **Status:** CLOSED.

## 2026-07-21 — Cockpit greeting/date: visitor-local timezone (fix)

- **Change:** The `/cockpit` daily-brief greeting word (morning/afternoon/evening)
  and the displayed date now reflect the **visitor's local calendar day**, not the
  Vercel server's UTC clock. Both derive from one shared `now` instant and the
  visitor's timezone read from Vercel's edge header **`x-vercel-ip-timezone`**. The
  header is **validated** before `Intl.DateTimeFormat` (which throws on an unknown
  zone); on a missing or invalid header we fall back to a **neutral, never-wrong
  greeting** (`Welcome back, {name}`) and the server-default date. Thresholds:
  **morning 00:00–11:59 · afternoon 12:00–16:59 · evening 17:00–23:59.** No timezone
  is hard-coded. Presentational/derivation only — **no change to deal queries,
  ranking, grouping, brief wording, styling, auth, navigation, Prep, Gmail/OAuth,
  or database behavior.**
- **Known limitation:** `x-vercel-ip-timezone` is IP-geolocation based, so a VPN or
  travel can place the visitor in a different zone than their device clock; the
  greeting/date follow the IP zone in that case (acceptable for a greeting).
- **Commit (one file):** `2b9ad4b` — `app/cockpit/page.tsx` only (+47 / −4). On
  `main` (fast-forward, no squash); identical to the commit accepted on canary.
- **Release tag:** `release-2026-07-21-cockpit-tz-greeting` → commit `2b9ad4b` (annotated).
- **Live deployment:** **`dpl_DMGoZmpMZ3ww47pK2yAd6NXUhcQF`** (`revops-autopilot-he4vtnu9e`),
  built from `2b9ad4b`. Provenance: Vercel commit status success + GitHub Deployment
  `5545946756` (env Production, ref `2b9ad4b`).
- **Immediate rollback:** **`dpl_GvYwMaPXkEVBiui2tD7C783ueDXC`** (`revops-autopilot-9q5bquybm`),
  the prior landing-hero release.
  Rollback command: `vercel alias set https://revops-autopilot-9q5bquybm-roomrefund.vercel.app mallin.io`
- **Acceptance:** offline suite all-pass (six thresholds incl. the 5 PM boundary, six
  IANA zones independent, missing/invalid header → neutral, near-midnight date follows
  local calendar day); owner-accepted on the prod-debug canary (identical commit):
  "Good afternoon, Brendan · Tuesday, July 21" matched local time, cockpit rendered
  normally, no flicker/hydration error. Post-promotion `mallin.io`: `/` 200, `/sign-in`
  200, marketing 200, `/cockpit` + `/prep` gated with no 5xx, correct title.
- **Status:** CLOSED.

## 2026-07-21 — Landing hero: static product-faithful Cockpit recreation

- **Change:** Presentational-only redesign of the landing **hero** only. The auto-advancing
  five-panel `HomeWalkthrough` demo is replaced with a **static, product-faithful Cockpit
  recreation** (cream `--ck-` deals-home in a framed product window) using **fictional
  illustrative data** (Meridian Freight / Cobalt Analytics / Harbor Point Health; greeting
  "Jordan"). All timers/step-state/carousel/transitions/interactive chips removed; it renders
  as a labelled illustrative figure (`role="img"`, `aria-hidden` content) — no motion, no
  focusable controls. A follow-up wraps the focus-card deal name to two lines (on-track rows keep
  truncating). **No marketing copy, CTA, href, nav, footer, auth-redirect, or theme change** —
  `app/page.tsx`, `app/home.module.css`, `SiteNav`, `SiteFooter` are byte-identical.
- **Commits (exactly two):** `f20f27f` (static recreation) · `18d047f` (2-line focus-name wrap).
  On `main` (fast-forward, no squash). Release diff = exactly `app/HomeWalkthrough.tsx` +
  `app/HomeWalkthrough.module.css` (new).
- **Release tag:** `release-2026-07-21-landing-hero-premium` → commit `18d047f` (annotated).
- **Live deployment:** `dpl_GvYwMaPXkEVBiui2tD7C783ueDXC` (`revops-autopilot-9q5bquybm`), built
  from commit `18d047f`.
- **Git provenance (genuine, GitHub-recorded):** Vercel commit status on `18d047f` = success →
  inspector `…/GvYwMaPXkEVBiui2tD7C783ueDXC`; GitHub Deployment `5545387823` (env Production, ref
  `18d047f`, status success) → `revops-autopilot-9q5bquybm`.
- **Immediate rollback:** deployment `dpl_EbeuX555MRUbyUpZVAVBimWkCZJy`
  (`revops-autopilot-kz4vfsa5h`), the prior cockpit-premium release.
  Rollback command: `vercel alias set https://revops-autopilot-kz4vfsa5h-roomrefund.vercel.app mallin.io`
- **Anonymous acceptance (the key gate):** verified on the **wall-free** production candidate via
  a truly cookie-free session (no Vercel/Clerk cookies) at **390×844**: `scrollWidth === clientWidth`
  (zero horizontal overflow), layout stacks (copy → framed product window), the hamburger **opens
  into the full nav and closes** (live hydration on a cold anonymous load), **no console errors**,
  accessible figure present. Desktop verified; signed-in `/`→`/cockpit` redirect intact.
- **Live verification (`mallin.io`):** homepage 200, sign-in 200, `/prep` 200, `/cockpit` Clerk-
  gated (404 protect-rewrite), no 5xx; serves the exact accepted deployment.
- **Excluded (deliberately):** the greeting-timezone fix, the Prep shell redesign, and all
  strategy/positioning work.
- **Status:** CLOSED.

## 2026-07-21 — Cockpit premium visual pass (desktop-widened deals home)

- **Change:** Presentational-only redesign of the `/cockpit` deals home. Deal-home markup moved
  from inline styles into a new `app/cockpit/cockpit.module.css`; the top needs-attention card is
  emphasized purely via CSS `:first-child` (no JS, no new selection logic); calmer status pills,
  restrained tone accents, and 375px header/overflow fixes; then a follow-up widening the desktop
  container 640→960px (cards full-width, greeting/brief held to a readable measure). **The frozen
  server/data block in `page.tsx` (queries, tenant filter, ranking, grouping, greeting/brief text)
  is byte-identical** — no wording, logic, Prep, dark-wiring, or other-file changes.
- **Commits (exactly two):** `32db354` (premium visual pass) · `f3433b9` (desktop width
  correction). On `main` (fast-forward, no squash). Complete app-code release diff vs the prior
  live release (`b4d2d78`) = exactly `app/cockpit/page.tsx` + `app/cockpit/cockpit.module.css`
  (the intervening `4955d50` was docs-only).
- **Release tag:** `release-2026-07-21-cockpit-premium-pass` → commit `f3433b9` (annotated).
- **Live deployment:** `dpl_EbeuX555MRUbyUpZVAVBimWkCZJy` (`revops-autopilot-kz4vfsa5h`), built
  from commit `f3433b9`.
- **Git provenance (genuine, GitHub-recorded):** Vercel commit status on `f3433b9` = success →
  inspector `…/EbeuX555MRUbyUpZVAVBimWkCZJy`; GitHub Deployment `5543591386` (env Production, ref
  `f3433b9`, status success) → `revops-autopilot-kz4vfsa5h`. Verified via `gh api`, not
  self-reported metadata.
- **Immediate rollback:** deployment `dpl_3bkNtF4be5U285Q1niDtVpCMsupp` (`revops-autopilot-d4oaxlezr`),
  built from commit `b4d2d78` (the prior gmail-drafts-only release).
  Rollback command: `vercel alias set https://revops-autopilot-d4oaxlezr-roomrefund.vercel.app mallin.io`
- **Canary acceptance:** owner authenticated review on `canary.mallin.io/cockpit` against the exact
  candidate — real-org desktop + ~390px, SaaS demo, forced dark, first-card emphasis, wider desktop
  container, Settings/Sign out, tenant truncation, deal→Prep nav, Prep render, Gmail connected to
  `builtalone@gmail.com`. All passed.
- **Live verification (`mallin.io`):** homepage 200, sign-in 200, `/prep` 200, `/cockpit` gated by
  Clerk (404 protect-rewrite), no 5xx; serves the exact authenticated-tested deployment.
- **Excluded (deliberately):** the greeting-timezone fix (server UTC `getHours()` — separate
  backlog), the Prep shell redesign (separate backlog), and all strategy/positioning work.
- **Status:** CLOSED.

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
