/**
 * ============================================================================
 *  /sf/preview — Salesforce Lightning lookalike for non-technical demos
 * ============================================================================
 *
 *  Goal: when a non-technical viewer (rep, sales leader, exec) opens
 *  this, they should immediately see "this looks like our Salesforce"
 *  and instantly understand "AI proposed these updates from our call."
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. NO WRITES. This page never touches Salesforce or substrate.  ║
 *  ║     It renders hardcoded demo data only.                         ║
 *  ║  2. NO APPLY BUTTON. The "Apply" button at top is disabled with  ║
 *  ║     "Coming soon" — verification before earning write access.    ║
 *  ║  3. PRODUCTION-GUARDED. 404 in prod unless SF_DEBUG_ENABLED=true.║
 *  ╚══════════════════════════════════════════════════════════════════╝
 *
 *  Modes (via ?view=):
 *    - "after"  (default): show proposed updates with green/amber/gray
 *                          highlights and call attribution
 *    - "before"          : show the SF record as it would look without
 *                          the AI updates (mostly empty fields)
 *
 *  Right now hardcoded to one synthetic account: Cirrus Retail - Platform.
 *  Schema mirrors a standard SF opportunity record (Lightning section
 *  layout).
 * ============================================================================
 */

import { notFound } from "next/navigation";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import { DEMO_OPPORTUNITY } from "./data";
import type { DemoOpportunity, SectionField } from "./data";
import styles from "./preview.module.css";

export const dynamic = "force-dynamic";

type View = "after" | "before";

function FieldValue({ field, view }: { field: SectionField; view: View }) {
  // Static field, no update.
  if (!field.update) {
    if (field.value == null || field.value === "—" || field.value === "") {
      return <div className={`${styles.fieldValue} ${styles.empty}`}>—</div>;
    }
    return (
      <div
        className={`${styles.fieldValue} ${field.link ? styles.link : ""} ${field.multiline ? styles.multiline : ""}`}
      >
        {field.value}
      </div>
    );
  }

  // BEFORE view: render the pre-update value, no badge, no highlight.
  if (view === "before") {
    const v = field.update.before;
    if (v == null || v === "") {
      return <div className={`${styles.fieldValue} ${styles.empty}`}>—</div>;
    }
    return <div className={styles.fieldValue}>{v}</div>;
  }

  // AFTER view: render the delta with before-strikethrough → after.
  return (
    <div className={styles.fieldDelta}>
      {field.update.before ? (
        <span className={styles.before}>{field.update.before}</span>
      ) : null}
      <span className={`${styles.after} ${field.multiline ? styles.multiline : ""}`}>
        {field.update.after}
      </span>
      {field.update.attribution ? (
        <span className={styles.fieldAttribution}>
          {field.update.attribution}
        </span>
      ) : null}
    </div>
  );
}

function FieldLabel({ field, view }: { field: SectionField; view: View }) {
  return (
    <div className={styles.fieldLabel}>
      <span>{field.label}</span>
      {view === "after" && field.update ? (
        <span className={`${styles.fieldBadge} ${styles[field.update.tier]}`}>
          {field.update.tier === "auto"
            ? "Auto"
            : field.update.tier === "suggest"
            ? "Suggest"
            : "Read-only"}
        </span>
      ) : null}
    </div>
  );
}

function fieldClassFor(view: View, field: SectionField): string {
  if (view === "before" || !field.update) return styles.field;
  return `${styles.field} ${styles[`updated_${field.update.tier}`]}`;
}

function countUpdates(opp: DemoOpportunity) {
  let auto = 0,
    suggest = 0,
    readonly = 0;
  for (const s of opp.sections) {
    for (const f of s.fields) {
      if (!f.update) continue;
      if (f.update.tier === "auto") auto++;
      else if (f.update.tier === "suggest") suggest++;
      else readonly++;
    }
  }
  return { auto, suggest, readonly, total: auto + suggest + readonly };
}

export default async function SfPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; account?: string }>;
}) {
  const access = checkSfDebugAccess();
  if (!access.allowed) notFound();

  const sp = await searchParams;
  const view: View = sp.view === "before" ? "before" : "after";
  // Right now only one demo account. When more arrive, switch on sp.account.
  const opp = DEMO_OPPORTUNITY;
  const counts = countUpdates(opp);

  return (
    <main className={styles.page}>
      {/* Demo banner — explicit "this is a preview" framing */}
      <div className={styles.demoBanner}>
        <span>
          <b>After every call, this is what lands in your CRM.</b> Auto in
          green, suggestions for the rep in amber, forecast-impacting in
          gray (we never touch those). This view is a preview — nothing is
          actually written to Salesforce.
        </span>
        <div className={styles.toggleGroup}>
          <a
            href="?view=before"
            className={view === "before" ? styles.active : ""}
          >
            Before
          </a>
          <a
            href="?view=after"
            className={view === "after" ? styles.active : ""}
          >
            After
          </a>
        </div>
      </div>

      <div className={styles.shell}>
        {/* The 30-second CRO read — the headline. Plain English, the
            voice of a 10-year sales manager telling you where the deal
            stands and what to do next. */}
        {view === "after" ? (
          <div className={styles.theRead}>
            <div className={styles.theReadLabel}>The read</div>
            <div className={styles.theReadBody}>{opp.theRead}</div>
            <div className={styles.theReadFooter}>
              <span>
                <b>Source:</b> {opp.callContext.title} ·{" "}
                {opp.callContext.date} · {opp.callContext.duration}
              </span>
              <span>
                {counts.auto} auto · {counts.suggest} for approval ·{" "}
                {counts.readonly} surfaced
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.theRead}>
            <div className={styles.theReadLabel}>Before the call</div>
            <div className={styles.theReadBody}>
              This is what the CRM looked like before. Toggle to{" "}
              <b>After</b> at the top to see what changes when the call
              lands.
            </div>
          </div>
        )}

        {/* Lightning-style header */}
        <div className={styles.recordHeader}>
          <div className={styles.recordTopRow}>
            <div className={styles.recordIcon}>★</div>
            <div>
              <div className={styles.recordTypeLabel}>Opportunity</div>
              <div className={styles.recordName}>{opp.name}</div>
            </div>
            <div className={styles.recordButtons}>
              <button className={styles.recordButton} disabled>
                + Follow
              </button>
              <button className={styles.recordButton} disabled>
                Edit
              </button>
              <button
                className={`${styles.recordButton} ${styles.primary}`}
                disabled
                title="Coming soon — apply requires explicit human confirmation per doctrine §11.3"
              >
                {view === "after" ? "Apply updates (coming soon)" : "Apply"}
              </button>
            </div>
          </div>

          <div className={styles.highlights}>
            <div className={styles.highlight}>
              <div className={styles.label}>Account Name</div>
              <div className={`${styles.value} ${styles.link}`}>
                {opp.accountName}
              </div>
            </div>
            <div className={styles.highlight}>
              <div className={styles.label}>Close Date</div>
              <div className={styles.value}>{opp.closeDate}</div>
            </div>
            <div className={styles.highlight}>
              <div className={styles.label}>Amount</div>
              <div className={styles.value}>{opp.amount}</div>
            </div>
            <div className={styles.highlight}>
              <div className={styles.label}>Opportunity Owner</div>
              <div className={`${styles.value} ${styles.link}`}>
                {opp.ownerName}
              </div>
            </div>
          </div>
        </div>

        {/* Stage path */}
        <div className={styles.stagePath}>
          {opp.stages.map((s) => (
            <div
              key={s.label}
              className={`${styles.stage} ${
                s.status === "complete"
                  ? styles.complete
                  : s.status === "current"
                  ? styles.current
                  : ""
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <div className={`${styles.tab} ${styles.active}`}>Details</div>
          <div className={styles.tab}>Related</div>
          <div className={styles.tab}>Discovery Framework</div>
          <div className={styles.tab}>Gong</div>
        </div>

        {/* Sections */}
        <div className={styles.detailsBody}>
          {opp.sections.map((section) => (
            <div key={section.title} className={styles.section}>
              <div className={styles.sectionHeader}>{section.title}</div>
              {view === "after" && section.note ? (
                <div className={styles.sectionNote}>{section.note}</div>
              ) : null}
              <div className={styles.sectionGrid}>
                {section.fields.map((field) => (
                  <div
                    key={field.label}
                    className={fieldClassFor(view, field)}
                  >
                    <FieldLabel field={field} view={view} />
                    <FieldValue field={field} view={view} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Audit footer — plain-English version */}
        <div className={styles.auditFooter}>
          <h3>How this works</h3>
          <ul>
            <li>
              <b style={{ color: "#3aa55c" }}>Green (auto)</b> — stamps,
              notes, the kind of stuff a rep would type in if they had
              time. We just type it for them.
            </li>
            <li>
              <b style={{ color: "#cf8b1f" }}>Amber (for approval)</b> —
              the qualitative read. Champion, economic buyer, why-now, competition,
              risks. The rep gets a one-click Approve / Edit / Dismiss
              before any of this lands.
            </li>
            <li>
              <b style={{ color: "#706e6b" }}>Gray (we don't touch)</b> —
              Stage, Amount, Close Date. Anything that moves the forecast
              stays the rep's call. We surface the gap, you decide.
            </li>
          </ul>
          <p style={{ marginTop: 10, marginBottom: 0 }}>
            Every update has a line in the audit log: where it came from
            (which call, which timestamp), who approved it, when. Nothing
            is silent.
          </p>
        </div>
      </div>
    </main>
  );
}
