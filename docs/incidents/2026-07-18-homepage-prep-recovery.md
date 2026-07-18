# Incident recovery — homepage outage + prep crash (2026-07-18)

## Current production state
- **Live deployment:** `dpl_J2z1F1CEHr7quBevJ1cm4LxqibUr` (`revops-autopilot-2txt6xauc`) — serves `mallin.io`; built from commit `0ab95db` (now on `main`).
- **Immediate rollback deployment:** `dpl_5Mxn52mwb44unoNXc9X9SuWtCPyQ` (`revops-autopilot-6mk7t9i5x`).
  - Rollback command: `vercel alias set https://revops-autopilot-6mk7t9i5x-roomrefund.vercel.app mallin.io`
  - This target keeps the **homepage fix** (it lacks only the prep fix).
  - **Do NOT** roll back to `dpl_VkVWMc5pNXwkmLodkndCT3yPfw9e` — that deployment still contains the homepage crash.

## Root causes

### 1. Homepage / public-page crash (client hydration)
- **Symptom:** `/` and `/sign-in` (and every dynamically-rendered route) rendered `200` HTML then threw a client-side "Application error" on hydration. Static pages (`/about`, `/terms`, `/blog`, …) were fine.
- **Cause:** the root-level Open Graph / Twitter image routes `app/opengraph-image.tsx` and `app/twitter-image.tsx`, introduced in commit **`8d65404`**, made Next auto-inject `og:image` / `twitter:image` into the `<head>` of **every** route, which broke hydration on dynamically-rendered routes.
- **Fix:** removed the two root OG-image route files (and the now-dead `outputFileTracingIncludes` in `next.config.ts`).

### 2. Prep server render crash (digest `2133762913`)
- **Symptom:** signed-in users landing on `/prep?dealId=…` for certain deals got a **server-side** exception (digest `2133762913`). First hit on the SaaS demo deal `43ab08bc-2441-4385-bed5-4c433f71d182`.
- **Cause:** `app/prep/page.tsx` → `PriorCallBlock` called `syn.what_surfaced.map()` and `syn.to_think_through.map()` unguarded, but some artifacts' `post_call_synthesis` is shaped `{ summary, evidence_ids }` — those two array fields are **undefined** → `.map()` on `undefined`.
- **Fix commit:** **`0ab95db`** — guarded both with `?? []` (smallest data-safe render fix; no behavior change for well-formed artifacts).

## Recovery resources — KEEP until 2026-07-19 (do not clean up before then)
- `canary.mallin.io` (test alias)
- `prod-debug` Vercel custom environment (copy of Production env vars)
- Deployments: `dpl_J2z1F1CEHr7quBevJ1cm4LxqibUr` (live) and `dpl_5Mxn52mwb44unoNXc9X9SuWtCPyQ` (rollback)

## Follow-ups (keep SEPARATE — not bundled with the recovery)
1. **Restore the full Cockpit deals-home page** — currently stubbed to a redirect to `/prep`; separate server-render bug (digest `223926392`).
2. **Add a `/prep` error boundary** — graceful fallback for any future render error.
3. **Hide the empty prior-call block** when it has no content (currently renders empty columns for the mismatched-schema artifacts).
4. **Reintroduce social preview (OG/Twitter) images safely** — not at the app root, so they don't break hydration.
