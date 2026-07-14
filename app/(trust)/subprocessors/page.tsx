/**
 * /subprocessors — the full list of third parties that process
 * customer data on Mallín's behalf.
 */

import type { Metadata } from "next";
import styles from "../trust.module.css";

export const metadata: Metadata = {
  title: "Mallín — Subprocessors",
  description:
    "The complete list of third parties Mallín uses to process customer data, with location and purpose.",
};

const EFFECTIVE_DATE = "2026-05-20";

interface Subprocessor {
  name: string;
  purpose: string;
  data: string;
  region: string;
  link: string;
  status: "active" | "planned";
}

const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Anthropic",
    purpose: "AI model inference (Claude API) — brief generation, chat replies, stakeholder analysis",
    data: "Deal substrate, call transcripts, your prompts. No auth tokens, no PII outside deal context.",
    region: "United States",
    link: "https://www.anthropic.com/legal/commercial-terms",
    status: "active",
  },
  {
    name: "Supabase",
    purpose: "Primary database (Postgres) + storage for customer data, accounts, deals, notes, audit logs",
    data: "All customer data at rest. Encrypted with AES-256.",
    region: "United States (AWS US-East)",
    link: "https://supabase.com/privacy",
    status: "active",
  },
  {
    name: "Clerk",
    purpose: "Authentication, session management, multi-factor authentication, organization membership",
    data: "Account email, hashed password, MFA secrets, session tokens. No deal data.",
    region: "United States",
    link: "https://clerk.com/legal/privacy",
    status: "active",
  },
  {
    name: "Vercel",
    purpose: "Web hosting, edge runtime, serverless function execution, deployment platform",
    data: "All HTTP traffic transits Vercel edge. Application logs (retained ~30 days). Secrets stored in encrypted env-var store.",
    region: "United States (primary) + global edge for static assets",
    link: "https://vercel.com/legal/privacy-policy",
    status: "active",
  },
  {
    name: "Resend",
    purpose: "Transactional email (pilot signup notifications, contact form deliveries, account emails)",
    data: "Recipient email, message subject + body. No deal data.",
    region: "United States",
    link: "https://resend.com/legal/privacy-policy",
    status: "active",
  },
  {
    name: "HubSpot (when connected)",
    purpose: "CRM integration — Mallín reads deal/contact/account data and writes back notes, activities, tasks per your write-through configuration",
    data: "Whatever your HubSpot OAuth scopes grant. Governed by your HubSpot tenant's permissions and your CRM admin.",
    region: "Determined by your HubSpot account",
    link: "https://legal.hubspot.com/privacy-policy",
    status: "active",
  },
  {
    name: "Salesforce (when connected)",
    purpose: "CRM integration (planned) — same pattern as HubSpot",
    data: "Determined by your Salesforce OAuth scopes",
    region: "Determined by your Salesforce org",
    link: "https://www.salesforce.com/company/privacy/",
    status: "planned",
  },
  {
    name: "Pipedrive (when connected)",
    purpose: "CRM integration (planned) — same pattern as HubSpot",
    data: "Determined by your Pipedrive OAuth scopes",
    region: "Determined by your Pipedrive account",
    link: "https://www.pipedrive.com/en/privacy",
    status: "planned",
  },
  {
    name: "GitHub",
    purpose: "Source code repository, deployment trigger (CI/CD), engineering audit trail",
    data: "Source code only. No customer data. No deal substrate.",
    region: "United States",
    link: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
    status: "active",
  },
];

export default function SubprocessorsPage() {
  return (
    <>
      <p className={styles.eyebrow}>— Subprocessors</p>
      <h1 className={styles.h1}>Every third party that <em>touches your data</em>.</h1>
      <p className={styles.lastUpdated}>Last updated: {EFFECTIVE_DATE}</p>

      <p className={styles.lede}>
        These are the vendors Mallín uses to operate the service. Each
        one has a specific role, processes a specific subset of your
        data, and operates under its own data-processing terms. We
        update this page whenever we add or remove a vendor — we will
        not silently expand the list.
      </p>

      <div className={styles.body}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Purpose</th>
                <th>What we send</th>
                <th>Region</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name}>
                  <td>
                    <strong>{s.name}</strong>
                    <br />
                    <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11.5px" }}>
                      Privacy terms ↗
                    </a>
                  </td>
                  <td>{s.purpose}</td>
                  <td>{s.data}</td>
                  <td>{s.region}</td>
                  <td>
                    <span
                      className={`${styles.pill} ${
                        s.status === "active" ? styles.pillGood : styles.pillWarn
                      }`}
                    >
                      {s.status === "active" ? "Active" : "Planned"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className={styles.section}>
          <h2 className={styles.h2}>How we evaluate subprocessors</h2>
          <ul>
            <li>Each subprocessor must have a published data-handling policy or DPA we can review.</li>
            <li>Each must operate under encryption (in transit + at rest) standards equivalent to ours.</li>
            <li>Where possible, we choose subprocessors with current SOC 2 or equivalent third-party attestation.</li>
            <li>We minimize what we send to each — the data table above lists the actual scope, not the contractual maximum.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Changes</h2>
          <p>
            When we add a new subprocessor, this page is updated and the
            change appears in the &quot;Last updated&quot; date at the
            top. Customers on active pilots are notified by email of new
            subprocessors at least 14 days before they go live.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Questions</h2>
          <p>
            Subprocessor questions, DPA requests, customer-specific
            arrangements:{" "}
            <a href="mailto:hello@mallin.io">hello@mallin.io</a>.
          </p>
        </section>
      </div>
    </>
  );
}
