## Summary

<!-- 1-3 bullets. Why this change. -->

## Test plan

<!-- Bulleted checklist. What's been verified, what reviewers should re-verify. -->

- [ ]

---

## Write-through surface review

<!--
Required if this PR adds or modifies a write surface — anywhere a rep
contributes data: rep notes, deal-thread replies, manager-brief
contributions, stakeholder updates, MEDDPICC writes, action-queue
completions, email-composer logs, coach-surface annotations, etc.

▸ If this PR does NOT touch a write surface, delete this entire section.
▸ If it DOES, add the `write-through-review-required` label and complete
  every box below. Each maps to a rule in
  memory:write_through_surface_contract.md and is non-negotiable.

A PR that fails any of these is not write-through and shouldn't ship
under the operating-layer doctrine. The principle: one system at a
given time — Mallin is where the rep works, CRM is the governed record.
-->

- [ ] **Authority boundary** — every authoritative field writes to a CRM record (not a Mallin table).
- [ ] **Sync visibility** — the rep sees `Syncing / Synced / Pending retry / Failed` in real time at the surface.
- [ ] **Retry path** — failure surfaces *what / why / fix*. No silent abandonment. Escalates after N retries.
- [ ] **CRM-governed permissions** — record-level / field-level / private-flag honored. No parallel Mallin ACL.
- [ ] **No Mallin durable content** — no field on a Mallin table that would lose authored rep content on delete. Type-shape check passes (no `body / note / comment / memo / content / summary / description / draft / owner_note / text / details`).
- [ ] **Tenant boundary** — every read/write filters by `tenant_id`; no cross-tenant leak path.
- [ ] **Deletion test** — if the CRM record is deleted, the Mallin metadata becomes orphan; no permanent loss of authored content.
- [ ] **No async authority drift** — sync is write-time, not batched ETL. Queueing is transport, not authority.

**Canonical visual reference:** [`docs/landing-concepts/23-prep-style-variants.html`](docs/landing-concepts/23-prep-style-variants.html) — what good looks like.

**Doctrine stack** (agent memory — full text available via Claude / `/memory`):
- `write_through_operating_layer.md` — the *why* (principle, drift signals, generalization)
- `write_through_surface_contract.md` — the *what to check* (six rules + type-level enforcement)
