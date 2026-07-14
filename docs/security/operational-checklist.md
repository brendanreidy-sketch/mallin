# Operational Security Checklist — founder-stage Mallin

**Status:** baseline checklist. Everything here should be in place
before the first paid customer. Several items below are partial as of
**2026-05-20**; updates expected in coming days.

This is the engineer-facing checklist. The customer-facing version of
this content lives at https://mallin.io/security.

---

## 1. MFA on every critical account

Goal: zero single-factor accounts on any system that touches customer
data, source code, infrastructure, secrets, or revenue.

| Account | MFA status | Method | Notes |
|---|---|---|---|
| **GitHub** (`brendanreidy-sketch`) | [ ] enabled | TOTP or hardware key | Source of truth for all code |
| **Vercel** (`roomrefund` team) | [ ] enabled | TOTP | Deployment + env-var store |
| **Supabase** (production project) | [ ] enabled | TOTP | Customer data primary store |
| **Clerk** (production instance) | [ ] enabled | TOTP | Customer auth provider |
| **Anthropic API** account | [ ] enabled | TOTP | LLM provider |
| **Resend** account | [ ] enabled | TOTP | Transactional email |
| **Domain registrar** (mallin.io) | [ ] enabled | TOTP | DNS control = full takeover potential |
| **DNS provider** (if separate) | [ ] enabled | TOTP |  |
| **HubSpot** dev app | [ ] enabled | TOTP | OAuth app credentials |
| **Stripe** (when added) | [ ] enabled | TOTP | Payments |
| **Personal Apple ID / Google Workspace** | [ ] enabled | TOTP + hardware key | Account recovery for everything else |
| **1Password / password manager** | [ ] enabled | Master password + hardware key | The lock everything depends on |

**Verification cadence:** quarterly. Re-confirm MFA is still enforced
(not "available but disabled") on every account above.

## 2. Password manager (single source of truth)

- [ ] All credentials stored in 1Password (or equivalent — Bitwarden,
      Dashlane). No passwords in `.env` files, Notion, plain text,
      shell history, or anywhere else.
- [ ] Master password is unique, long (20+ chars), generated, never
      reused.
- [ ] Recovery kit (1Password emergency kit) printed and stored
      physically in a secure location (safe-deposit box).
- [ ] Hardware key (YubiKey, Solo, or equivalent) enrolled as second
      factor on the password manager itself.
- [ ] Backup hardware key stored separately.

## 3. Secrets posture

- [ ] No production secrets in source control (audit via
      `git secrets` or `trufflehog` scan).
- [ ] All Vercel env vars use the encrypted store (never plain-text
      `target: ["development"]` for sensitive values).
- [ ] Service-role credentials (Supabase service role, Clerk secret
      key, Anthropic API key) rotated whenever a person leaves the
      project or whenever a credential is exposed (even briefly).
- [ ] No long-lived personal access tokens with broad scope — prefer
      OAuth apps + short-lived tokens where the provider supports.

## 4. Tenant isolation

- [ ] Every table that stores customer data carries a `tenant_id`
      column.
- [ ] Row-Level Security (RLS) is enabled on every customer-data table.
- [ ] Application code uses `tenant_id` in every query (no naked
      `SELECT * FROM accounts`).
- [ ] Audit script that walks every table and confirms (a) RLS enabled,
      (b) policy exists, (c) policy actually constrains by tenant_id.
      *(In progress — target: prior to first paid customer.)*
- [ ] Automated cross-tenant access test in CI. Tries to read Customer
      B's data while authenticated as Customer A; must fail.
      *(In progress.)*

## 5. Audit logging

- [ ] Authentication events logged (Clerk provides this).
- [ ] All CRM writes logged with: who, what, where, when.
- [ ] All AI calls logged with: prompt template version, model, token
      count, response metadata.
- [ ] All admin actions logged (database access, env-var changes,
      deployments).
- [ ] Audit logs are append-only (no UPDATE / DELETE permissions for
      non-admin roles).
- [ ] Retention: life of account.
- [ ] Customer-facing audit query API. *(In progress.)*

## 6. Encryption & network

- [ ] HTTPS only (HSTS enforced).
- [ ] No HTTP fallback (Vercel default).
- [ ] No customer data in URL paths or query strings (use POST bodies
      or session-scoped IDs).
- [ ] All subprocessor connections use TLS.

## 7. Vendor security review

For each subprocessor on https://mallin.io/subprocessors, verify
annually:
- [ ] Current security posture (SOC 2 letter, ISO 27001 cert, or
      equivalent if available)
- [ ] DPA on file (especially for EU customer data)
- [ ] Active monitoring of vendor breach disclosures
- [ ] Removal process documented if vendor is dropped

## 8. Incident readiness

- [ ] Incident-response runbook current
      ([`docs/runbooks/incident-response.md`](../runbooks/incident-response.md))
- [ ] Tabletop drill at least quarterly
- [ ] Customer notification template drafted (so first customer notice
      isn't written under pressure during an actual incident)
- [ ] Legal counsel relationship established + on-retainer for incident
      consultation. *(Not yet — placeholder.)*

## 9. Backup & recovery

- [ ] Supabase point-in-time recovery enabled (free tier: 7 days,
      paid: 30 days). Upgrade to paid tier before first paid customer.
- [ ] Recovery procedure documented and tested at least annually.
- [ ] Backup of GitHub repo (Vercel hosts code, but mirror to a
      separate place — local clone + cloud backup).

## 10. Endpoint security (the founder's machine)

- [ ] FileVault / full-disk encryption enabled.
- [ ] OS up to date.
- [ ] Browser up to date.
- [ ] Auto-lock on idle (≤ 5 min).
- [ ] No customer data on the machine in plaintext outside of
      development sessions; clean up after.
- [ ] Backups via Time Machine to encrypted external drive.

---

## Verification cadence

- **Daily:** monitor uptime + error rates (Vercel dashboard + manual
  spot-check on key URLs).
- **Weekly:** review audit logs for anomalies.
- **Monthly:** rotate any short-lived credentials that need rotation.
- **Quarterly:** full re-walk of this checklist. Update what's changed.
- **Annually:** vendor re-review per Section 7.

## Next pre-paid-customer hardening priorities

1. Complete RLS audit + automated cross-tenant test (Section 4).
2. Build the customer-facing audit query API (Section 5).
3. Establish legal counsel relationship (Section 8).
4. Run first incident-response tabletop drill (Section 8).
5. Upgrade Supabase to paid tier for 30-day PITR (Section 9).
