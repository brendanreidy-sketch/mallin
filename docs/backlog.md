# Product backlog

Normal product development items. These are *not* incident blockers — the 2026-07-18
recovery incident is closed (baseline tag `recovery-stable-2026-07-18`, commit `9f339ca`).

## Open

1. **Hide the empty prior-call block when there is no content.** `/prep` currently renders
   empty "What was said last time" columns for artifacts whose `post_call_synthesis` lacks
   the expected fields. Show nothing when there's no content. Small, cosmetic, own commit.
2. **Reintroduce social preview (OG/Twitter) images safely.** Not at the app root — the root
   `app/opengraph-image.tsx` / `app/twitter-image.tsx` broke client hydration on dynamic
   routes (the original 2026-07-18 homepage cause). Scope images to public/static routes only.
3. **Run one direct SaaS demo organization smoke test when convenient.** Sign into the
   "Mallin Demo · SaaS" Clerk org and confirm the SaaS demo cockpit + the SaaS demo prep deal
   (`43ab08bc-2441-4385-bed5-4c433f71d182`) render normally. Currently covered only by
   equivalence to the prior verified build.
