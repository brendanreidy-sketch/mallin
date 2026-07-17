# Demo industry instances — prospect-facing, toggleable book of business

**Status:** design doc · approved approach · NOT yet implemented
**Last updated:** 2026-07-17
**Builds on:** `ffbcc0e` (rich demo pipeline — 5 deals across every surface state), `lib/demo/*`, `scripts/db/seed-demo-pipeline.ts`
**Governing principle:** build beside the real path, never inside it. See `mallin-operating-principles.md`.

> **What this delivers:** In front of a prospect, flip Mallín between four industries — SaaS, Med Devices, Logistics, Real Estate — each showing its own believable 7-deal book of business across every surface (Home, Deals, Prep, Team, Knowledge, ledger). The point is range: "here's what your world looks like in Mallín," on demand, one tap.
>
> **The core decision:** each industry is its own seeded demo tenant. The product surfaces stay 100% untouched — they render whatever tenant (Clerk org) is active. We only add seed content + a header control. Nothing on the real path moves. This is why it can't break the product: a malformed demo deal can only make the demo look wrong, never affect a real user.
>
> **Success test:** *"A prospect watches me tap 'Logistics', and the whole cockpit becomes a credible logistics pipeline — deals stalling on customs, a won deal that displaced a competitor, a lost deal that ran out of budget. I tap 'Med Devices' and it's a different, equally believable world. Real users see none of this, and nothing about it touches their data."*

---

## 1. Why this is the safe kind of build

The three failures from the caching/overflow session (see `BACKLOG.md` and recent commits) were: (a) inline CSS truncation that silently no-ops, (b) an LLM call blocking a page's first paint, (c) surfaces promising data they didn't have. This build structurally avoids all three:

- **No per-deal LLM calls.** `brief()` in `lib/demo/pipeline.ts` is pure synchronous expansion — a concise spec fabricates the full artifact JSON. Adding deals is adding array entries + re-running the seed. The deal-click delay cannot recur here.
- **Demo lives beside the real path.** A demo tenant (`is_demo: true`) flows through the *same* surface loaders as real data. There is no demo-specific rendering path to drift out of sync.
- **Authoring is the pressure test.** Twelve-plus varied deals per industry — long goal text, edge-case names, empty fields — is exactly what surfaces rendering bugs like the overflow before a prospect ever sees them. We verify each industry live before moving on.

The only real cost is **authoring**: ~7 hand-written deal narratives per industry × 4 industries ≈ 28 deals. That is additive, reversible content work — the safe kind.

---

## 2. Architecture

### 2.1 One tenant per industry

Today: one demo tenant `mallin-demo`, one flat `DEMO_PIPELINE` array. New model: four demo tenants, one per industry, each `is_demo: true`:

| Industry | Tenant slug | Clerk org |
|---|---|---|
| SaaS | `mallin-demo-saas` | SaaS demo |
| Med Devices | `mallin-demo-meddev` | Med Devices demo |
| Logistics | `mallin-demo-logistics` | Logistics demo |
| Real Estate | `mallin-demo-realestate` | Real Estate demo |

Surfaces resolve `orgId` (from Clerk `auth()`) → `tenants.slug` in every loader. Switching the active org switches the whole cockpit. No loader changes required.

### 2.2 Data structure

Restructure `lib/demo/` from one flat array into per-industry books:

```
lib/demo/
  pipeline.ts                 (unchanged: DemoDeal type + brief() expander)
  industries/
    index.ts                  registry: export const INDUSTRIES: DemoIndustry[]
    saas.ts                   { slug, name, industryLabel, deals: DemoDeal[] }
    meddevices.ts
    logistics.ts
    realestate.ts
```

`DemoIndustry = { slug, name, industryLabel, deals: DemoDeal[] }`. The existing 5 deals are NOT reused — per decision, all four industries are authored fresh (the current mixed-industry demo can stay as a separate "general" tenant or be retired).

### 2.3 Seeder

`scripts/db/seed-demo-pipeline.ts` becomes industry-parameterized: loop `INDUSTRIES`, upsert one tenant per industry, seed its deals. Idempotent on `(tenant, source_system, source_external_id)`, exactly as today. Optional `--industry=<slug>` flag to re-seed one at a time.

### 2.4 The toggle — custom branded picker (Option B)

A segmented-pill control in the app-shell header, on the `--ck-` brand, listing the four industries. Tapping one calls Clerk `setActive({ organization })` to switch the active org; the next surface load resolves the new tenant. Gated to only appear when the active tenant is a demo tenant (`is_demo`) — never shown to real users.

**Load-bearing dependency:** the demo login must be a member of all four Clerk organizations. Creating those orgs + adding the demo user is a Clerk-dashboard/API action. To confirm at slice 1: whether the repo has Clerk admin API access to script it, or whether these orgs must be created by hand in the Clerk dashboard.

---

## 3. Scenario spread (per industry, 7 deals)

Each industry's book must keep every surface populated — Home's needs-you/on-track mix, the ledger's won+lost, Knowledge's plays+traps. Fixed template so no surface renders empty:

| # | State | Dimension it dramatizes |
|---|---|---|
| 1 | Closed won | competitor displaced → Knowledge "winning play" |
| 2 | Closed lost | lost on price / no-decision → Knowledge "trap" + ledger |
| 3 | Stalled | budget freeze / procurement limbo |
| 4 | Needs you (at risk) | champion left → single-threaded |
| 5 | Needs you (at risk) | timeline slipping, no compelling event |
| 6 | On track | multithreaded, clean advance |
| 7 | On track (early) | need still being established |

Call excerpts carry the competitor / budget / need / timeline tension. Airtime and stage numbers are hand-authored and must stay internally consistent per deal (no validation catches drift).

---

## 4. Build order — 4 slices, verify live between each

**Slice 1 — Mechanism + prove the switch (minimal content).**
Restructure demo data into per-industry books; make the seeder industry-parameterized; create the four Clerk orgs + demo-user memberships (or confirm who does); seed *two* industries with 1–2 placeholder deals each; prove in-app with a bare switch that flipping the active org swaps which deals render. Goal: plumbing proven with near-zero content invested. Resolve the Clerk-org dependency here.

**Slice 2 — The branded picker (Option B).**
Build the segmented-pill control in the app-shell header, wired to `setActive`, gated to demo tenants. Verify it flips cleanly and never appears for real users.

**Slice 3 — Author SaaS fully (template industry).**
All 7 deals across the section-3 spread. Seed, then drive every surface live — the pressure test.

**Slice 4 — Author Logistics, Med Devices, Real Estate.**
One industry at a time, seed + verify after each. Pure additive content; cannot break the mechanism proven in slices 1–2.

---

## 5. What is explicitly out of scope

- No changes to real-tenant surface loaders or rendering. If a surface needs a fix, it's a bug that would affect real users too — handle it as its own change, not folded into demo work.
- No LLM generation in the demo path. All demo content is hand-authored spec expanded synchronously.
- No per-prospect tailoring yet. The structure (per-industry books + registry) is chosen so a tailored variant is easy to add later, but that's a future build.
