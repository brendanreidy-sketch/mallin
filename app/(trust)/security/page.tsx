/**
 * /security — Security & Trust overview. The page Mallín sends to a
 * customer's security reviewer or compliance team.
 */

import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = {
  title: "Mallín — Security & Trust",
  description:
    "How Mallín protects your data. Architecture, encryption, access controls, incident response, compliance posture.",
};

const EFFECTIVE_DATE = "2026-05-20";

export default function SecurityPage() {
  return (
    <>
      <p className={styles.eyebrow}>— Security &amp; Trust</p>
      <h1 className={styles.h1}>How we <em>protect</em> what you give us.</h1>
      <p className={styles.lastUpdated}>Last updated: {EFFECTIVE_DATE}</p>

      <p className={styles.lede}>
        We&apos;re honest about where we are. Mallín is pre-SOC 2,
        late-stage design partner. The architecture is built for
        enterprise security; the formal attestations are being
        sequenced. This page describes what&apos;s true today and
        what&apos;s in progress, with no aspirational claims dressed
        up as current state.
      </p>

      <div className={styles.body}>

        <section className={styles.section}>
          <h2 className={styles.h2}>Architecture in one paragraph</h2>
          <p>
            Mallín is a multi-tenant SaaS application. Each customer is
            a separate tenant; data is isolated at the database row
            level. The product is hosted on Vercel (US-East), backed by
            Supabase (Postgres, US-East), authenticated through Clerk,
            and delivers AI inference via Anthropic&apos;s Claude API.
            CRM integrations (HubSpot live; Salesforce, Pipedrive
            planned) are OAuth-based and write through to your CRM as
            the system of record — Mallín does not maintain a parallel
            data plane (see{" "}
            <a href="/ai-governance">AI Governance</a> for the
            doctrine).
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Encryption</h2>
          <ul>
            <li><strong>In transit:</strong> TLS 1.3 on all customer-facing endpoints. HTTP requests are redirected to HTTPS. HSTS enforced.</li>
            <li><strong>At rest:</strong> AES-256 via our infrastructure providers (Supabase, Vercel). All customer data, backups, and audit logs encrypted.</li>
            <li><strong>Secrets:</strong> API keys, OAuth tokens, and other secrets stored in Vercel&apos;s encrypted environment variable store. Never committed to source control. Rotated on personnel changes.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Authentication &amp; access control</h2>
          <ul>
            <li><strong>Customer authentication:</strong> handled by Clerk (SOC 2 Type 2). Email + password by default; MFA available (TOTP, recovery codes).</li>
            <li><strong>Multi-tenant isolation:</strong> every database query filters by <code>tenant_id</code>. Row-Level Security (RLS) policies enforce isolation at the database layer as defense in depth.</li>
            <li><strong>Mallín team access:</strong> production database access is limited to engineering staff (currently the founder) via service-role credentials stored in a password manager. All production access is logged.</li>
            <li><strong>Least privilege:</strong> API routes use scoped credentials. Frontend code never sees service-role tokens.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Multi-tenant isolation</h2>
          <p>
            Every table that stores customer data carries a{" "}
            <code>tenant_id</code> column. Application code filters by
            tenant on every read and write. Database-level Row-Level
            Security policies enforce the boundary as defense in depth
            — even an application bug cannot leak data across tenants
            without also bypassing Postgres RLS.
          </p>
          <p>
            Audit of every RLS policy across every customer-data table
            is on the near-term roadmap (target: prior to first paid
            customer). We will publish the audit summary on this page
            when complete.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Audit logging</h2>
          <p>
            We log security-relevant events: authentication attempts,
            CRM writes (who wrote what to where, when), AI calls
            (prompt + response metadata, not full content), data
            exports, and account modifications. Audit logs are retained
            for the life of the account.
          </p>
          <p>
            <span className={`${styles.pill} ${styles.pillWarn}`}>In progress</span> — Centralized audit log infrastructure with customer-facing query API is on the near-term roadmap.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Backups &amp; disaster recovery</h2>
          <ul>
            <li><strong>Database backups:</strong> Supabase performs continuous backups with point-in-time recovery for the last 7 days (free tier) or 30 days (paid tier).</li>
            <li><strong>Recovery time objective (RTO):</strong> &lt; 4 hours for full database restore.</li>
            <li><strong>Recovery point objective (RPO):</strong> &lt; 5 minutes data loss for unplanned events.</li>
            <li><strong>Code/configuration:</strong> source code and deployment configuration in GitHub; Vercel maintains immutable deployment history for rollback.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Incident response</h2>
          <p>
            We maintain an incident response playbook covering:
            detection, triage, containment, customer notification,
            post-incident review.
          </p>
          <p>
            <strong>Notification commitment:</strong> if we become aware
            of a security incident affecting your data, we will notify
            you within <strong>72 hours</strong> with the facts we have
            at that time, and we will continue to update you as the
            investigation progresses.
          </p>
          <p>
            Report a suspected vulnerability:{" "}
            <a href="mailto:hello@mallin.io">hello@mallin.io</a> with
            &quot;Security&quot; in the subject. We acknowledge within
            24 hours.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Data deletion</h2>
          <p>
            Customer-initiated data deletion: email{" "}
            <a href="mailto:hello@mallin.io">hello@mallin.io</a> from
            an account-owner email address. We acknowledge within 24
            hours and complete deletion within 30 days, including
            backups.
          </p>
          <p>
            On account closure: all customer data is purged from active
            systems within 30 days and from backups within an
            additional 30 days, per the Privacy Policy retention
            schedule.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Compliance posture</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Framework</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>SOC 2 Type 1</strong></td>
                  <td><span className={`${styles.pill} ${styles.pillWarn}`}>Planned</span></td>
                  <td>Formal engagement scoped for after first paid customer. Architecture is SOC 2-aligned today; the attestation lags.</td>
                </tr>
                <tr>
                  <td><strong>GDPR</strong></td>
                  <td><span className={`${styles.pill} ${styles.pillInfo}`}>Aligned</span></td>
                  <td>DPA available on request. Subject-rights workflow operational. Standard Contractual Clauses for EU→US transfers where applicable.</td>
                </tr>
                <tr>
                  <td><strong>CCPA / CPRA</strong></td>
                  <td><span className={`${styles.pill} ${styles.pillInfo}`}>Aligned</span></td>
                  <td>Subject-rights workflow operational. We do not sell personal information.</td>
                </tr>
                <tr>
                  <td><strong>HIPAA</strong></td>
                  <td><span className={`${styles.pill} ${styles.pillWarn}`}>Not in scope</span></td>
                  <td>Mallín is not currently designed for protected health information. Do not upload PHI.</td>
                </tr>
                <tr>
                  <td><strong>PCI DSS</strong></td>
                  <td><span className={`${styles.pill} ${styles.pillWarn}`}>Not in scope</span></td>
                  <td>Mallín does not collect or process payment card data.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Vendor security questionnaires</h2>
          <p>
            If your security team needs a SIG, CAIQ, or custom
            questionnaire filled out, or if you need us to sign a DPA
            or NDA before exchange, email{" "}
            <a href="mailto:hello@mallin.io">hello@mallin.io</a> with
            the request. We turn these around within 48 hours during
            design-partner phase.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What we will not do</h2>
          <ul>
            <li>Sell or rent your data.</li>
            <li>Use your deal content to train shared AI models.</li>
            <li>Share your data with other Mallín customers.</li>
            <li>Provide your data to law enforcement without legal process; if compelled by valid process, we will notify you unless prohibited.</li>
            <li>Maintain a parallel data plane that diverges from your CRM (see <a href="/ai-governance">AI Governance</a> and <a href="/terms">Terms</a>).</li>
          </ul>
        </section>

      </div>
    </>
  );
}
