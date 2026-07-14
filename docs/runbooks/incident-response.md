# Runbook — Security Incident Response

**When to use this:** any event that may have compromised customer data
confidentiality, integrity, or availability. Includes: suspected
unauthorized access, data exposure, AI hallucination causing material
customer harm, third-party subprocessor breach, prolonged outage,
malicious actor probing systems.

**Owner:** Founder / engineering (currently: Brendan)
**Goal:** detect → contain → notify within 72h → remediate → learn

---

## Phase 1 — Detect & Triage (Hour 0 to Hour 4)

1. **Confirm the incident is real.** Distinguish from false-positives
   (e.g., expected cron failures, single-user auth issues). Capture:
   - What was observed
   - When it started (best estimate)
   - Which systems / customers may be affected
   - Source of the alert (monitoring, customer report, internal review)

2. **Classify severity.**

| Severity | Definition | Examples |
|---|---|---|
| **S0 — Critical** | Confirmed customer data exposure, multi-tenant data leak, or active exploitation | RLS bypass leaked data across tenants; stolen credentials in active use |
| **S1 — High** | High-confidence unauthorized access OR significant integrity issue affecting multiple customers | Subprocessor breach affecting our data; persistent prompt injection escaping guardrails |
| **S2 — Medium** | Single-customer exposure with limited impact OR vulnerability with no known exploitation | Customer A briefly saw their own data with wrong attribution; unpatched library with public CVE but no signal of exploitation |
| **S3 — Low** | Operational issue with no data impact | Brief downtime; failed CRM write retried successfully |

3. **Activate the response.** For S0/S1: drop other work, take over
   the incident channel. For S2: scope and assign during normal hours.
   For S3: log and prioritize in normal queue.

4. **Open an incident record.** During design-partner phase: a markdown
   file at `docs/incidents/<date>-<short-name>.md` with:
   - Severity + classification
   - Timeline of observations
   - Affected systems / customers
   - Mitigations applied
   - Open questions

## Phase 2 — Contain (Hour 0 to Hour 24)

Stop the bleeding before you understand everything.

1. **For S0/S1 unauthorized access:**
   - Rotate the affected credentials (Vercel env vars, Supabase
     service role, Clerk API keys, Anthropic API key, GitHub PATs).
   - Force-revoke active sessions: Clerk admin → sign out all sessions
     for affected users.
   - If exposure was via a deployed code path: revert the deployment
     (Vercel → previous immutable deployment).

2. **For S0/S1 data exposure:**
   - Identify the exact records exposed.
   - Snapshot the current state of the affected tables.
   - If exposure is ongoing (e.g., a public URL that shouldn't be):
     block the URL at Vercel edge OR take down the relevant route.

3. **For AI-output incidents** (model produced harmful output that
   the customer relied on):
   - Pull the prompt + response from logs.
   - Identify whether this is a generalizable failure or one-off.
   - If generalizable: pause the affected feature (feature flag),
     escalate to prompt review.

4. **Document every action taken** in the incident record. Each action
   gets: timestamp, who took it, what was changed.

## Phase 3 — Notify (within 72 hours of detection)

This is the legal commitment in our Privacy Policy and Security page.

1. **Identify affected customers.** Use audit logs + tenant IDs to
   build the list.

2. **Draft the notification.** Required content:
   - What happened (factual, not minimized, not maximized)
   - What data was affected
   - What we've done to contain it
   - What we're doing to investigate
   - What the customer should do (e.g., rotate credentials, audit
     their CRM data)
   - Who to contact for questions (hello@mallin.io)
   - Whether we will provide updates and at what cadence

3. **Send the notification** to the account-owner email for every
   affected tenant. Bcc legal counsel + the founder.

4. **For GDPR-applicable incidents:** notify the relevant supervisory
   authority within 72 hours if the breach is likely to result in risk
   to natural persons' rights and freedoms. Consult counsel.

5. **For CCPA-applicable incidents:** assess whether California
   notification requirements apply.

6. **Public statement:** for S0 incidents affecting many customers,
   consider a public status-page or blog post AFTER affected customers
   have been notified directly.

## Phase 4 — Remediate (Days 1–14)

1. **Root-cause analysis.** Don't stop at "what happened" — find
   "what allowed it to happen." Common root causes:
   - Missing RLS policy on a new table
   - Service-role credentials with too-broad scope
   - Missing input validation
   - Subprocessor changed behavior without notice
   - Prompt injection escaping guardrails

2. **Build the fix.** Code change + test + deploy.

3. **Build the prevention.** What systemic change makes this class
   of incident impossible (or at least loud) in the future?
   Examples:
   - New RLS policy + automated test
   - Type-system constraint preventing the wrong-shape write
   - Loud-failure mechanism (per `integrity_preserving_friction.md`)
   - Subprocessor change-detection job

4. **Verify the fix.** Independent verification — don't ship a fix
   the same person wrote without a second pair of eyes (once team
   is more than founder).

## Phase 5 — Learn (Day 7–30 post-incident)

1. **Post-incident review.** Within 14 days of incident close, write
   up:
   - Timeline (from first signal to full resolution)
   - Root cause
   - What went well
   - What went poorly
   - Action items with owners + dates

2. **Update this runbook** with anything missing.

3. **Update the relevant doctrine** (per `integrity_preserving_friction.md`):
   if the failure mode is generalizable, codify a new drift signal or
   new pre-ship check.

4. **Customer follow-up.** Send affected customers a closure note
   summarizing what was done. They earned the courtesy.

---

## Subprocessor breach response

If we're notified of a breach at one of our subprocessors (Anthropic,
Supabase, Clerk, Vercel, Resend, HubSpot, etc.):

1. **Get the facts.** What data did they have? What was exposed? Was
   our data among it?

2. **Assess our exposure.** Cross-reference with subprocessor list
   (https://mallin.io/subprocessors) and the data each holds.

3. **Notify affected customers** per Phase 3 above. Lead with the
   subprocessor's name and our exposure assessment.

4. **Evaluate the subprocessor relationship.** Is this a one-off, or
   a pattern? Document in subprocessor-evaluation log.

## Contacts

- **Founder:** Brendan (brendan@mallin.io)
- **Legal counsel:** [TO ESTABLISH]
- **Anthropic:** support@anthropic.com (separate security contact via DPA)
- **Supabase:** support@supabase.com
- **Clerk:** support@clerk.com
- **Vercel:** support@vercel.com

## Drills

Test this runbook at least once per quarter via tabletop exercise:
walk through a hypothetical S0 with a stopwatch. Identify gaps. Fix
them.
