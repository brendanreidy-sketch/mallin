/**
 * /terms — Mallín's Terms of Service.
 *
 * Honest about current practice. Drafted to be lawyer-ready, not
 * lawyer-approved. Operated by roomrefund LLC (dba Mallín), a Colorado
 * LLC. Warrants a legal review before being relied on.
 */

import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = {
  title: "Mallín — Terms of Service",
  description:
    "The terms that govern your use of Mallín during design-partner phase.",
};

const EFFECTIVE_DATE = "2026-05-20";

export default function TermsPage() {
  return (
    <>
      <p className={styles.eyebrow}>— Terms of Service</p>
      <h1 className={styles.h1}>The <em>rules</em> of using Mallín.</h1>
      <p className={styles.lastUpdated}>Effective: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}</p>

      <div className={styles.draftBanner}>
        <strong>Note</strong> · These terms reflect Mallín&apos;s current
        practice during the design-partner phase. Mallín is operated by
        roomrefund LLC, a Colorado limited liability company, doing
        business as Mallín. Your usage rights and our obligations are
        described below. Questions:{" "}
        <a href="mailto:hello@mallin.io" style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: "3px" }}>hello@mallin.io</a>.
      </div>

      <div className={styles.body}>

        <section className={styles.section}>
          <h2 className={styles.h2}>1. What this is</h2>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use
            of Mallín (the &quot;Service&quot;), operated by{" "}
            <strong>roomrefund LLC</strong> (doing business as
            &quot;Mallín&quot;; &quot;we&quot;, &quot;us&quot;), a Colorado
            limited liability company. By creating an account or
            using the Service, you agree to these Terms. If you
            don&apos;t agree, don&apos;t use the Service.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>2. What the Service does</h2>
          <p>
            Mallín is an AI-driven operating layer for revenue teams. It
            generates pre-call briefs, surfaces stakeholder
            intelligence, drafts follow-ups, and writes back to your
            CRM. The Service depends on third-party AI models (Anthropic
            Claude), authentication providers (Clerk), and storage
            (Supabase, Vercel). See the{" "}
            <a href="/subprocessors">Subprocessor List</a>.
          </p>
          <p>
            We may add, change, or remove features at any time. We&apos;ll
            give reasonable notice before removing material features.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>3. Your account</h2>
          <p>
            You&apos;re responsible for: keeping your credentials
            confidential, enabling multi-factor authentication where
            available, and notifying us promptly if you suspect
            unauthorized access. You&apos;re responsible for activity
            under your account.
          </p>
          <p>
            You must be at least 18 years old and have authority to
            bind your organization (if you&apos;re registering on
            behalf of one) to these Terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>4. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service to violate any law or third-party right.</li>
            <li>Upload data you don&apos;t have the right to use (including stolen, confidential, or proprietary data of others).</li>
            <li>Attempt to reverse-engineer, scrape, or extract our model weights, prompts, or proprietary systems.</li>
            <li>Use the Service to send spam, phishing, malware, or harassment.</li>
            <li>Probe, scan, or test the vulnerability of the Service except through authorized security research channels (contact <a href="mailto:hello@mallin.io">hello@mallin.io</a>).</li>
            <li>Misrepresent the Service&apos;s output as human-authored without disclosure where disclosure is required (e.g., regulated industries).</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>5. Your data, your IP</h2>
          <p>
            You retain all rights to the data you upload to or generate
            in Mallín (&quot;Your Content&quot;). You grant Mallín a
            limited, non-exclusive license to process Your Content
            solely to: (a) operate the Service for you, (b) generate
            outputs you&apos;ve requested, and (c) within your tenant
            only, learn patterns that improve future briefs <em>for
            your account</em>.
          </p>
          <p>
            We do <strong>not</strong>: train shared models on Your
            Content, sell Your Content, share Your Content with other
            customers, or use Your Content for marketing without your
            written permission.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>6. Mallín&apos;s IP</h2>
          <p>
            Mallín (the platform, software, prompts, UI, mockups, and
            associated documentation) is owned by Mallín or our
            licensors. These Terms grant you a limited, non-exclusive,
            non-transferable, revocable right to use the Service. They
            don&apos;t transfer any ownership.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>7. AI outputs</h2>
          <p>
            Mallín uses large language models to generate briefs,
            drafts, and recommendations (collectively, &quot;AI
            Outputs&quot;). Important properties of AI Outputs:
          </p>
          <ul>
            <li>They can be incorrect, incomplete, or out of date. Verify before relying on them for material decisions.</li>
            <li>Our <a href="/ai-governance">AI Governance Policy</a> describes the safeguards we apply (cognition contract, evidence on every claim, approval gates, write-through to CRM).</li>
            <li>Where Mallín writes back to your CRM, those writes are governed by your CRM&apos;s existing permissions — see Section 5 above and our <a href="/security">Security &amp; Trust</a> page.</li>
            <li>You are responsible for reviewing AI Outputs before acting on them in customer-facing contexts.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>8. Fees</h2>
          <p>
            During design-partner phase, the Service is provided at no
            charge to participating customers under a separate Pilot
            Agreement. Once general availability begins, pricing will be
            published. We&apos;ll give existing customers at least 30
            days&apos; notice before any paid tier takes effect for
            their account.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>9. Termination</h2>
          <p>
            You may stop using the Service and delete your account at
            any time by emailing{" "}
            <a href="mailto:hello@mallin.io">hello@mallin.io</a>. We may
            suspend or terminate your account if you breach these Terms,
            with reasonable notice where practical.
          </p>
          <p>
            On termination, we delete Your Content within 30 days as
            described in the{" "}
            <a href="/privacy">Privacy Policy</a>, subject to legal
            retention requirements.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>10. Service availability &amp; disclaimers</h2>
          <p>
            We do our best to keep the Service available and accurate
            but we don&apos;t guarantee uninterrupted service or that
            AI Outputs will be free of errors. The Service is provided
            &quot;as is&quot; and &quot;as available.&quot; To the
            fullest extent permitted by law, we disclaim all warranties,
            express or implied, including merchantability, fitness for
            a particular purpose, and non-infringement.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>11. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, neither Mallín nor
            our affiliates, officers, employees, or agents are liable
            for any indirect, incidental, special, consequential, or
            punitive damages — including lost profits, lost data, or
            business interruption — arising from your use of the
            Service. Our total aggregate liability for any claim
            arising from these Terms or the Service is capped at the
            greater of: (a) fees you paid us in the twelve months
            preceding the claim, or (b) $100 USD.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>12. Indemnification</h2>
          <p>
            You agree to indemnify Mallín against claims arising from:
            (a) Your Content, (b) your breach of these Terms, or (c)
            your violation of law or third-party rights.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>13. Governing law</h2>
          <p>
            These Terms are governed by the laws of{" "}
            <strong>[Jurisdiction TBD]</strong>, excluding its
            conflict-of-law principles. Disputes will be resolved in
            the courts of that jurisdiction, unless we agree in writing
            to a different forum.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>14. Changes</h2>
          <p>
            We may update these Terms as Mallín evolves. Material
            changes will be communicated by email at least 30 days
            before they take effect. Your continued use of the Service
            after a change constitutes acceptance.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>15. Contact</h2>
          <p>
            Questions about these Terms:{" "}
            <a href="mailto:hello@mallin.io">hello@mallin.io</a>.
          </p>
        </section>

      </div>
    </>
  );
}
