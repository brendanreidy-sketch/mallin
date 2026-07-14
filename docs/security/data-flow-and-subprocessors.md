# Mallín — Data Flow & Subprocessors

_Source-of-truth map for the Trust page and vendor security questionnaires. Last reviewed: 2026-07-10._

## What data Mallín handles
- **Call transcripts** (uploaded or pulled from call tools)
- **CRM records** (accounts, opportunities, stakeholders) via connected CRMs
- **Email + calendar** metadata/content via connected mailboxes
- **User identity** (name, email, org membership)

## Data flow (end to end)
1. **Customer connects a tool** (Gmail / HubSpot / Salesforce) via OAuth, or uploads a transcript. OAuth tokens are stored per-tenant in the database.
2. **Data is pulled into Mallín's database** (Supabase / Postgres), scoped to one tenant by row-level security. This is the raw record (`deal_transcripts`, `touches`, `stakeholders`).
3. **For intelligence, call/email content is sent to Anthropic's Claude API** for LLM processing. Anthropic **does not train models on data sent via the commercial API** and offers retention controls (including zero-data-retention for qualifying accounts).
4. **Interpretations are stored** back in Supabase as versioned artifacts (`*_artifacts`, JSONB).
5. **Writes back to the customer's tools** pass through the governance gate — suggest → approve → write, with provenance; protected fields (Stage / Amount / Close Date / Forecast) are never auto-written.

Data leaves the customer's boundary at steps 2 and 3 (into Mallín's cloud and Anthropic's API). This is standard SaaS; it is **not** an in-VPC / "nothing leaves" architecture (see build plan).

## Subprocessors
| Subprocessor | Role | Data it touches | Notes |
|---|---|---|---|
| **Anthropic** | LLM inference (Claude API) | Call/email content sent for processing | No training on API data; retention controls / ZDR available |
| **Supabase** | Primary database (Postgres) | All stored data | Row-level security per tenant; encryption at rest |
| **Vercel** | Application hosting | Data in transit through the app | TLS in transit |
| **Clerk** | Authentication / identity | User identity, emails, org membership | — |
| **Resend** | Transactional email | Notification recipient addresses + content | — |
| Customer's Google / HubSpot / Salesforce | Source + destination systems | Accessed via OAuth, per customer grant | Mallín inherits the customer's permission model |

## Security posture (current — honest)
- **Tenant isolation:** Postgres row-level security keyed on `tenant_id`; `ON DELETE CASCADE` removes a tenant's data on deletion.
- **Encryption:** in transit (TLS) and at rest (managed by Supabase / Vercel).
- **No-train:** call data processed by Anthropic under a no-training commercial agreement.
- **SOC 2:** _in progress — not yet obtained._
- **Data controls (deletion/export endpoint, retention purge, audit log, PII redaction):** _to build (see plan)._
- **In-VPC / bring-your-own-LLM:** _not offered (enterprise-tier build, gated on demand)._

## To build (see reserved-architecture note)
SOC 2 Type II · data deletion + export endpoints · retention policy + purge job · audit log of every write · optional PII redaction before LLM · per-tenant no-train/residency config · (gated) in-VPC / BYO-LLM enterprise tier.
