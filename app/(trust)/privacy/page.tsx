/**
 * /privacy — Mallín's Privacy Policy.
 *
 * Honest about current practice. Pre-revenue, design-partner phase.
 * Reviewed by legal counsel — see banner at top.
 */

import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = {
  title: "Mallín — Privacy Policy",
  description:
    "What data Mallín collects, how we use it, who we share it with, how long we keep it, and your rights.",
};

const EFFECTIVE_DATE = "2026-05-20";

export default function PrivacyPolicyPage() {
  return (
    <>
      <p className={styles.eyebrow}>— Privacy Policy</p>
      <h1 className={styles.h1}>How we handle <em>your data</em>.</h1>
      <p className={styles.lastUpdated}>Effective: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}</p>

      <div className={styles.draftBanner}>
        <strong>Note</strong> · This policy reflects Mallín&apos;s current
        practice during the design-partner phase. Mallín is operated by
        roomrefund LLC, a Colorado limited liability company, doing
        business as Mallín. Your data handling is described below.
        Questions:{" "}
        <a href="mailto:privacy@mallin.io" style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: "3px" }}>privacy@mallin.io</a>.
      </div>

      <div className={styles.body}>

        <section className={styles.section}>
          <h2 className={styles.h2}>1. Who we are</h2>
          <p>
            Mallín is the operating layer of the revenue organization —
            an AI agent that helps sales reps prepare for, run, and
            follow up on customer calls. The product is operated by{" "}
            <strong>roomrefund LLC</strong> (doing business as
            &quot;Mallín&quot;; the &quot;Company&quot;, &quot;we&quot;,
            &quot;us&quot;), a Colorado limited liability company. Our
            contact email for all privacy matters is{" "}
            <a href="mailto:privacy@mallin.io">privacy@mallin.io</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>2. What data we collect</h2>
          <h3 className={styles.h3}>Account data</h3>
          <p>
            When you create a Mallín account, we collect: your name,
            email address, company name, role/title, and authentication
            credentials (managed by our auth provider — see
            Subprocessors). If you enable multi-factor authentication,
            we additionally store the TOTP secret or recovery codes
            associated with your account.
          </p>

          <h3 className={styles.h3}>Deal data</h3>
          <p>
            Mallín collects data about the deals you work — account
            information, opportunity records, stakeholder names and
            titles, call transcripts (when you load them), notes,
            stakeholder interactions, and any custom fields you
            populate. This data either originates inside Mallín (when
            you write a note or load a transcript) or is synced from
            your CRM when you connect one.
          </p>

          <h3 className={styles.h3}>CRM-connected data</h3>
          <p>
            If you connect Mallín to a CRM (HubSpot, Salesforce,
            Pipedrive), we read deal, contact, account, and activity
            data from your CRM to populate Mallín&apos;s working
            surfaces. We also write back to your CRM: notes you create
            in Mallín, action items you save, drafted emails. We never
            modify CRM data that wasn&apos;t explicitly produced or
            approved in Mallín.
          </p>

          <h3 className={styles.h3}>Usage data</h3>
          <p>
            We collect telemetry about how you use Mallín: which pages
            you visit, which features you engage with, errors you
            encounter, the timing of those interactions. This data is
            used to operate, debug, and improve the product. Telemetry
            is associated with your account but is not sold to or shared
            with advertising networks.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>3. How we use your data</h2>
          <ul>
            <li><strong>Deliver the service:</strong> generate pre-call briefs, surface stakeholder intelligence, draft follow-ups, and write back to your CRM.</li>
            <li><strong>Learn within your tenant:</strong> notes you save become context that shapes future briefs <em>for your account only</em>. We do not train shared models on your data.</li>
            <li><strong>Customer support:</strong> respond to your questions, debug issues, send service-related communications.</li>
            <li><strong>Security &amp; compliance:</strong> detect abuse, prevent fraud, meet legal obligations.</li>
            <li><strong>Improve the product:</strong> aggregate, anonymized usage patterns inform engineering priorities.</li>
          </ul>
          <p>
            We do <strong>not</strong>: sell your data, share it with
            advertising networks, or use your deal content to train
            shared AI models. See our{" "}
            <a href="/ai-governance">AI Governance Policy</a> for the
            specific rules around the AI layer.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>4. Who we share data with</h2>
          <p>
            We share data only with the subprocessors required to
            operate the service. Each one has a specific role and a
            data-processing relationship with us. The complete list,
            with location and purpose, is at{" "}
            <a href="/subprocessors">/subprocessors</a>.
          </p>
          <p>
            We do not share your data with third parties for any other
            purpose. We will not share your data with law enforcement
            without legal process; if we are compelled by valid legal
            process, we will notify you unless prohibited from doing so.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>5. How long we keep your data</h2>
          <ul>
            <li><strong>Account data:</strong> retained while your account is active. Deleted within 30 days of account closure (or sooner on written request).</li>
            <li><strong>Deal data:</strong> retained until you delete the deal or close your account. Soft-deleted records purged within 30 days.</li>
            <li><strong>Backups:</strong> our database provider (Supabase) retains point-in-time recovery snapshots for up to 7 days. Deleted data is removed from active systems immediately and from backups within 7 days.</li>
            <li><strong>Logs &amp; telemetry:</strong> retained for up to 90 days for operational debugging, then deleted.</li>
            <li><strong>Audit logs:</strong> retained for the life of the account for compliance and security review.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>6. Your rights</h2>
          <p>
            Depending on where you live, you have some or all of the
            following rights:
          </p>
          <ul>
            <li><strong>Access:</strong> request a copy of the data we hold about you.</li>
            <li><strong>Rectification:</strong> correct inaccurate data.</li>
            <li><strong>Erasure:</strong> have your data deleted (subject to legal retention requirements).</li>
            <li><strong>Portability:</strong> receive your data in a structured, machine-readable format.</li>
            <li><strong>Restriction:</strong> ask us to limit how we process your data.</li>
            <li><strong>Objection:</strong> object to specific processing activities.</li>
            <li><strong>Withdrawal of consent:</strong> where processing is based on your consent, withdraw it at any time.</li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a href="mailto:privacy@mallin.io">privacy@mallin.io</a>. We
            respond within 30 days. We may need to verify your identity
            before fulfilling certain requests.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>7. Where your data is stored</h2>
          <p>
            Your data is stored on infrastructure operated by our
            subprocessors. Primary storage (Supabase, Vercel) is in
            United States data centers (AWS US-East). Some metadata
            (authentication tokens, session state) may transit through
            globally-distributed edge networks for performance.
          </p>
          <p>
            For customers in the European Economic Area, the United
            Kingdom, or Switzerland, transfers of personal data outside
            those regions are protected by the standard contractual
            clauses where applicable. Contact us if you need a Data
            Processing Addendum (DPA).
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>8. Security</h2>
          <p>
            See our <a href="/security">Security &amp; Trust</a> page
            for the full picture. In short: data is encrypted in transit
            (TLS 1.3) and at rest (AES-256 via our infrastructure
            providers); multi-tenant isolation is enforced at the
            database row level; access controls are role-based with
            audit logging; multi-factor authentication is available on
            all accounts.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>9. Children</h2>
          <p>
            Mallín is a business tool. It is not directed to, and not
            intended for use by, children under the age of 16. We do not
            knowingly collect data from children under 16. If you
            believe we have inadvertently collected such data, contact
            us and we will delete it.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>10. Changes to this policy</h2>
          <p>
            We&apos;ll update this policy as Mallín evolves. The
            &quot;Last updated&quot; date at the top reflects the most
            recent change. Material changes — anything that meaningfully
            expands the data we collect or how we use it — we notify you
            of by email before they take effect.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>11. Contact</h2>
          <p>
            Privacy questions, requests, complaints:{" "}
            <a href="mailto:privacy@mallin.io">privacy@mallin.io</a>.
          </p>
        </section>

      </div>
    </>
  );
}
