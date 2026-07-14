# Demo account setup

This doc walks through provisioning the Mallin demo account so a rep
can log in and use the `/prep` cockpit on a fictional deal without any
external systems being touched.

## What this gives you

A working login at `mallin.io`:

- **Tenant:** `mallin-demo` (slug), `is_demo=true`
- **Account:** Hooli Holdings (industrial holding co, 9 subsidiaries)
- **Opportunity:** Hooli Holdings — TMS evaluation, $185K ARR
- **Stakeholders:** Marcus Hale (champion, thin), Linda Park (EB, absent),
  Devin Roy (procurement, moderate), Sarah Vega (controller, absent)
- **5 calls** with summaries (Feb 12 → Apr 9, 2026)
- **Pass 4 execution artifact** — three risks (champion thinning HIGH,
  EB invisible HIGH, competitor anchor MEDIUM), MEDDPICC pillar
  coverage, stakeholder strategy, talk track, open questions,
  coaching notes — everything the cockpit's analysis pane renders
- **Simulation banner** pinned to `/prep` — no Gmail / CRM / Slack writes

Reps you give the credentials to will hit `/prep`, click around the
real cockpit surfaces, draft emails, approve action-queue items —
nothing escapes to actual external systems.

## One-time setup

### 1. Run migration 008

The migration adds `tenants.is_demo` (boolean default false) plus a
partial index for the cheap "is demo" lookup.

```bash
node scripts/db/run_migration.mjs supabase/migrations/008_tenant_is_demo.sql
```

(Or apply via your usual Supabase migration tool.)

### 2. Seed the demo tenant + Hooli Holdings substrate

```bash
npx tsx scripts/db/seed-demo-tenant.ts
```

The script is idempotent — safe to re-run. It will:

- Create tenant `mallin-demo` with `is_demo=true` (or flip the flag if
  the row exists but isn't a demo)
- Upsert account, opportunity, stakeholders, internal participants, calls
- Print the tenant UUID and opportunity UUID at the end — save these,
  you'll need the opportunity UUID for the prep URL

Output looks like:

```
+ tenant created: <uuid> (mallin-demo, is_demo=true)
  ✓ account: <uuid>
  ✓ opportunity: <uuid>
  ✓ stakeholders: 4
  ✓ internal participants: 2
  ✓ calls: 5

IDs:
  tenant_id      = <uuid>
  tenant_slug    = mallin-demo
  account_id     = <uuid>
  opportunity_id = <uuid>
```

### 3. Provision a Clerk user mapped to the demo tenant

**A. Create a Clerk organization with id `mallin-demo`**

In the Clerk dashboard for your production app:

1. Organizations → Create organization
2. Set the slug to `mallin-demo` (this becomes the org_id that the
   tenant-context helper looks up in `tenants.slug`)
3. Name it "Mallin Demo" or similar

**B. Create a demo user**

1. Users → Create user
2. Email: `demo@mallin.io` (or whatever convention you prefer)
3. Set a password manually — this is what you'll share with reps you
   want to grant access to
4. Add the user to the `mallin-demo` organization with role "admin" or
   "basic_member" (either works)

**C. Test the flow**

1. Open `https://mallin.io/sign-in` in an incognito window
2. Sign in as `demo@mallin.io` with the password you set
3. You should land on `/prep` (or whatever the default post-sign-in
   route is)
4. The sticky **Simulation mode** banner should be visible at the top
   of the page
5. The deal list should show **Hooli Holdings — TMS evaluation**

If you don't see the banner, double-check the tenant row has
`is_demo=true`:

```sql
select id, slug, name, is_demo from tenants where slug = 'mallin-demo';
```

## Granting access to a rep

Just share the credentials directly. No self-sign-up flow exists yet
(intentionally) — you control who gets in.

Email template:

> Subject: Mallin demo access
>
> Hey,
>
> Login at https://mallin.io/sign-in with:
>   email: demo@mallin.io
>   password: <the password you set>
>
> Drop you into the Mallin cockpit on a sample deal (Hooli Holdings).
> Simulation mode is on so nothing actually sends to Gmail or writes
> to CRM — click around freely. The banner at the top will remind you.
>
> Anything you want me to walk you through? Happy to do a 20.

## What simulation mode intercepts

When the user's tenant has `is_demo=true`, every external-write path
short-circuits to a simulated success:

| Surface | Intercept location | Behavior in sim mode |
|---|---|---|
| Email send | `/api/gmail/send` route | Returns `{ ok: true, simulated: true, message_id: "demo-msg-..." }` — no Gmail call |
| CRM field write | `/api/crm/apply-suggestion` route | Returns `{ ok: true, simulated: true }` — no provider call |
| Action queue execution | `lib/action-queue/executors.ts` dispatcher | Returns simulated ExecutionResult with `executor: "demo_simulated_*"` — no real executor runs |
| `risk_ack` queue action | (unchanged in sim mode) | Substrate-internal — writes to `touches` table, safe to run |
| `deferral` queue action | (unchanged in sim mode) | Queue-internal — no external side effect |

Defense in depth: both API routes AND the executor dispatcher check
`is_demo` before any external write. Either layer alone would prevent
escape; together they're belt-and-suspenders.

## Adding more demo content (later)

Wave 1 ships the wiring + the Hooli Holdings Pass 4 artifact.
Subsequent waves can add:

- **(NO LONGER NEEDED)** ~~Pass 4 execution_artifact for Hooli Holdings~~ —
  shipped in the seed script. Three risks, MEDDPICC coverage, stakeholder
  strategy, talk track, open questions, coaching notes. Insert path is
  the `execution_artifacts` table with `tenant_id` = demo tenant's id,
  `opportunity_id` = Hooli opp's id,
  `is_current=true`.
- **Additional fictional deals** — re-use the substrate type at
  `lib/demo/substrate/hooli-holdings.ts`. Each deal seeds another
  opportunity under the same demo tenant.
- **Action queue items** — pre-populate the queue with three
  pending items (email draft, manager Slack DM, CRM update bundle)
  so the demo lands on a populated queue rather than an empty one.

## Removing the demo tenant

If you ever need to wipe and re-seed:

```sql
-- Find the tenant
select id from tenants where slug = 'mallin-demo';

-- Cascade-clean (run with the id from above)
delete from action_queue where tenant_id = '<id>';
delete from execution_artifacts where tenant_id = '<id>';
delete from touches where tenant_id = '<id>';
delete from activities where tenant_id = '<id>';
delete from emails where tenant_id = '<id>';
delete from calls where tenant_id = '<id>';
delete from internal_participants where tenant_id = '<id>';
delete from stakeholders where tenant_id = '<id>';
delete from opportunities where tenant_id = '<id>';
delete from accounts where tenant_id = '<id>';
delete from tenants where id = '<id>';
```

Then re-run `npx tsx scripts/db/seed-demo-tenant.ts` to start fresh.

Or just flip the flag without deletion:

```sql
update tenants set is_demo = false where slug = 'mallin-demo';
```

The simulation banner disappears, intercepts go cold, the tenant
becomes a "real" tenant — useful if you want to test the production
path against the demo data.
