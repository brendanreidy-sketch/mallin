# Stage progression → CRM sync (confirm-to-advance)

**Status:** design doc · contract only · NOT implemented · evolves an existing doctrine boundary
**Last updated:** 2026-06-03
**Companion memory:** `salesforce_writeback_spec.md`, `write_through_surface_contract.md`, `write_through_operating_layer.md`, `approval_emotional_contract.md`, `integrity_preserving_friction.md`
**Provider scope:** CRM-neutral. Salesforce is the **first adapter**, not the architecture. Per the verbatim rule in `write_through_surface_contract.md`: *"Scope it as CRM write-through, with [the vendor] as the first adapter."*

> **The fork this resolves:** *Does Mallin ever write `StageName` back to the CRM?*
>
> Old doctrine (`salesforce_writeback_spec.md`, Tier 3): **No.** Stage is "never auto-write, even with approval — the rep must edit it in the CRM directly. The system never PATCHes it."
>
> **Decision (2026-06-03):** Mallin *may* advance Stage and write it back — but **only** through an explicit, per-advance rep confirmation with evidence shown. This is a new tier between Tier 2 (suggest + approve, bundleable) and the old Tier 3 (never write).
>
> **What does NOT change:** `Amount`, `CloseDate`, `ForecastCategory` stay in never-write. Stage is the *only* forecast-adjacent field promoted out of Tier 3, because stage advance is the one progression event the rep already owns as a deliberate act — and the one the cockpit can prove from substrate.
>
> **Success test:** *"A rep advances a deal in the cockpit. They see why, they confirm it, and Salesforce reflects it — with a ledger entry that answers 'who advanced this, when, on what evidence.' Nothing advances silently, in bulk, or without the rep's hand on it."*

---

## 1. Two parts

This spec has two separable pieces. Part A can ship without Part B (internal progression with no write). Part B depends on Part A plus CRM write access.

- **Part A — Stage progression model.** The cockpit holds the deal's current stage, derives a *proposed* next stage from substrate, and shows the rep where the deal is vs. where the evidence says it should be.
- **Part B — Confirm-to-advance CRM sync.** When the rep confirms an advance, Mallin PATCHes `StageName` on the CRM opportunity through the generic adapter, logs it to the action ledger, and shows sync state.

---

## 2. Part A — Stage progression model

### 2.1 Where stage lives

Today there is **no `opportunities` table with a stage column.** `opportunity_id` is loose `TEXT` across `action_queue` / `slack_outbound_posts` (substrate UUID *or* external CRM id). Stage is read from the CRM (`salesforce_writeback_spec.md`, Phase 1).

The CRM remains the system of record for the *committed* stage. Mallin does not maintain an authoritative parallel stage (rule 3, write-through contract). What Mallin holds is:

- `crm_stage` — last-read committed stage from the CRM (a cache, not authority).
- `proposed_stage` — Mallin's substrate-derived read of where the deal *should* be.
- `stage_evidence` — the substrate facts that justify `proposed_stage` (quoted, with `artifact.generated_at`).

`proposed_stage` and `stage_evidence` are **Mallin metadata about** the CRM opportunity — allowed under rule 6 (non-authoritative, additive, orphaned if the CRM record is deleted). They never become the deal's official stage on their own.

### 2.2 Stage model is per-CRM, configured not hardcoded

Pipelines differ per customer (Discovery → Demo → Negotiate → Closed vs. a 7-stage MEDDPICC ladder). The stage ladder is **governance config**, calibrated with the customer's leadership (`governance_template_schema.md`), not a Mallin enum. The progression engine reasons over an ordered list of stage names supplied by the tenant's CRM config; it does not ship a fixed stage vocabulary.

### 2.3 Deriving `proposed_stage`

The engine maps substrate signals → stage gates defined by the customer's methodology bar. Examples (illustrative, not hardcoded):

- Pricing discussed + EB identified + paper process named → evidence for `Negotiate`.
- Champion confirmed + pain quantified → evidence for `Demo` → `Validate`.

The engine emits at most a **one-stage** proposed advance at a time (never "jump from Discovery to Negotiate"), and attaches the quoted evidence behind each gate it claims is met. No evidence → no proposed advance. This is the `recommendation_sequence` applied to stage: clear claim → quoted evidence → temporal proof (`artifact.generated_at`) → accountable decision (the confirm).

---

## 3. Part B — Confirm-to-advance CRM sync

### 3.1 The new tier

Insert a tier into the `salesforce_writeback_spec.md` ladder:

| Tier | Fields | Gate |
|---|---|---|
| 1 — Auto-write | LastActivity, call summary, next-step note, discovered contacts | none |
| 2 — Suggest + approve | MEDDPICC, close plan, risk reason, stakeholder dispositions | rep approve (bundleable / "approve all") |
| **2.5 — Confirm-to-advance (NEW)** | **`StageName` only** | **per-advance, single-field, evidence-shown, never bundled** |
| 3 — Never write | `Amount`, `CloseDate`, `ForecastCategory` | rep edits in CRM directly; Mallin never PATCHes |

Stage gets a **stronger** gate than Tier 2, not a weaker one. Tier 2 fields can be approved in bulk; **Stage cannot.** Each advance is its own deliberate confirmation.

### 3.2 The forcing functions (what keeps this safe)

These are non-negotiable. Each is the friction that earns the right to write a forecast-adjacent field (`integrity_preserving_friction.md`):

1. **Per-advance only.** One confirm = one stage move. No "advance all my deals." No multi-stage jump in a single confirm.
2. **Evidence required at confirm time.** The confirm UI shows the quoted substrate evidence for *this* advance. If the engine can't show evidence, there is no confirm button — only "update in CRM yourself" (the Tier 3 fallback).
3. **Single field.** A stage-advance action writes `StageName` and nothing else. It never piggybacks Amount/CloseDate edits.
4. **Explicit, not pre-checked.** The confirm is an affirmative act. No default-selected, no "approve all suggestions" checkbox sweeps stage in.
5. **Ledger entry, immutable.** Every confirmed advance writes an `action_queue` row with `approved_by_user_id`, `approved_at`, evidence snapshot, and the external object link. Answers "who advanced this, when, on what evidence."
6. **Reversible + visible.** Sync state is shown (`Syncing / ✓ Synced / Pending retry / ✗ Failed`, rule 2). A failed stage write surfaces what/why/fix (rule 5), never silently abandons.

### 3.3 Honoring the write-through surface contract

This is a write surface → all six rules + provider-neutrality apply (`write_through_surface_contract.md`). It carries the `write-through-review-required` PR label.

- **Rule 1 (write to source-of-record):** Stage writes to the CRM opportunity. CRM-side permission failure (rep doesn't own the record, FLS on StageName) surfaces the error — no Mallin-only fallback stage.
- **Rule 3 (no hidden authority):** `proposed_stage` is metadata; the committed stage lives only in the CRM.
- **Rule 4 (CRM governance):** if the customer's CRM requires stage-change validation rules / approval processes, those run server-side in the CRM. Mallin's confirm does not bypass them; a rejected PATCH surfaces as a sync failure.
- **Provider-neutral:** the action writes through `crm-adapter.advanceStage(opportunityId, toStage)`. No `salesforce` string outside the adapter module. Sync chip reads `tenant.crm_provider` → "✓ Synced to Salesforce".

### 3.4 Data model (reuse the existing ledger)

No new authoritative table. Reuse `action_queue` (migration 007 — already the governed action ledger with approval + execution provenance):

- New `action_type`: `'stage_advance'` (add to the CHECK list).
- `payload`: `{ from_stage, to_stage, evidence: EvidenceRef[] }` (typed in `lib/action-queue/types.ts`). `evidence` is a snapshot of artifact refs + quoted text at confirm time.
- `approved_by_user_id` / `approved_at`: the confirming rep (the human gate, non-null on execute).
- `external_object_type`: `'crm.opportunity'`; `external_object_id`: the CRM opp id; `external_object_url`: deep link.
- `status` flows `queued → approved_pending → executed | failed`.

A stage advance is intentionally **not** a generic `crm_update` — the distinct `action_type` makes it queryable ("show every stage advance and who confirmed it") and prevents stage from being swept into a bulk `crm_update` approve-all path (forcing function #4 enforced at the data layer, not just the UI).

### 3.5 Type-level guard

Per `type_level_ux_guards.md`, make the wrong move a type error. The stage-advance payload type has **no** `bulk: boolean`, no array of opportunity ids, and no field for Amount/CloseDate/ForecastCategory. Advancing more than one deal, or writing a never-write field alongside stage, should require a deliberate type change — not be reachable by passing a flag.

```ts
type StageAdvancePayload = {
  readonly crm_opportunity_id: string;   // single opp — not string[]
  readonly from_stage: string;
  readonly to_stage: string;             // one step on the tenant's ladder
  readonly evidence: readonly EvidenceRef[];  // non-empty enforced at construction
  // No `amount`, `close_date`, `forecast_category` — those stay Tier 3.
  // No `bulk`, no `opportunity_ids[]` — per-advance is structural.
};
```

---

## 4. Build order (smallest first)

1. **Stage progression model, read-only (Part A).** Show `crm_stage` vs `proposed_stage` + evidence in the cockpit. No write button. Validates: are the proposed advances right? Would the rep confirm them? (Mirrors the writeback spec's "diff view first" discipline.)
2. **Ledger plumbing.** Add `stage_advance` to `action_queue`, the typed payload, and the evidence snapshot — write rows on confirm but stub the CRM PATCH (dry-run, status stays `approved_pending`). Validates the audit trail before any real write.
3. **CRM adapter `advanceStage`.** Implement the Salesforce adapter PATCH of `StageName`, behind the generic contract. Sandbox-test first.
4. **Confirm UI + sync state.** The per-advance confirm card (evidence shown), the four sync states, the retry/failure path. This is the surface that ships under the write-through PR checklist.

---

## 5. Dependencies (must exist before Part B)

- CRM read + **write** access (OAuth / service account) with permission to PATCH StageName.
- Tenant CRM config: the **ordered stage ladder** + which methodology gates map to which stage (governance calibration).
- Field mapping: substrate signals → stage gates.
- A test opportunity that exists in both Mallin's DB and the CRM (sandbox preferred) for end-to-end validation.

---

## 6. Resolved decisions (was: open questions — resolved 2026-06-03)

1. **Conflict — rep edited the CRM directly since last read → CRM wins.** The CRM is the system of record; its stage is authoritative. Mallin **recalculates** `proposed_stage` against the new committed stage, and **any pending stage recommendation is invalidated** (the queued `stage_advance`, if still `queued`/`approved_pending`, is dismissed — never executed against a stale `from_stage`). No silent overwrite of a rep's direct edit.

2. **Backward / slipped stages → recommendation-only in v1.** Mallin may *surface* that a deal looks like it has regressed, but offers **no confirm-to-advance write** for backward moves. No write-through on regression until usage justifies it. Rationale: moving backward carries more political / forecast weight than moving forward — it's a conversation, not a one-click sync.

3. **Closed-Won → never initiated by Mallin in v1.** Closed-Won is not just a stage — it carries revenue-recognition and ops implications beyond the pipeline. Mallin may say *"appears ready to close"* with evidence, but the **rep updates the CRM** for the close. (Same posture for Closed-Lost.) Confirm-to-advance applies to *forward, non-terminal* stage moves only.

4. **Where the confirm lives → cockpit first; Slack later as notification + deep link only.** The confirm happens **in the evidence context** (the cockpit, where the quoted substrate sits next to the proposed advance), not in a thin Slack action. Slack's role in a later phase is to *notify* and *deep-link back into the cockpit* — never to host the confirm itself. (`source_surface` = the cockpit advance affordance.)

**Carried by doctrine (not re-opened):** whether confirming an advance pulls Tier 2 fields (e.g. EB) with it — **no.** Forcing function #3 (no bundled field updates) keeps Stage's gate clean; MEDDPICC fills stay their own Tier 2 approvals.

---

## 7. Drift signals (block at PR review)

- A bulk / "advance all" path for stage — violates forcing function #1.
- A stage advance that executes without a non-null `approved_by_user_id` or without an evidence snapshot — violates #2 / #5.
- `Amount` / `CloseDate` / `ForecastCategory` appearing in a stage-advance payload or any auto/approve write path — Tier 3 breach.
- A `salesforce`-named symbol outside the adapter module — provider leak.
- Stage write routed to a Mallin-only store on CRM permission failure — rule 1 breach.
- Silent stage sync (no visible state, failure only in logs) — rule 2 / 5 breach.
- `proposed_stage` treated as the deal's real stage anywhere outside the brief — rule 3 breach.

---

## 8. Doctrine reconciliation (DONE — 2026-06-03)

`salesforce_writeback_spec.md` has been updated to match this spec:

- `StageName` moved Tier 3 → **Tier 2.5 (confirm-to-advance)**, with the forcing functions.
- `Amount`, `CloseDate`, `ForecastCategory` remain Tier 3, never-write.
- Build order + "why this shape works" updated to name the Tier 2.5 / Tier 3 split.

No contradiction remains between this doc and the memory doctrine.
