# RevOps Autopilot — Backlog

Decisions, hardening items, and follow-ups not addressed in current commits.
Format: `- [ ] [category] description (context, why deferred)`

## Schema hardening

- [ ] **meeting_attendees uniqueness** — Add unique constraint to prevent duplicate attendee inserts.
  Primary form: `(tenant_id, meeting_id, stakeholder_id)`.
  Fallback for cases where stakeholder_id is NULL (informal external attendees not yet promoted): `(tenant_id, meeting_id, email)`.
  Probably needs partial indexes or COALESCE since both stakeholder_id and email can be NULL on the same row.
  Surfaced when: dual-INSERT in Supabase SQL Editor created 6 rows instead of 3 during Globex fixture setup (2026-04-27).

## Pass 1.5 follow-ups

- [ ] **Future-meeting inclusion** — `config.include_future_meetings: true` is defined in the AssemblyConfig type but not honored in v0.5. Activities reference past meetings; future meetings (scheduled but no activity yet) need a separate `WHERE opportunity_id = X AND scheduled_at > NOW()` query, then UNION with hydrated set.

- [ ] **Account-level signals** — `public_signals` and `external_signals` tables hold funding/news/leadership-change records. Pass 1.5 doesn't query them yet. Two queries against those tables, attach to `account.public_signals` and `account.external_signals`.

- [ ] **Data freshness metadata** — `InputContext.data_freshness` field exists in contract but not populated. Single aggregate query: `MAX(source_fetched_at) FILTER (WHERE source_system = ...)` per source.

## Future commits (Day 2+)

- [ ] **Patch #7 — RLS validation pass** — The Clerk JWT → tenant_id mapping needs end-to-end validation. Dedicated session required. Currently using service-role client everywhere; production should use RLS-scoped client for all user-facing reads.

- [ ] **Salesforce sync** — read-only sync of opportunities, accounts, activities. Defines the upsert path that fixtures currently fake.

- [ ] **Gmail + Calendar sync** — pulls real emails and meetings, populates `emails`/`meetings`/`meeting_attendees` tables.

- [ ] **End-to-end live data run** — first non-fixture orchestrator execution.

- [ ] **Email digest builder + delivery loop** — Pass 3 output → email send.

## Rules of Engagement (ROE) — Pass 4 concern

- [ ] **Tenant handoff ROE policy** — Per-firm rules for which internal participants count as deal-team at which deal stages. Today's `internal_participants` partition (Pass 1.5) is a coarse "internal vs external" filter that defaults to excluding all internal stakeholders from qualification reasoning. Real customers will have ROE that varies: Firm A keeps BDR as deal-team through Stage 2; Firm B treats SE as deal-team only when on calls; Firm C never includes BDR after handoff.

  Concrete schema when this gets built — `tenant_config.handoff_roe`: `bdr_deal_team_through_stage` (number), `ae_takes_over_at_stage` (number), `se_treated_as_deal_team` (boolean), `csm_joins_at_stage` (number or "closed_won"), `include_prior_owner_context_for` ("always" / "first_30_days" / "never").

  Plus per-internal-participant derived fields computed by Pass 1.5: `role_category` ("bdr" / "ae" / "se" / "csm" / "manager" / "exec"), `role_assigned_at` (ISO8601), `role_ended_at` (ISO8601 or null), `is_currently_deal_team` (boolean).

  ROE shapes Pass 4 behavior (talk track, who-to-engage, handoff prep), NOT Pass 2 truth (qualification, pillar evidence). Maria is unengaged regardless of firm; whether the AE owns that engagement now vs. whether it's still BDR-territory is ROE-dependent, and that's a Pass 4 surface.

  Why deferred: building before a real customer ROE document means guessing at firm-specific policies. Build when Pass 4 contract demands it OR when first design partner needs it.

- [ ] **Handoff intelligence in Pass 4** — When `opportunity.owner_id` recently changed, Pass 4 should produce handoff-aware prep: "This deal was handed to you N days ago. Brian ran discovery on Apr 20 and identified pain X. Eleanor hasn't been contacted since handoff." Requires the ROE policy above plus a derived `current_owner_engagement` field on the merged ExecutionAgentInput.
