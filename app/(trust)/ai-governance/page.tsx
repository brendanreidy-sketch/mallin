/**
 * /ai-governance — How Mallín governs the AI layer.
 *
 * This is the most differentiated trust artifact. It exists because
 * "AI for sales" is a category full of vague claims; Mallín's value
 * is the specific guardrails. Public statement of the cognition
 * contract, write-through doctrine, and human-approval gates.
 */

import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = {
  title: "Mallín — AI Governance Policy",
  description:
    "How Mallín governs the AI layer. What goes to the model, what doesn't, where humans approve, and how the agent stays bounded.",
};

const EFFECTIVE_DATE = "2026-05-20";

export default function AIGovernancePage() {
  return (
    <>
      <p className={styles.eyebrow}>— AI Governance Policy</p>
      <h1 className={styles.h1}>How the <em>agent layer</em> is bounded.</h1>
      <p className={styles.lastUpdated}>Last updated: {EFFECTIVE_DATE}</p>

      <p className={styles.lede}>
        Mallín&apos;s category is &quot;governed AI operating layer for
        revenue execution&quot; — not RevOps AI, not sales coach, not
        AI workspace. The difference is the specific guardrails we
        apply to the model. This page describes them in detail, not in
        marketing language.
      </p>

      <div className={styles.body}>

        <section className={styles.section}>
          <h2 className={styles.h2}>Which AI we use</h2>
          <p>
            Mallín uses Anthropic&apos;s Claude family of large language
            models, accessed via Anthropic&apos;s commercial API. We
            currently use Claude Opus 4.7 for high-judgment tasks (brief
            generation, stakeholder analysis) and Claude Haiku for
            faster lower-stakes inference (chat replies, theme
            generation).
          </p>
          <p>
            Anthropic is listed as a subprocessor on our{" "}
            <a href="/subprocessors">Subprocessor List</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What goes to the AI</h2>
          <p>
            When you use Mallín, the following may be sent to the AI
            model as part of a request:
          </p>
          <ul>
            <li><strong>Deal substrate:</strong> account information, opportunity records, stakeholder names and titles, call transcripts you&apos;ve loaded, notes you&apos;ve written.</li>
            <li><strong>Public-web research:</strong> press releases, SEC filings, LinkedIn profile data we&apos;ve gathered about the companies and people in your deals.</li>
            <li><strong>Your prompt:</strong> the question or instruction you give the chat surface.</li>
            <li><strong>Cross-deal patterns within your tenant:</strong> notes you&apos;ve tagged as cross-cutting wisdom are surfaced to the model on related future deals (your tenant only — never another customer&apos;s patterns).</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What does NOT go to the AI</h2>
          <ul>
            <li>Authentication credentials, MFA secrets, OAuth tokens, API keys.</li>
            <li>Payment information (we don&apos;t collect any; if we did it would never reach the model).</li>
            <li>Personal information from people not associated with your deals.</li>
            <li>Data from other Mallín customers — full stop. Cross-tenant context never crosses the model boundary.</li>
            <li>Data you&apos;ve marked private or that lives in private notes in your CRM (where your CRM marks it as private).</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Anthropic&apos;s data handling</h2>
          <p>
            Under Anthropic&apos;s standard commercial API terms,
            Anthropic does <strong>not</strong> use API inputs or
            outputs to train their models. API requests are retained by
            Anthropic for up to 30 days for trust and safety review,
            then deleted. Anthropic is a subprocessor — your data
            crosses to them when you use Mallín features that require
            AI inference.
          </p>
          <p>
            For the authoritative source on Anthropic&apos;s commercial
            data handling, see{" "}
            <a href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener noreferrer">Anthropic&apos;s Commercial Terms</a>{" "}
            and their{" "}
            <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>The cognition contract</h2>
          <p>
            Every recommendation Mallín makes — every brief section,
            every stakeholder read, every suggested next move — must
            satisfy a five-element structure:
          </p>
          <ul>
            <li><strong>Risk:</strong> what could break the deal, named clearly.</li>
            <li><strong>Move:</strong> the prescriptive next action, not a list of considerations.</li>
            <li><strong>Evidence:</strong> the quoted source the reasoning rests on (call transcript, public filing, LinkedIn profile, past rep note).</li>
            <li><strong>Temporal proof:</strong> when the evidence was generated (artifact timestamp, not wall-clock guess).</li>
            <li><strong>Decision:</strong> what the rep is being asked to approve or reject.</li>
          </ul>
          <p>
            The model is constrained to produce this structure or
            nothing. We do <strong>not</strong> ship recommendations
            that don&apos;t have linked evidence — that&apos;s the
            anti-hallucination guarantee. If the model can&apos;t cite
            the source, it doesn&apos;t make the claim.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Human-approval gates</h2>
          <p>
            Not everything Mallín generates is auto-applied. Outputs
            are tiered by reversibility:
          </p>
          <ul>
            <li><strong>Auto-write tier:</strong> notes, logged activities, last-contact timestamps. Safe to write directly to CRM; easy to undo if wrong.</li>
            <li><strong>Approve-then-write tier:</strong> MEDDPICC field changes, role assignments, competition flags. Mallín proposes; the rep approves before anything writes.</li>
            <li><strong>Never-auto tier:</strong> deal stage, amount, close date, forecast category. Mallín does not write these even with rep approval — these are the rep&apos;s explicit decision in their CRM. Mallín can suggest, never write.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Write-through to CRM</h2>
          <p>
            Mallín&apos;s outputs land in your CRM as the system of
            record. Notes you save in Mallín become CRM notes;
            drafted-and-sent emails become CRM activities; action items
            become CRM tasks. We do not maintain a parallel data plane
            where rep contributions live only in Mallín.
          </p>
          <p>
            CRM permissions govern visibility. If your CRM has a
            private-note flag, Mallín passes it through. If a rep
            doesn&apos;t have access to a record in your CRM, they
            don&apos;t see it in Mallín either.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Pattern learning (within your tenant only)</h2>
          <p>
            When a rep tags a note as a &quot;cross-deal pattern&quot;
            in Mallín, that note is surfaced to the model on future
            similar deals <strong>within the same tenant</strong>. This
            is how Mallín learns each customer&apos;s operating style
            over time.
          </p>
          <p>
            Pattern learning is strictly tenant-bounded:
          </p>
          <ul>
            <li>Patterns from Customer A never inform briefs for Customer B.</li>
            <li>We do not train shared models on patterns from any tenant.</li>
            <li>Patterns are stored alongside the deal note they came from; deleting the note deletes the pattern.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Provenance &amp; audit trail</h2>
          <p>
            Every AI-generated artifact carries provenance metadata:
            which model produced it, when, against which substrate,
            with which prompt template version. The rep can see this
            in the cockpit; the audit log captures it for compliance
            review.
          </p>
          <p>
            When the model regenerates an artifact, the prior version
            is retained — not overwritten. The rep can review the diff
            between versions to understand what changed and why.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What Mallín will not do</h2>
          <ul>
            <li>Generate or send customer-facing communication without rep approval.</li>
            <li>Modify CRM stage, amount, close date, or forecast category — even with rep approval. Those are the rep&apos;s explicit decision in their CRM.</li>
            <li>Surface cross-tenant context. Your patterns inform your briefs; Customer A&apos;s never inform Customer B&apos;s.</li>
            <li>Train shared models on your data.</li>
            <li>Make claims without linked evidence (cognition contract).</li>
            <li>Quietly overwrite rep contributions. If the model would change something the rep wrote, the rep approves the change first.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Reporting AI errors</h2>
          <p>
            If Mallín produces a recommendation you believe is wrong,
            harmful, or out of scope, please report it:{" "}
            <a href="mailto:hello@mallin.io">hello@mallin.io</a>. We
            review every report and use it to improve our prompts,
            evaluation harness, and guardrails. Reports are not
            attributed back to the model provider.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Updates to this policy</h2>
          <p>
            We&apos;ll update this policy as Mallín&apos;s AI usage
            evolves (new models, new providers, new guardrails). The
            &quot;Last updated&quot; date at the top reflects the most
            recent change. Material changes are communicated by email
            in advance.
          </p>
        </section>

      </div>
    </>
  );
}
