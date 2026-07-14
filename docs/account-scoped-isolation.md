# Account-scoped isolation + re-homing

**Status:** design doc · contract only · NOT implemented · foundational fork
**Last updated:** 2026-06-02
**Companion memory:** `account_scoped_memory_audit.md`, `signup_to_first_brief_roadmap.md`

> The fork this resolves: **is `tenant` the security boundary, or is `account/engagement` the security boundary?**
> Decision: move the boundary to **account**. `tenant` becomes a commercial/billing/grouping overlay. A membership/grant table becomes the authority for "who can see or operate on an account."
>
> Target shape: `User → AccountGrant → Account/Engagement → Artifacts`
> (replacing today's `User → Tenant → Account → Artifacts`)
>
> Success test: *"An enterprise buys tomorrow. What moves? **Nothing** — only permissions change."*

---

## 1. Current problem

Audited June 2 2026 (`supabase/migrations/*`, `lib/auth/tenant-context.ts`, `lib/cockpit/access.ts`, `lib/db/load-deal.ts`).

- **Artifacts are already account-shaped.** `account_intelligence_artifacts` has zero user columns and is explicitly "account-shaped, not deal-shaped." `stakeholders` is account-scoped (migration 013). `rep_notes` ships a dormant `account_id` + `attach_to`. `touches`/`rep_notes` treat the user as *provenance/author*, not owner. ~70% of the data layer already matches the target.
- **Security is still tenant-shaped.** `tenant` binds 1:1 to a Clerk org (`tenant-context.ts`: `orgId → tenants.slug → tenants.id`, `.single()`), and a denormalized `tenant_id` on every descendant row is both the **RLS key** and the **`ON DELETE CASCADE` root**.
- **Re-homing across tenants requires a migration.** Because `tenant_id` is stamped on every leaf and is the security key, moving an account to a new workspace = rewriting `tenant_id` on every artifact/substrate row. The "nothing moves" test fails today.
- **No membership layer exists.** Access is a hardcoded email allowlist (`lib/cockpit/access.ts`), whose own TODO says *"membership is the product."*
- **Two genuinely user-scoped tables** (`action_queue`, `live_coach_turns`) and **two tables lacking `account_id`** (`execution_artifacts`, `rep_behavior_artifacts`) are the cleanup surface. `action_queue` is the worst: no `account_id`, `opportunity_id` is loose `TEXT`.

## 2. Target model

- **`accounts` become portable engagement containers.** An account has stable identity independent of who currently owns or can see it. Its descendants (opportunities, artifacts, substrate) never change identity on re-home.
- **`account_grants` define access.** A grant maps a *principal* (a user, or an org) to an account with a *role* and *status*. This is the new RLS authority — replacing `tenant_id = jwt.tenant_id`.
- **`tenants` become billing/grouping overlays, not artifact owners.** `tenant_accounts` expresses the (mutable, transferable) commercial ownership/grouping of an account by a tenant. `accounts.tenant_id` is demoted to a deprecated cache during transition, then dropped as the isolation key.
- **`account_governance_profile` carries the workspace tier** (`personal | team | enterprise`) and governance config — dormant/permissive in personal mode, activated on enterprise claim. This is the "born-governance-ready, dormant" pattern made concrete.

```
        ┌──────────┐        ┌─────────────────┐
 User ──┤AccountGrant├──────►│ Account /        │◄──── tenant_accounts ──── Tenant
        └──────────┘        │ Engagement       │      (billing/grouping overlay)
 Org  ──┤AccountGrant├──────►│  ├─ opportunities │
        └──────────┘        │  ├─ artifacts     │      account_governance_profile
                            │  └─ substrate     │      (tier + governance config)
                            └─────────────────┘
```

## 3. Tables (proposed DDL — not applied)

> All additive. Nothing below drops or rewrites existing columns in Phase 0.

### 3.1 `account_grants` — the access authority

```sql
CREATE TABLE account_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Principal: an individual user OR an org/tenant.
  principal_type  TEXT NOT NULL CHECK (principal_type IN ('user','org')),
  principal_id    TEXT NOT NULL,         -- Clerk user_id (user) | tenant_id::text or Clerk org_id (org)
  role            TEXT NOT NULL CHECK (role IN ('owner','operator','manager','viewer')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','revoked')),
  granted_by      TEXT,                  -- provenance: who created the grant
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ
);
-- At most one active grant per (account, principal).
CREATE UNIQUE INDEX uniq_active_grant
  ON account_grants(account_id, principal_type, principal_id)
  WHERE status = 'active';
-- Primary access read path: "which accounts can this principal see?"
CREATE INDEX idx_grants_principal
  ON account_grants(principal_type, principal_id, status);
```

Role semantics: `owner` = personal-workspace creator / claiming enterprise; `operator` = the rep actively working the deal; `manager` = read across team accounts; `viewer` = read-only.

### 3.2 `tenant_accounts` — commercial/grouping overlay

```sql
CREATE TABLE tenant_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  relationship  TEXT NOT NULL CHECK (relationship IN ('owner','billing','historical')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_transfer','released')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at   TIMESTAMPTZ
);
-- Exactly one active 'owner' tenant per account (the account's current home).
CREATE UNIQUE INDEX uniq_active_owner_tenant
  ON tenant_accounts(account_id)
  WHERE relationship = 'owner' AND status = 'active';
CREATE INDEX idx_tenant_accounts_tenant ON tenant_accounts(tenant_id, status);
```

### 3.3 `account_governance_profile` — tier + dormant governance

```sql
CREATE TABLE account_governance_profile (
  account_id           UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  governance_mode      TEXT NOT NULL DEFAULT 'personal'
                         CHECK (governance_mode IN ('personal','team','enterprise')),
  sso_required         BOOLEAN NOT NULL DEFAULT FALSE,
  manager_visibility   BOOLEAN NOT NULL DEFAULT FALSE,
  approval_required     BOOLEAN NOT NULL DEFAULT FALSE,
  retention_days       INTEGER,            -- NULL = indefinite (personal default)
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Visibility badge = computed projection, never a stored property.** The account-card badge ("🔒 Personal · only you" / "👁 Team · visible to …" / "🏢 Governed · SSO · CRM Sync · Retention") MUST be a pure function of `account_grants` + `account_governance_profile`, recomputed on read. It is the psychologically load-bearing surface (the rep's first question about any artifact is *"who can see this?"*, not *"what can the AI do?"*), so it belongs **next to the account name, not in settings**. A denormalized/settable visibility string is forbidden: a "Personal" badge over actually-shared data is an active lie and a permanent trust break — worse than no badge. This is `type_level_ux_guards` / `integrity_preserving_friction` applied to the visibility surface. Visibility *transitions* (e.g. personal→team on transfer accept) are a **notified moment**, never a silent re-badge.

### 3.4 `account_transfers` — auditable re-home / claim object

```sql
CREATE TABLE account_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  from_principal  TEXT NOT NULL,           -- personal owner (user grant) being re-homed
  to_tenant_id    UUID NOT NULL REFERENCES tenants(id),
  status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','accepted','rejected','completed')),
  initiated_by    TEXT NOT NULL,
  accepted_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);
```

### 3.5 Artifact-table backfill columns (additive)

Add `account_id UUID REFERENCES accounts(id)` to the tables that lack it, so RLS can gate on account membership without joining through `opportunities` on every query:

- `execution_artifacts` — add `account_id`, backfill from `opportunities.account_id`.
- `rep_behavior_artifacts` — same.
- `live_coach_turns` — same.
- `action_queue` — add `account_id`; index `(account_id, created_at DESC)`; populate server-side at write by resolving `opportunity_id → account`; two-pass backfill (UUID match, then `opportunities.source_external_id` match, then quarantine residue). Flip `NOT NULL` once populated. **FK tightening of `opportunity_id TEXT` is a separate later phase — see Open Question #3.**

`rep_notes` and `touches` already carry `account_id` (rep_notes' is dormant) — just populate it.

## 4. Access rules

Single resolver replaces both `getCurrentTenant()` and the `access.ts` allowlist:

```ts
type AccountRole = 'owner' | 'operator' | 'manager' | 'viewer';

// ctx.userId is native to the Clerk session (always present).
// ctx.orgIds is DERIVED (see "Clerk constraint" below) — never client-supplied.
async function resolveAccountRole(
  ctx: { userId: string; orgIds: string[] },
  accountId: string,
): Promise<AccountRole | null>;

async function listAccessibleAccounts(
  ctx: { userId: string; orgIds: string[] },
): Promise<Array<{ accountId: string; role: AccountRole }>>;
```

Rules:
- **User can read an account** iff an `active` grant exists where `(principal_type='user', principal_id=userId)`. **Keys on `userId` only — native to the session, zero Backend calls.**
- **Manager/org can read an account** iff an `active` grant exists where `(principal_type='org', principal_id ∈ ctx.orgIds)` — manager visibility flows through an org grant, not a per-row tenant stamp.
- **Enterprise tenant can claim/re-home** an account only via an `accepted` `account_transfers` row (§6).
- **Consultant case** falls out for free: one user holds several `user` grants to accounts owned by different tenants. No `.single()` tenant assumption — and crucially, the user-grant path is **unaffected by Clerk's active-org limit** (it keys on `userId`, not org).

### Clerk constraint (verified June 2 2026 — `@clerk/nextjs` 6.39.3 / `@clerk/backend` 2.33.3)

- Clerk supports multi-org users, but **a session has exactly one *active* org**. `auth()` exposes `{ userId, orgId, orgRole, orgSlug, orgPermissions }` for the **active org only** — there is no native list of all the user's orgs in the session/JWT.
- **`ctx.orgIds` is therefore DERIVED, not native.** Full enumeration requires the Backend API: `clerkClient().users.getOrganizationMembershipList({ userId })` (paginated ≤500; each membership carries `role` + `permissions`). This pattern already runs in the codebase (`app/api/notes/route.ts` uses `clerkClient().users.getUserList`).
- **The active-org limit only bites the org-grant path.** Decision for that path:
  - **(a) active-org-only** — use native `orgId`; zero latency, Clerk-idiomatic; a manager sees one org's accounts per active context and switches orgs to switch the set.
  - **(b) full derived list** — `getOrganizationMembershipList` per request, or (production-grade) a **webhook-synced local `org_memberships` table** (Clerk `organizationMembership.created/updated/deleted`); manager sees all orgs at once, no per-request Clerk call, and RLS can read `org_ids` locally. Dovetails with the `org.created → tenant` provisioning already planned in Phase 3.
- **Security invariant:** because `org_ids` feeding RLS is app-derived (not a JWT claim), it must come from an authoritative source (Backend API or webhook-synced table), **never the client**, and must **fail closed** — under-populating under-grants (safe); over-populating leaks (unsafe). The user-grant path has no such risk (`userId` is JWT-native).

RLS rewrite (illustrative, applied at cutover not Phase 0):

```sql
-- Session GUCs set by the API layer: app.user_id, app.org_ids (csv).
CREATE POLICY artifact_account_read ON execution_artifacts FOR SELECT
USING (
  account_id IN (
    SELECT account_id FROM account_grants
    WHERE status = 'active'
      AND (
        (principal_type = 'user' AND principal_id = current_setting('app.user_id', true))
        OR (principal_type = 'org'  AND principal_id = ANY (string_to_array(current_setting('app.org_ids', true), ',')))
      )
  )
);
```

## 5. Migration path (additive → dual-read → demote)

**Do not rewrite everything now.** Strict ordering, each phase reversible until the next begins.

- **Phase 0 — additive (no behavior change).** Create the four new tables. Add `account_id` to the artifact tables and backfill from `opportunities`. Backfill grants/overlay from current state: for every existing `(tenant, account)`, insert `tenant_accounts(relationship='owner', status='active')` + an `org` grant `(principal_type='org', principal_id=tenant_id, role='operator')`, and `account_governance_profile(governance_mode='team')` for existing customer tenants. Tenant RLS remains authoritative. Nothing breaks.
- **Phase 1 — dual-read.** Access layer checks **both** the legacy tenant gate **and** the new grant gate (`grant OR tenant`), logging any divergence. Goal: prove grants cover exactly what the tenant gate covered. No user-visible change.
- **Phase 2 — cutover.** Grant-based RLS + resolver become authoritative. `accounts.tenant_id` demoted to deprecated cache. Clerk org still used for **org membership** (feeding `ctx.orgIds`) but no longer the isolation key; `getCurrentTenant().single()` is replaced by `listAccessibleAccounts`.
- **Phase 3 — cleanup.** Drop tenant-keyed RLS policies. Keep `tenant_id` as nullable denormalized cache or drop. Enable the re-homing flow (§6).

## 6. Re-homing flow

**Personal workspace account (creation):**
- `account_grants`: one `(user, owner)` grant for the creator.
- `tenant_accounts`: `(personal tenant, owner, active)`.
- `account_governance_profile`: `governance_mode='personal'`, all governance flags permissive.

**Enterprise claim (e.g. Jessica's personal account → Ten Five Hospitality):**
1. Enterprise tenant creates `account_transfers(to_tenant_id, status='proposed')`.
2. Personal owner accepts → `status='accepted'`.
3. On accept, in **one transaction** (no artifact rows touched):
   - `tenant_accounts`: personal owner → `status='released'`; insert `(enterprise tenant, owner, active)`.
   - `account_grants`: add `(org=enterprise, operator|manager)`; retain or downgrade the personal user's grant per agreement.
   - `account_governance_profile.governance_mode → 'enterprise'`; apply `sso_required`, `retention_days`, `manager_visibility`.
   - `account_transfers.status → 'completed'`.
4. **Invariant:** every artifact `id`, all provenance (`logged_by_*`, `created_by_*`, `discovery_*`), and full history are unchanged. Only grants + overlay + governance mode change.

That is the literal "nothing moves, only permissions change."

## 7. Non-goals (explicit)

- **No multi-enterprise sharing** of a single account yet (one active `owner` tenant per account; the unique index enforces it).
- **No cross-account leakage** — grants are per-account; there is no tenant-wide wildcard read in the new model.
- **No manager surface** until the grant model exists (manager visibility is an `org` grant + `manager_visibility` flag, not a bespoke feature).
- **No automated transfer** — re-homing always requires an explicit `accepted` transfer by the personal owner.
- **No fuzzy identity resolution** (same-person stakeholder de-dup) — out of scope, tracked separately.
- **No implementation in this doc** — contract only. Build is gated on the §5 Phase 0 go decision.

## 8. Phase 0 go/no-go checklist (the drift gate)

> **What this is.** The architecture is settled; the live risk now is **discipline** — quietly letting Phase 0 swell into Phase 1.5. This checklist exists so that a future implementation PR can be diffed against it: every box is binary, and the **Failure criteria are a stop-work trigger, not a discussion**. Check this file before writing code and again at PR review.

### A. Must be true before Phase 0 starts

**Identity**
- [x] Clerk multi-org assumption verified (§4 Clerk constraint)
- [x] Personal tenant model approved (typed personal tenant — Open Q#1)
- [x] Employed-rep creation policy approved ((b) flag + claimable — Open Q#2)
- [x] Coaching privacy doctrine approved (`live_coach_turns` private by default)

**Data model**
- [x] Account is the durable ownership unit
- [x] Tenant is an ownership/billing envelope, **not** an access boundary
- [x] `account_grants` are the future access authority
- [x] `action_queue` account-ownership path defined (Open Q#3, two-phase)

**Migration safety** (every box must be `true` for the PR to qualify as Phase 0)
- [ ] No destructive schema changes
- [ ] No table drops
- [ ] No RLS replacement (tenant RLS stays authoritative through Phase 0)
- [ ] No `tenant_id` removal
- [ ] All changes additive
- [ ] Rollback possible by feature flag (no data backfill is load-bearing for reads yet)

**External gates** (not design questions — operational preconditions)
- [ ] Clerk instance flipped to "Membership optional" (only required before *personal creation* ships, not before the additive tables land)
- [ ] Explicit Phase 0 go decision recorded by Brendan

### B. Explicit Phase 0 scope

**Build only:**
```
accounts                (extend — already exists)
account_grants          (new)
tenant_accounts         (new)
account_governance_profile (new)
account_transfers       (new)
+ additive account_id columns on the artifact tables (§3.5)

resolveAccessContext()      (new resolver — not yet authoritative)
listAccessibleAccounts()    (new — dual-read only, logs divergence)
```

**Do NOT touch** (these consume the new model *later*, in Phase 2+, never in Phase 0):
```
Book Agent · Notes · LiveCoach · CRM Sync ·
Approval Objects · Governance Scoring · Manager Views
```
Phase 0 writes the new tables and *shadows* the resolver. It does not route a single user-visible read through grants — that is Phase 1 (dual-read) and Phase 2 (cutover).

### C. Success criteria (what Phase 0 makes *possible*, proven by Phase 2)

- **Consultant** holds one Clerk user with `user` grants to several independently-owned accounts:
  ```
  User → { Client A account, Client B account, Client C account }   (no extra Clerk users)
  ```
- **Enterprise rep** re-homes a personal account into an org workspace by claim, **artifacts untouched**:
  ```
  Personal workspace  ──claim──▶  Org workspace
  ```
- An account can be **re-homed by changing grants + overlay + governance mode, not data** (§6).

### D. Failure criteria — STOP WORK

**If any Phase 0 implementation requires:**
- [ ] moving artifacts
- [ ] copying artifacts
- [ ] dual ownership of an artifact
- [ ] account-level data migrations
- [ ] tenant-specific branching logic in the access path

**…then the design is wrong and work stops.** This is the most important line in the checklist. The entire thesis is "nothing moves, only permissions change" — any of the above is proof that the implementation has reverted to tenant-as-boundary. It is cheaper to stop and re-read this contract than to ship the drift.

> Companion stop-guard from Open Q#1: the access resolver must not even *receive* `activeTenantId`. If a Phase 0 diff passes it in, that is the same failure as the list above — surfaced as a type signature instead of a migration.

**As a PR-review rubric** (these are architectural invariants, not implementation preferences — a `yes` to any one is a `STOP`, not a discussion):

| Invariant | Review question | If yes |
|-----------|-----------------|--------|
| Account ownership | Does this change require **moving** artifacts? | STOP |
| Re-homing | Does this change require **copying** artifacts? | STOP |
| Ownership | Does this create **dual ownership** of an artifact? | STOP |
| Isolation | Does this introduce **tenant-specific branching** in the access path? | STOP |
| Access | Does any resolver **consume `activeTenantId`**? | STOP |

The value of §8 is that the doctrine is now *testable*: most systems don't fail because the initial design was wrong — they fail because, months later, someone makes a reasonable change that violates an assumption nobody remembers. This table is that assumption, written down where the change happens.

## 9. First behavioral proof (the positive test)

§8 is the **negative** test — *did we violate an invariant?* This is the **positive** test — *did anyone actually use the freedom the architecture creates?* Technical correctness ≠ usefulness: the architecture could be flawless and these behaviors never happen, which would mean the freedom was over-built for real demand. So these double as a **falsification check on the bet**, not a victory lap. The real test is not "can an account be re-homed?" — it's "does anyone re-home one?"

Three behaviors, each validating exactly one resolved decision, ordered by how early it becomes observable:

1. **Account-scoping** — a consultant signs up, creates several client accounts under **one identity**, boundaries intact. *Earliest and cheapest to observe* (needs only Phase 0 + a create flow). Signal: one `userId` holding ≥2 active `user` grants to accounts with no shared owner tenant.
2. **Re-homing** — Jessica starts personal, Macerich claims the account, artifacts untouched. Signal: an `accepted`→`completed` `account_transfers` row with **zero artifact-row writes** in the same transaction window — the §6 invariant, observable as an audit fact.
3. **Cognition promotion** — a rep promotes **one** coaching insight into organizational memory; everything else stays private. Validates the personal/organizational seam. *Downstream of more than Phase 0* (needs the promote gesture built), so it lands last.

Per `instrumentation_discipline`: each signal is narrow, behavioral, tied to the single question "did the freedom get used?", and deletable once answered. **Do not build a dashboard** — watch the first consultant, the first claim, the first promotion, by name. If those three happen, the architecture graduates from "elegant" to "useful" — which is usually the moment a doctrine becomes a moat.

> **Stop-doctrine marker (June 2 2026):** the architecture is coherent and every fork that changes a table shape is resolved. **No more foundational doctrine unless a new contradiction appears.** The next meaningful learning comes from building Phase 0 and seeing where reality pushes back — not from inventing more design.

### E. Milestone note

Six weeks ago the model was `User → Tenant → Artifacts`. This contract makes it `User → Grants → Account → Artifacts` — a strictly stronger model aligned with consultants, PLG, enterprise expansion, governance, and re-homing simultaneously. Phase 0's only job is to add the new spine **alongside** the old one without disturbing it. Formalizing this checklist is what lets anyone later tell whether an implementation is honoring the doctrine or quietly drifting from it.

---

### Open questions to resolve before Phase 0
1. ~~Does a personal workspace get its own `tenant` row?~~ **RESOLVED June 2 2026 — yes, TYPED personal tenant** (chosen over tenant-less personal: uniform ownership invariant > semantic purity; symmetric re-home; no "is this personal or org?" branching leaking into every resolver). Shape: `tenants(id, kind ∈ 'personal'|'organization', clerk_user_id NULL, clerk_org_id NULL, name)` with CHECK (`kind='personal'→clerk_user_id required`; `kind='organization'→clerk_org_id required`) and **partial unique indexes** `unique(clerk_user_id) where kind='personal'` / `unique(clerk_org_id) where kind='organization'`. Auto-create the personal tenant **lazily (create-or-get on `clerk_user_id`) at first authed request** — NOT via `user.created` webhook (races the first request). `getCurrentTenant()` → `resolveAccessContext({ userId, activeTenantId, activeTenantKind, activeOrgId?, accessibleAccountIds, grants })`.

   **GATING CONSTRAINTS (verified June 2):**
   - **Clerk config flip required.** Personal Accounts are **disabled by default** in Clerk and this instance is currently **org-required** (`lib/auth/tenant-context.ts`, `app/intake/page.tsx`, `app/cockpit/page.tsx` all throw on `!orgId`). Under org-required, a user with no org has a **pending session where `userId` is null** — so "personal keyed off userId" does NOT work until the instance is set to **"Membership optional."** That flip changes session semantics app-wide: every `!orgId` guard flips from "error, pick an org" to "personal context." Blast radius: 3 explicit guards + ~11 `getCurrentTenant()` call sites.
   - **INVARIANT — `activeTenant` must NEVER touch the access path.** It is only for (a) the default owning tenant of newly-created accounts and (b) the UI workspace lens. Access is ALWAYS derived from grants. Encode it: the access resolver must not even *receive* `activeTenantId` (if it can't see it, it can't gate on it). This is the one quietly-irreversible guard — gating a query on `activeTenantId` silently rebuilds the tenant-as-boundary bug.
   - **Lifecycle:** re-homed/org-owned accounts survive a rep leaving; personally-owned accounts orphan under a dead personal tenant on Clerk user deletion → needs a rule (delete / grace / export).

2. ~~**Employed-rep personal-context creation** (raised by #1, genuine product fork): when an org member creates a *personal*-context account holding employer deal data, it's owned by their personal tenant and the org can't see/govern it — the exfiltration-into-personal-SaaS pattern, at the creation moment.~~ **RESOLVED June 2 2026 — (b) allowed-but-flagged + org-claimable, with four guardrails.**

   **Reframe that drives it:** this looks like the coaching-privacy fork but resolves the **opposite way** — there we chose the rep because the *cognition* is the rep's; here the data is the **employer's** and the thing created is *organizational account substrate*, not personal cognition, so the org has a legitimate claim. **Scoping:** the fork only bites someone who is BOTH an org member AND creating personal-context accounts on employer data. The intended wedge (founders, fractional CROs, consultants) **owns its data** and is unaffected by any choice here — so (b) doesn't tax the target population.

   **Why not the others:** (a) block — too blunt, kills land-before-buy AND can't tell employer data from a rep's genuine side-consulting client; (c) org-owned — *silently absorbs* accounts the moment a rep joins an org, including genuinely personal ones, and contradicts the "nothing leaves without the rep pushing" doctrine. (b) preserves the wedge, gives the org a governance handle, reuses `account_transfers` (no new mechanism), absorbs nothing silently.

   **Four guardrails (all four required for (b) to be safe):**
   1. **Honest flag, visible at creation** — "Created while you're a member of [Org]; if they adopt Mallin they can claim this account." The visibility-badge / `integrity_preserving_friction` discipline applied to the *ownership* surface; employer data here is honestly not-truly-private.
   2. **Creation-time disambiguation sets the flag** — one question ("for [Org] or personal?"). The REP classifies it (rep-initiated, one-way principle). Prevents wrongly flagging a rep's side-consulting client as org-claimable. This is not DLP (a malicious rep can paste notes anywhere); the bar is *not architecturally a one-way exfiltration tool* + *clean claim path*, not *prevent a determined bad actor*.
   3. **Claim transfers the account, never the cognition** — resolves the consent question via the doctrine in `cognition_personal_account_organizational.md`: the org claim moves the *account substrate* (legitimately the employer's) through §6, but `live_coach_turns` **stays with the rep**. Account = organizational = claimable; cognition = personal = not claimable. So an org can claim a flagged employer account without it being "the manager pulling into the rep's private thread" — it structurally can't reach the cognition layer.
   4. **Provenance as dormant born-governance-ready metadata** — `created_while_member_of_org_id` on the account / `account_governance_profile`. Read by the claim flow, **never gates access**. No-org creator → no flag → fully personal (the wedge, untaxed).

   Must hold before personal creation ships to anyone who is also an org member.
2. ~~Should `live_coach_turns` stay user-scoped by design?~~ **RESOLVED June 2 2026 — the defining trust decision. "The account is organizational; the cognition layer is personal."** `live_coach_turns` stays **user-scoped / private by default**. The privacy *seam* is the existing **approval/commit gesture**: deliberation (questions, reasoning trails, drafts-in-progress) is personal and never manager-visible; *committed* output (approved action, saved note) becomes account-scoped. Flow is **one-way, rep-initiated**: the rep can promote a coaching insight into an account note (personal→organizational); the manager can **never** pull into the cognition layer — that asymmetry is the psychological-safety guarantee. Managers get **aggregate-only** signal (session frequency, question taxonomy — already the `behavioral_dependency_signal` substrate), never content. This is an **architectural** privacy guarantee, not an admin toggle (a buyer will ask to turn it on; flipping it later destroys the honesty that makes coaching valuable). See memory `cognition_personal_account_organizational.md`.
3. ~~`action_queue`'s loose `TEXT opportunity_id`: fix to a real FK during the `account_id` backfill, or leave and resolve in code?~~ **RESOLVED June 2 2026 — split into two phases; do NOT bundle the FK tightening into the account-scope decision.** The invariant being established: **every action belongs to an account.** Today `action_queue` is the worst straggler — `user_id NOT NULL` as the primary index, no `account_id`, and `opportunity_id` is loose `TEXT` (holds a substrate UUID *or* an external CRM id), so it won't follow an account on re-home without surgery.
   - **Phase 0 (account ownership — do now, additive):** add `account_id UUID REFERENCES accounts(id)` (nullable); add index `(account_id, created_at DESC)`; **populate `account_id` server-side at write** by resolving `opportunity_id → account` at enqueue time (derived, never client-supplied — same fail-closed discipline as `org_ids`; verified write paths `lib/action-queue/queue.ts` insert + `app/api/queue/enqueue/route.ts` set only `tenant_id`/`opportunity_id` today, so the resolution lands in the server insert); **backfill is two-pass** — (1) UUID match `opportunity_id` → `opportunities.id`, (2) external-id match → `opportunities.source_external_id`, (3) quarantine the unresolved residue for manual reconcile; reads prefer `account_id`. `account_id` stays **nullable until backfill completes AND all write paths populate**, at which point flipping it `NOT NULL` is the machine-checkable "done" signal for the invariant. `action_queue` RLS stays **tenant-gated** until `account_id` is populated, then joins the grant model at §5 cutover.
   - **Phase 1 (opportunity FK tightening — defer):** only **after** confirming clean resolution, either convert `opportunity_id` `TEXT → UUID/FK`, or add `opportunity_uuid` and deprecate the text field. This is decoupled from the account-scope decision and runs on its own clock.
4. ~~Clerk: confirm a single user can belong to multiple orgs and that `ctx.orgIds` can enumerate them server-side.~~ **RESOLVED June 2 2026 (see §4 "Clerk constraint").** Multi-org: yes. Session exposes active org only; full list is **derived** via Backend API (`getOrganizationMembershipList`) or webhook-synced membership table. The user-grant path (personal wedge + consultant) is unaffected — it keys on the native `userId`. Remaining sub-decision: for the **org-grant path** only, pick (a) active-org-only vs (b) full-derived-list (recommend webhook-synced `org_memberships` for fail-closed RLS without per-request Clerk calls).
