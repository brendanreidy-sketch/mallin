# SaaS demo book v1 — implementation & seed plan

**Status:** plan only · **ON HOLD until a design-partner demo is booked** · **READY TO IMPLEMENT when
a demo is scheduled** · nothing here has been run · no code changed, no data written.
**Pairs with:** [saas-demo-book-v1.md](saas-demo-book-v1.md) (approved narratives).
**Scope:** seed the four v1 deals (Cloudpeak · won, Tanager Commerce · lost, Vela · at risk,
Keelstone Data · on track) into the existing **SaaS demo tenant**, and retire the placeholder.

> **Critical safety fact.** The demo tenant lives in the **same Supabase project as real
> production data** (project `ylbhjgrsifykncfotdbd`). Isolation is therefore by **`tenant_id`
> scoping + an `is_demo = true` guard**, not a separate database. Every write, cleanup, and
> rollback statement below is scoped `WHERE tenant_id = <demo tenant id>`. There are **no
> unscoped statements**. Because this writes to the production database (demo rows only),
> **executing the seed is a production-data action and needs explicit approval + the
> canary-first flow** — this document is the plan, not the execution.

---

## Pre-seed gate (mandatory, in order — do not skip)

No write to Supabase happens until all six are satisfied, in this order:

1. **Show the exact target tenant** — run the read-only preflight (§3) and record the tenant id + slug.
2. **Confirm `is_demo = true`** — the resolved tenant must be the SaaS demo tenant and must not appear
   in the non-demo list.
3. **Back up the existing demo-tenant records** (§4) to a timestamped file; keep it until confirmed.
4. **Run the dry run** (§5) and confirm the planned per-table counts match §1 exactly.
5. **Confirm the command cannot affect another tenant** (§7) — seeder is `--tenant`-scoped, every
   cleanup/rollback statement is `WHERE tenant_id = :T`, no unscoped statements.
6. **Pause for explicit approval before writing to Supabase.** The seed runs only on an explicit "yes,"
   on the canary/prod-debug path, because the demo tenant shares the production database.

---

## 0. What changes (and what does not)

**Code (one file, plus one optional safety flag):**
- `lib/demo/industries/saas.ts` — replace the single placeholder deal with the four authored
  `DemoDeal` objects. Keep `key: "saas"`, `label: "SaaS"`; update `sellerContext`.
- *(Optional, recommended)* add a `--dry-run` flag to `scripts/db/seed-demo-pipeline.ts` that
  prints the planned upserts and counts and **writes nothing**. Small, isolated, testable.

**Not touched:** `lib/demo/pipeline.ts` (the `DemoDeal` type + `brief()` already support every
field used), `lib/demo/industries/index.ts` (already registers `SAAS`), all real-tenant surface
loaders, auth, and the database schema (no migration).

**Deal keys (state-based, name-independent** — so the Appendix-C renames change only display
strings, never record identifiers**):**
`saas_won_cloudpeak` · `saas_lost_tanager` · `saas_atrisk_vela` · `saas_ontrack_keelstone`.

---

## 1. Every record that will be inserted or updated

All rows carry `source_system = 'manual'` and upsert on the seeder's existing conflict keys
(`tenant_id, source_system, source_external_id`; stakeholders/internal add `account_id`). Per
deal the seeder writes: 1 `accounts`, 1 `opportunities`, its `stakeholders`, 2 `internal_participants`
(Demo Rep, Demo SE), its `calls`, 1 `execution_artifacts` (demote-prior-then-insert `is_current`),
and 1 `deal_outcomes` **only** for closed deals.

| Table | Cloudpeak (won) | Tanager (lost) | Vela (at risk) | Keelstone (on track) | Total |
|---|---|---|---|---|---|
| accounts | 1 | 1 | 1 | 1 | **4** |
| opportunities | 1 | 1 | 1 | 1 | **4** |
| stakeholders | 3 | 2 | 3 | 3 | **11** |
| internal_participants | 2 | 2 | 2 | 2 | **8** |
| calls | 5 | 3 | 4 | 5 | **17** |
| execution_artifacts (is_current) | 1 | 1 | 1 | 1 | **4** |
| deal_outcomes | 1 | 1 | 0 | 0 | **2** |

Stakeholder rows per deal (name · committee_role written by the seeder's `ROLE_MAP`):
- **Cloudpeak:** Dana Okafor · champion; Marcus Feld · economic_buyer; Priya Rao · technical_buyer.
- **Tanager:** Sam Ellis · user (would-be champion, no budget); Rachel Voss · economic_buyer
  (present as a record so the *unengaged EB* is visible; she has zero calls).
- **Vela:** Jordan Wells · champion (departed — still a record, absent from the last call); Erin
  Blake · user; Hal Munoz · economic_buyer.
- **Keelstone:** Gabe Ruiz · champion; Ivy Chen · economic_buyer; Leo Park · technical_buyer.

`opportunities` fields per deal come straight from the Appendix-A matrix (`stage_label`,
`stage_position`/`total_stages`, `amount`, `close_date`, `deal_posture` via `POSTURE_MAP`,
`methodology_type = 'MEDDPICC'`). `deal_outcomes` for Cloudpeak (`won`, `risk_materialized:false`,
`move_taken:true`) and Tanager (`lost`, `risk_materialized:true`, `move_taken:false`).

**Seed command** (industry mode; writes only to the tenant you pass):
```
tsx --env-file=.env.local scripts/db/seed-demo-pipeline.ts --industry saas --tenant <DEMO_SLUG>
```
`<DEMO_SLUG>` = the SaaS demo tenant's `slug` (the Clerk org id), confirmed by the preflight (§3).

---

## 2. How the existing placeholder deal is removed

Current placeholder in the tenant: `key = saas_placeholder_won` → `acct_saas_placeholder_won`,
`opp_saas_placeholder_won` (live opportunity `43ab08bc-2441-4385-bed5-4c433f71d182`), its
`sth_…sample_champion`, two internals, `call_…call_01`, one `execution_artifact`, and a
`deal_outcomes` row.

**Decision: delete, do not reuse.** Reusing the key for Cloudpeak would keep the opportunity id but
still orphan the placeholder's name-keyed child rows (the "Sample Champion" stakeholder, the
placeholder call). A scoped delete is deterministic and leaves no orphans.

**Order (FK-safe, children first), all scoped to the demo tenant:**
```
-- :T = demo tenant id from §3; run inside a transaction
delete from execution_artifacts where tenant_id = :T
  and opportunity_id in (select id from opportunities where tenant_id = :T and source_external_id = 'opp_saas_placeholder_won');
delete from deal_outcomes       where tenant_id = :T
  and opportunity_id in (select id from opportunities where tenant_id = :T and source_external_id = 'opp_saas_placeholder_won');
delete from calls               where tenant_id = :T and source_external_id like 'call_saas_placeholder_won%';
delete from internal_participants where tenant_id = :T and source_external_id like 'int_saas_placeholder_won%';
delete from stakeholders        where tenant_id = :T and source_external_id like 'sth_saas_placeholder_won%';
delete from opportunities       where tenant_id = :T and source_external_id = 'opp_saas_placeholder_won';
delete from accounts            where tenant_id = :T and source_external_id = 'acct_saas_placeholder_won';
```
**Sequencing:** seed the four new deals first, verify them present (§5), **then** run this delete,
then verify the placeholder is gone — so the tenant is never left empty.

---

## 3. Read-only preflight — confirm the target tenant

Run these **SELECTs only** (Supabase SQL editor or a read-only script). They confirm the tenant and
prove it is a demo tenant before anything is written.
```
-- a) find the SaaS demo tenant and capture its id (:T) and slug (:DEMO_SLUG)
select id, slug, name, is_demo, crm_provider
from tenants
where is_demo = true and name ilike '%saas%';

-- b) SAFETY: list the real (non-demo) tenants so we can eyeball that :T is NOT one of them
select id, slug, name, is_demo from tenants where is_demo = false;

-- c) show what is in the demo tenant today (should be the single placeholder deal)
select source_external_id, name, stage_label, amount, deal_posture
from opportunities where tenant_id = :T order by source_external_id;
```
**Gate:** proceed only if (a) returns exactly one row, its `is_demo = true`, and its id/slug match
the "Mallin Demo · SaaS" org; and :T does not appear in (b). If any check fails, stop.

---

## 4. Backup / export of the existing demo-tenant records

Before any write or delete, dump the current demo-tenant rows to a timestamped file (read-only
SELECTs; no mutation). Either via the SQL editor (export each result as JSON) or a small read-only
node script using the service-role key, writing to `scripts/db/backups/saas-demo-<UTC-timestamp>.json`:
```
for tbl in tenants accounts opportunities stakeholders internal_participants calls execution_artifacts deal_outcomes:
    select * from <tbl> where tenant_id = :T;   -- serialize each result into the backup file
```
Keep the backup file until the release is confirmed good. It is the source for the §6 rollback.

---

## 5. Dry run, then seed, then post-seed verification

**Dry run (no writes).** Preferred: run the seeder with the new `--dry-run` flag — it builds every
record and the `brief()` artifact in memory, prints the per-table counts from §1, and writes
nothing. No-code alternative: seed into a throwaway tenant `--tenant mallin-demo-saas-staging`,
inspect, then drop that staging tenant. Either way, confirm the counts match §1 before the real run.

**Seed** (after approval + on the canary/prod-debug path):
```
tsx --env-file=.env.local scripts/db/seed-demo-pipeline.ts --industry saas --tenant <DEMO_SLUG>
```
Idempotent — re-running upserts the same rows, never duplicates.

**Post-seed verification — database:**
```
select
  (select count(*) from accounts             where tenant_id = :T) as accounts,      -- expect 4 (after cleanup)
  (select count(*) from opportunities        where tenant_id = :T) as opportunities, -- expect 4
  (select count(*) from stakeholders         where tenant_id = :T) as stakeholders,  -- expect 11
  (select count(*) from calls                where tenant_id = :T) as calls,         -- expect 17
  (select count(*) from execution_artifacts  where tenant_id = :T and is_current) as current_artifacts, -- expect 4
  (select count(*) from deal_outcomes        where tenant_id = :T) as outcomes;      -- expect 2
-- and: no placeholder rows remain
select count(*) from opportunities where tenant_id = :T and source_external_id like '%placeholder%'; -- expect 0
```
**Post-seed verification — canary UI (in the SaaS demo org on `canary.mallin.io`):**
- Cockpit: **Needs you · 1** (Vela), **On track · 1** (Keelstone); Cloudpeak + Tanager not cluttering Home.
- Prep renders cleanly for all four (each section populated where authored; empty-prior-call block
  correctly hidden where there's no synthesis).
- Ledger: Cloudpeak (won) + Tanager (lost) with correct reasons and risk/move flags.
- Knowledge: Cloudpeak winning play + Tanager trap present.
- The placeholder ("Placeholder SaaS Co") is gone.
- **Real org untouched:** your real cockpit/prep unchanged.

---

## 6. Rollback procedure

Because this is demo data in the shared DB, rollback is a scoped restore — never a broad delete.

**Data rollback (to the pre-seed state):**
```
-- delete the four new deals' rows (FK-safe order), scoped to the demo tenant and the new keys
delete from execution_artifacts where tenant_id = :T and opportunity_id in
  (select id from opportunities where tenant_id = :T and source_external_id in
   ('opp_saas_won_cloudpeak','opp_saas_lost_tanager','opp_saas_atrisk_vela','opp_saas_ontrack_keelstone'));
delete from deal_outcomes        where tenant_id = :T and opportunity_id in ( …same select… );
delete from calls                where tenant_id = :T and source_external_id like 'call_saas_won_cloudpeak%'
                                    or (tenant_id = :T and source_external_id like 'call_saas_lost_tanager%')
                                    or (tenant_id = :T and source_external_id like 'call_saas_atrisk_vela%')
                                    or (tenant_id = :T and source_external_id like 'call_saas_ontrack_keelstone%');
delete from internal_participants where tenant_id = :T and source_external_id like 'int_saas_%';
delete from stakeholders         where tenant_id = :T and source_external_id like 'sth_saas_won_%'
                                    /* …atrisk/ontrack/lost… */;
delete from opportunities        where tenant_id = :T and source_external_id like 'opp_saas_won_cloudpeak' /* …+ 3 … */;
delete from accounts             where tenant_id = :T and source_external_id like 'acct_saas_won_cloudpeak' /* …+ 3 … */;
-- then re-insert the placeholder rows from the §4 backup file (restores the pre-seed tenant exactly)
```
(Exact statements will be generated from the final keys; every one stays `WHERE tenant_id = :T`.)

**Code rollback:** revert the `saas.ts` commit (and the optional `--dry-run` seeder commit); redeploy
the prior build via the standard alias rollback if a build shipped. The demo content and the code are
independent — either can be rolled back without the other.

**Fastest path:** because it is a demo tenant, the simplest recovery is often just re-running the
seeder after fixing the book, or restoring the backup — no user is affected either way.

---

## 7. Confirmation that no real tenant can be affected

- **Preflight gate (§3):** proceed only when the resolved tenant has `is_demo = true` and matches
  the SaaS demo org, and is confirmed *not* to be any `is_demo = false` tenant.
- **Seeder scoping:** `seed-demo-pipeline.ts` writes only to the tenant passed via `--tenant`, and
  `ensureTenant` sets/asserts `is_demo = true`. There is no code path that writes across tenants.
- **Every cleanup + rollback statement is `WHERE tenant_id = :T`** (plus a `source_external_id`
  filter). No statement in this plan is unscoped.
- **Real tenants differ by `tenant_id` and `is_demo = false`** — none of the filters above can match
  them.
- **Execution is gated:** the seed is run on the canary/prod-debug path and only after explicit
  approval, with the §4 backup taken first.

---

## 8. Effort & sequence to execute (after approval)

1. (If renaming) apply the Appendix-C renames to display strings in the narrative + `saas.ts`.
2. Author the four `DemoDeal` objects in `saas.ts`; add optional `--dry-run` to the seeder.
3. Typecheck + build.
4. Preflight (§3) + backup (§4) + dry run (§5).
5. Deploy to prod-debug → canary; seed the demo tenant; run post-seed verification (§5).
6. Delete the placeholder (§2); re-verify.
7. Pause for approval before treating it as the live demo book; keep the backup until confirmed.

Engineering ≈ half a day; the real cost remains authoring the four narratives into schema-accurate
`DemoDeal` objects (already specified in the narrative doc). **Remaining three deals = v2**, after a
real design-partner demo.
