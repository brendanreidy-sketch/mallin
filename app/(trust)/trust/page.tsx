/**
 * /trust — hub page linking to every legal / security / AI-governance
 * surface. The single URL Mallín sends to a security reviewer or
 * compliance team at a design-partner customer.
 */

import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = {
  title: "Mallín — Trust & Security",
  description:
    "How Mallín handles your data, your AI policy, our subprocessors, and the security posture behind the operating layer.",
};

export default function TrustHubPage() {
  return (
    <>
      <p className={styles.eyebrow}>— Trust &amp; Security</p>
      <h1 className={styles.h1}>
        How we handle <em>your data</em> + the agent layer that sits over it.
      </h1>
      <p className={styles.lede}>
        Mallín is the operating layer of the revenue organization — which
        means it sits between your reps, your AI, and your CRM. We owe
        you a clear picture of what we collect, where it goes, who
        touches it, and how we govern the AI that interprets it. Every
        document below reflects current practice, not aspirational
        compliance copy.
      </p>

      <div className={styles.draftBanner}>
        <strong>Status</strong> · Mallín is in late design-partner phase
        ahead of broader release. These documents reflect current practice
        and are under active legal + security review. Formal SOC 2
        engagement is planned; we&apos;ll publish a current-state report
        the moment we have one. Questions? <a href="mailto:hello@mallin.io" style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: "3px" }}>hello@mallin.io</a>.
      </div>

      <div className={styles.hubGrid}>
        <a className={styles.hubCard} href="/privacy">
          <p className={styles.hubCardLabel}>01 — Privacy Policy</p>
          <p className={styles.hubCardTitle}>What we collect &amp; how we use it</p>
          <p className={styles.hubCardDesc}>
            The data Mallín collects, what we do with it, who we share it
            with, how long we keep it, and your rights to access /
            export / delete it.
          </p>
        </a>

        <a className={styles.hubCard} href="/terms">
          <p className={styles.hubCardLabel}>02 — Terms of Service</p>
          <p className={styles.hubCardTitle}>The rules of using Mallín</p>
          <p className={styles.hubCardDesc}>
            Service description, account responsibilities, acceptable
            use, IP ownership (you own your deal data, we own the
            platform), and the boundaries we keep on both sides.
          </p>
        </a>

        <a className={styles.hubCard} href="/security">
          <p className={styles.hubCardLabel}>03 — Security &amp; Trust</p>
          <p className={styles.hubCardTitle}>How we protect what you give us</p>
          <p className={styles.hubCardDesc}>
            Architecture, encryption posture, multi-tenant isolation,
            access controls, incident response, the compliance roadmap.
            What we have today + what&apos;s in progress.
          </p>
        </a>

        <a className={styles.hubCard} href="/ai-governance">
          <p className={styles.hubCardLabel}>04 — AI Governance</p>
          <p className={styles.hubCardTitle}>How the agent layer is bounded</p>
          <p className={styles.hubCardDesc}>
            What data goes to Anthropic&apos;s Claude API and what
            doesn&apos;t. The cognition contract (evidence on every
            claim). Human approval gates. CRM write-through. The
            specific guardrails that make Mallín a governed operating
            layer instead of an AI workspace.
          </p>
        </a>

        <a className={styles.hubCard} href="/subprocessors">
          <p className={styles.hubCardLabel}>05 — Subprocessors</p>
          <p className={styles.hubCardTitle}>Every third party that touches your data</p>
          <p className={styles.hubCardDesc}>
            Anthropic, Supabase, Clerk, Vercel, Resend — the full list,
            what each one processes, where, and under what terms.
            Updated whenever we add or remove a vendor.
          </p>
        </a>

        <a
          className={styles.hubCard}
          href="mailto:hello@mallin.io?subject=Security%20Packet%20Request"
        >
          <p className={styles.hubCardLabel}>06 — Custom Security Packet</p>
          <p className={styles.hubCardTitle}>For enterprise security reviews</p>
          <p className={styles.hubCardDesc}>
            If your team needs a vendor security questionnaire (SIG /
            CAIQ / custom) filled out, or a DPA signed, email us — we
            turn these around in under 48 hours during design-partner
            phase.
          </p>
        </a>
      </div>
    </>
  );
}
