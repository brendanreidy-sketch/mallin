# Product backlog

Normal product development items. These are *not* incident blockers — the 2026-07-18
recovery incident is closed (baseline tag `recovery-stable-2026-07-18`, commit `9f339ca`).

## Shipped / done

- **Hide the empty prior-call block when there is no content** — shipped 2026-07-18 (commit
  `05d9f12`, release tag `release-2026-07-18-hide-empty-prior-call-block`).
- **Settings entry point on cockpit + prep top bars** — shipped 2026-07-18 (commit `01d02f9`,
  release tag `release-2026-07-18-settings-entry-point`).
- **Direct SaaS demo organization smoke test** — done 2026-07-18. Verified live on `mallin.io`
  during the settings-entry-point release: the "Mallin Demo · SaaS" cockpit and the SaaS demo
  prep deal (`43ab08bc-2441-4385-bed5-4c433f71d182`) render normally, and `/settings/integrations`
  shows the correct per-tenant state. No longer only equivalence-covered. No code change.

## Open

1. **Prep top bar overflows on mobile.** At ~375px the `/prep` top bar (`.topbar` in
   `app/prep/page.tsx`) is a single non-wrapping row (`flex-wrap: nowrap`, `overflow-x: visible`)
   whose controls total ~617–697px into ~467px of width, so Sign out / Mark closed / + Log touch
   run off the right edge and are unreachable (no horizontal scroll). This is **pre-existing**
   (predates the Settings link added 2026-07-18; the link adds ~80px). Fix by letting the bar
   wrap or scroll horizontally on narrow widths — its own scoped change, not a redesign bundled
   into another feature. The Cockpit header is unaffected (simple two-item flex, fits on mobile).
2. **Reintroduce social preview (OG/Twitter) images safely.** Not at the app root — the root
   `app/opengraph-image.tsx` / `app/twitter-image.tsx` broke client hydration on dynamic
   routes (the original 2026-07-18 homepage cause). Scope images to public/static routes only.

## Infrastructure

- **Isolated OAuth testing environment.** Today `prod-debug`/`canary.mallin.io` share the **Production
  Supabase database** and the **Production `GOOGLE_OAUTH_*` env vars**, so Gmail connect/disconnect/reconnect
  cannot be safely tested on canary — a canary disconnect would delete, and a reconnect would overwrite, the
  founder's **live Production** `gmail_oauth_tokens` row. Build a genuinely isolated test rig so those flows
  can be exercised without touching Production. Must include:
  1. A **separate Google Cloud test project** (own OAuth client + Testing consent screen; redirect
     `https://canary.mallin.io/api/gmail/oauth-callback`).
  2. **Independent `prod-debug` OAuth env vars** (split from the shared Production entries).
  3. **Separate token storage** — a separate Supabase project **or** environment-specific `gmail_oauth_tokens`
     rows — so canary token writes never hit Production data. (This is the missing piece a separate Google
     project alone does **not** solve.)
  4. **Dedicated QA Google and Clerk accounts** (not the founder's personal accounts).
  5. Coverage for **fresh connect, disconnect, reconnect, and 7-day token-expiry** testing.
  Context: [docs/launch/gmail-drafts-only-plan.md](launch/gmail-drafts-only-plan.md) §3, §7 and the
  [OAuth audit](launch/gmail-oauth-verification.md). Prerequisite for the eventual Path 1 restricted-scope
  verification work.
