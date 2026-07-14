# Runbook — Customer Data Deletion

**When to use this:** a customer (or their representative) requests
deletion of their data under GDPR Right to be Forgotten, CCPA Right to
Delete, or as a follow-on to account closure.

**Owner:** Founder / engineering (currently: Brendan)
**SLA:** 24-hour acknowledgment, 30-day deletion from active systems,
60-day deletion from backups.

---

## Step 1 — Verify the request (within 24 hours)

1. **Authenticate the requester.** Confirm the request came from an
   account-owner email address on the customer's tenant. If a
   non-owner is requesting, escalate to the customer's account owner
   for confirmation.

2. **Confirm scope.** Clarify what is being deleted:
   - Full account closure + all data
   - Specific deal(s) only
   - Specific stakeholder record(s)
   - All notes the requester authored
   - PII for a specific person (GDPR data-subject request)

3. **Acknowledge in writing** via email within 24 hours of receipt.
   Include: expected timeline, what will be deleted, what (if anything)
   we are legally required to retain (audit logs, billing records).

4. **Log the request** in the deletion-request register (currently:
   markdown file at `docs/runbooks/deletion-requests-log.md` — TODO
   build a proper register).

## Step 2 — Identify scope (within 72 hours)

For full-account deletion, the affected data spans:

| Table | Scope |
|---|---|
| `tenants` | The tenant row + cascade-delete or hard-delete |
| `accounts` | All accounts where `tenant_id` matches |
| `opportunities` | All opps in the tenant |
| `stakeholders` | All stakeholders linked to tenant accounts |
| `internal_participants` | All participants in tenant opps |
| `account_intelligence_artifacts` | All artifacts in tenant |
| `prep_artifacts` (or equivalent) | All briefs in tenant |
| `touches` | All touch records in tenant |
| `notes` (when implemented) | All rep notes in tenant |
| Audit logs | Retained per legal-retention requirements; PII redacted |
| Clerk user records | Deleted via Clerk admin API |
| CRM-side data | Customer responsibility — we do NOT delete data in customer's CRM unless explicitly requested + customer confirms |

## Step 3 — Execute deletion (within 30 days)

1. **Take a backup snapshot** of the customer's data before deletion
   (encrypted, retained 30 days in case of recovery request).

2. **Soft-delete first** (mark records as `deleted_at = NOW()`). Wait
   24 hours to allow any in-flight queries to complete.

3. **Hard-delete via SQL:**
   ```sql
   -- Example: full tenant deletion
   BEGIN;
   DELETE FROM account_intelligence_artifacts WHERE tenant_id = '<id>';
   DELETE FROM touches WHERE tenant_id = '<id>';
   DELETE FROM internal_participants WHERE tenant_id = '<id>';
   DELETE FROM stakeholders WHERE tenant_id = '<id>';
   DELETE FROM opportunities WHERE tenant_id = '<id>';
   DELETE FROM accounts WHERE tenant_id = '<id>';
   DELETE FROM tenants WHERE id = '<id>';
   COMMIT;
   ```
   *(Confirm exact table list against current schema before running.)*

4. **Delete Clerk users** via Clerk admin API for any user_id
   associated with the tenant.

5. **Revoke OAuth tokens** for any CRM integrations connected to the
   tenant (HubSpot, Salesforce, Pipedrive).

6. **Purge from edge caches** — invalidate Vercel CDN cache for any
   tenant-scoped URLs.

## Step 4 — Purge backups (within 60 days)

1. Supabase point-in-time recovery snapshots include the deleted data
   for up to 30 days post-deletion.

2. Either: (a) wait for natural 30-day rollover, or (b) request
   Supabase to expedite snapshot purge for the affected database (this
   requires Pro tier; document the request in the deletion log).

3. Confirm in writing to the customer when backup purge is complete.

## Step 5 — Close the loop

1. **Send written confirmation** to the customer with the exact dates
   of: soft-delete, hard-delete from active systems, and purge from
   backups.

2. **Update the deletion-request log** with completion dates.

3. **Audit trail entry** — log the deletion action in the audit-log
   table (this entry is itself retained for compliance review).

---

## Edge cases

- **CRM-side data:** Mallin does NOT delete data from the customer's
  CRM (HubSpot, Salesforce, Pipedrive) unless the customer explicitly
  requests it AND we confirm in writing. CRM data is theirs to manage.
- **Customer wants to be deleted from another tenant's brief** (a
  stakeholder, not an account-owner): this is a GDPR data-subject
  request. We notify the relevant tenant; the tenant's account owner
  decides whether to delete the brief. We do not delete data without
  the tenant owner's consent except where legally compelled.
- **Legal hold:** if the data is subject to a litigation hold, deletion
  pauses until the hold is lifted. The requester is notified of the
  hold.

## Roadmap (improve this runbook)

- [ ] Build a self-service deletion endpoint in the admin surface
- [ ] Automate the SQL above as a single command (`scripts/admin/delete-tenant.ts`)
- [ ] Maintain a structured `deletion_requests` table instead of markdown log
- [ ] Periodic audit: confirm every prior deletion is gone from active + backup
