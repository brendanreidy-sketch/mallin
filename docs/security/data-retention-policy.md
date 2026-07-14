# Data Retention & Deletion Policy

_Effective: 2026-07-10. Questions: privacy@mallin.io. Companion to `data-flow-and-subprocessors.md`._

## 1. Principle
We retain your data to provide the service. Mallín's value compounds across your deal history — the longer the record, the sharper the judgment — so **by default your data is retained for the life of your account.** We keep it no longer than needed for that purpose, and you can delete it at any time.

## 2. What we retain, and for how long
- **Active accounts.** Customer data — call transcripts, CRM records, derived artifacts, and stakeholders — is retained for as long as your account is active, so the product's memory compounds across calls.
- **Configurable retention (available on request; Enterprise).** Customers with compliance requirements can set a shorter window (e.g., 90 or 365 days) after which raw transcripts are automatically purged, while de-identified, derived artifacts may be retained. _Self-serve configuration is on the roadmap; available on request today._

## 3. Deletion
- **On account termination.** All customer data is permanently deleted from production systems within **30 days** of termination.
- **On request (right to erasure).** You may request deletion at any time; we complete it within **30 days** of a verified request. Email privacy@mallin.io.
- **Cascade.** Deleting a tenant removes all associated records — transcripts, artifacts, stakeholders, and connected-tool credentials — via database-level cascade.

## 4. Backups
Encrypted backups may hold residual copies after deletion. These are rotated and purged within **7 days** (our database provider's point-in-time-recovery window). Deleted data is not restored from backup except to recover from a data-loss incident.

## 5. Connected tools (OAuth)
When you disconnect a tool (Gmail / HubSpot / Salesforce), Mallín stops accessing it and deletes the stored OAuth credentials. Data previously synced follows the retention rules above.

## 6. AI processing (Anthropic)
Call content processed by Anthropic's Claude API is handled under a **no-training agreement** — Anthropic does not use it to train models — and retention controls (including zero-data-retention for qualifying accounts) apply.

## 7. Redaction (optional)
For customers who require it, personal data can be redacted from transcripts before processing and storage. _Available for enterprise engagements; broader self-serve support on the roadmap._

## 8. Changes
Material changes will be posted here and communicated to active customers.
