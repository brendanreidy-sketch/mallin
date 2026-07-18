# Incident recovery — homepage outage + prep crash (2026-07-18)

## Current production state
- **Live deployment:** `dpl_D3pMfanqace2xvypx8fwoR2NmES6` (`revops-autopilot-4cg343102`) — serves `mallin.io`; built from commit `50da444` (now on `main`). Includes homepage fix + prep fix + Cockpit deals-home restore + `/cockpit` and `/prep` error boundaries.
- **Immediate rollback deployment:** `dpl_DSRjc7o4SATZ4owEucN4QnYm7w1r` (commit `2b16ded`) — identical except it lacks the `/prep` error boundary (has homepage fix + prep fix + cockpit restore + `/cockpit` error boundary).
  - This is the last-known-good build before the current live one; roll back here if any normal workflow fails.
  - **Do NOT** roll back to `dpl_5Mxn52…` (pre-prep-fix) or `dpl_VkVWMc5…` (has the homepage crash).
- **Verified live (2026-07-18):** homepage `200`, `/sign-in` `200`, real-org cockpit deals-home, Cast & Crew prep (`5e0f2d5f-…`) full brief. SaaS demo cockpit + SaaS demo prep (`43ab08bc-…`) covered by equivalence — this release only *adds* `app/prep/error.tsx` (a passive error boundary that renders only on error), so every normal render path is byte-identical to the already-verified prior live build.

## Root causes

### 1. Homepage / public-page crash (client hydration)
- **Symptom:** `/` and `/sign-in` (and every dynamically-rendered route) rendered `200` HTML then threw a client-side "Application error" on hydration. Static pages (`/about`, `/terms`, `/blog`, …) were fine.
- **Cause:** the root-level Open Graph / Twitter image routes `app/opengraph-image.tsx` and `app/twitter-image.tsx`, introduced in commit **`8d65404`**, made Next auto-inject `og:image` / `twitter:image` into the `<head>` of **every** route, which broke hydration on dynamically-rendered routes.
- **Fix:** removed the two root OG-image route files (and the now-dead `outputFileTracingIncludes` in `next.config.ts`).

### 2. Prep server render crash (digest `2133762913`)
- **Symptom:** signed-in users landing on `/prep?dealId=…` for certain deals got a **server-side** exception (digest `2133762913`). First hit on the SaaS demo deal `43ab08bc-2441-4385-bed5-4c433f71d182`.
- **Cause:** `app/prep/page.tsx` → `PriorCallBlock` called `syn.what_surfaced.map()` and `syn.to_think_through.map()` unguarded, but some artifacts' `post_call_synthesis` is shaped `{ summary, evidence_ids }` — those two array fields are **undefined** → `.map()` on `undefined`.
- **Fix commit:** **`0ab95db`** — guarded both with `?? []` (smallest data-safe render fix; no behavior change for well-formed artifacts).

## Testing infrastructure — PERMANENT (do NOT tear down)
- `canary.mallin.io` (test alias) — kept permanently as the canary/staging rig (decided 2026-07-18).
- `prod-debug` Vercel custom environment (copy of Production env vars) — kept permanently.
- Only stale diagnostic branches and superseded deployments may eventually be cleaned up.

## Follow-ups (keep SEPARATE — not bundled with the recovery)
1. ~~**Restore the full Cockpit deals-home page**~~ — **DONE** (commit `4e8e4c6`, live). The `223926392` crash no longer reproduced on current data (scoring engine is fully guarded); un-stubbed `/cockpit` to render the deals-home again.
2. ~~**Add a `/cockpit` error boundary**~~ — **DONE** (commit `2b16ded`, `app/cockpit/error.tsx`, live). Graceful branded fallback + retry so one malformed artifact can't take down the whole deals-home.
3. ~~**Add a `/prep` error boundary**~~ — **DONE** (commit `50da444`, `app/prep/error.tsx`, live). Graceful branded fallback + retry / back-to-deals.
4. **Hide the empty prior-call block** when it has no content (currently renders empty columns for the mismatched-schema artifacts). Separate commit — not yet started.
5. **Reintroduce social preview (OG/Twitter) images safely** — not at the app root, so they don't break hydration. Parked; do not start until requested.
