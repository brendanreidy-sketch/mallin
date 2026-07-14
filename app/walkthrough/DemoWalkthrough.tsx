"use client";

/**
 * DemoWalkthrough — the 5-step guided tour of Mallín on the Hooli
 * Holdings substrate.
 *
 * Design intent (per user direction):
 *   - Optimize for ONE unforgettable operational moment, not breadth.
 *   - Self-aware orientation sentence per step (not a chat-narrated tour).
 *   - The execution agent is the centerpiece — bias attention toward
 *     drafted-output + governed-action, not just analysis.
 *   - "Simulation mode" is visible at every moment so visitors can
 *     click freely.
 *   - The causal chain (Linda quiet → Marcus solo → Devin reframes →
 *     rep reacting) is the load-bearing element of step 2.
 *
 * Step map:
 *   1. A deal just changed     — risk surfaces
 *   2. See why                 — evidence + causal chain
 *   3. Mallín suggests         — execution drafts (the Cursor moment)
 *   4. Govern the action       — queue + approve + audit ledger
 *   5. This is how it works    — closing + apply CTA
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { HOOLI_HOLDINGS } from "@/lib/demo/substrate/hooli-holdings";
import s from "./demo.module.css";

const TOTAL_STEPS = 5;
const CONTACT_EMAIL = "hello@mallin.io";

export default function DemoWalkthrough() {
  const [step, setStep] = useState<number>(1);
  const [approvedActions, setApprovedActions] = useState<Set<string>>(new Set());

  // Keyboard nav — arrow keys advance/retreat steps for click-free demo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(TOTAL_STEPS, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(1, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const deal = HOOLI_HOLDINGS.deal;

  return (
    <div className={s.page}>
      {/* Simulation-mode banner — pinned to top, visible at every step.
          Reduces anxiety so visitors click around freely. */}
      <div className={s.simBanner}>
        <span className={s.simDot} aria-hidden="true" />
        <span>
          <strong>Simulation mode</strong> · no actions execute · no CRM
          connected · no email sends · fictional deal data
        </span>
      </div>

      <header className={s.head}>
        <Link href="/" className={s.backLink}>
          ← Mallín
        </Link>
        <div className={s.headRight}>
          <span className={s.stepIndicator}>
            Step {step} of {TOTAL_STEPS}
          </span>
          <a className={s.applyLink} href={`mailto:${CONTACT_EMAIL}?subject=Mallín`}>
            Get in touch →
          </a>
        </div>
      </header>

      {/* Deal header strip — always visible. Visitors orient on
          "what deal am I looking at" regardless of which step. */}
      <section className={s.dealStrip}>
        <div className={s.dealStripLeft}>
          <div className={s.dealName}>{deal.name}</div>
          <div className={s.dealMeta}>
            {deal.accountIndustry}
          </div>
        </div>
        <div className={s.dealStripRight}>
          <div className={s.dealStat}>
            <div className={s.dealStatLabel}>ARR</div>
            <div className={s.dealStatValue}>${(deal.arr / 1000).toFixed(0)}K</div>
          </div>
          <div className={s.dealStat}>
            <div className={s.dealStatLabel}>CRM stage</div>
            <div className={s.dealStatValue}>{deal.crmStageLabel}</div>
          </div>
          <div className={`${s.dealStat} ${s.dealStatMallin}`}>
            <div className={s.dealStatLabel}>Mallín reads</div>
            <div className={s.dealStatValue}>{deal.mallinStageRead.label}</div>
          </div>
        </div>
      </section>

      <main className={s.main}>
        {step === 1 && <Step1RiskAppears />}
        {step === 2 && <Step2SeeWhy />}
        {step === 3 && <Step3SuggestNextMoves />}
        {step === 4 && (
          <Step4GovernAction
            approvedActions={approvedActions}
            onApprove={(id) =>
              setApprovedActions((prev) => new Set([...prev, id]))
            }
          />
        )}
        {step === 5 && <Step5ClosingCTA />}
      </main>

      <footer className={s.footer}>
        <button
          type="button"
          className={s.navBtn}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          ← Previous
        </button>
        <div className={s.dotRow}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`${s.dot} ${i + 1 === step ? s.dotActive : ""}`}
              onClick={() => setStep(i + 1)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            className={`${s.navBtn} ${s.navBtnPrimary}`}
            onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
          >
            {step === 1
              ? "See why →"
              : step === 2
              ? "See what to do →"
              : step === 3
              ? "Govern the action →"
              : "Wrap up →"}
          </button>
        ) : (
          <a
            className={`${s.navBtn} ${s.navBtnPrimary}`}
            href={`mailto:${CONTACT_EMAIL}?subject=Mallín`}
          >
            Get in touch →
          </a>
        )}
      </footer>
    </div>
  );
}

/* ─── Step 1: A deal just changed ────────────────────────────────────── */

function Step1RiskAppears() {
  const primaryRisk = HOOLI_HOLDINGS.risks[0]; // champion thinning — the central pattern

  return (
    <section className={s.step}>
      <div className={s.stepHead}>
        <span className={s.stepEyebrow}>Step 1 · A deal just changed</span>
        <h2 className={s.stepTitle}>Mallín fired three risks after today&apos;s call.</h2>
        <p className={s.stepOrientation}>
          Mallín watched the call you just finished. It noticed champion
          commitment weakening after procurement entered the thread, the
          economic buyer drifting (Linda Park, 1 of 5 calls), and a
          competitor anchoring the commercial frame. This is the kind of
          shift that doesn&apos;t show up in a stage report.
        </p>
      </div>

      <div className={s.riskCardPrimary}>
        <div className={s.riskCardHead}>
          <span className={`${s.severityPill} ${s.severityHigh}`}>{primaryRisk.severity.toUpperCase()}</span>
          <span className={s.riskCardTitle}>{primaryRisk.title}</span>
        </div>
        <p className={s.riskCardHeadline}>{primaryRisk.headline}</p>
        <div className={s.riskCardEvidencePreview}>
          <span className={s.riskCardEvidenceLabel}>Evidence preview</span>
          <blockquote className={s.riskQuote}>
            &ldquo;{primaryRisk.evidence[1].quote}&rdquo;
            <cite>— Marcus Hale, call 5</cite>
          </blockquote>
        </div>
      </div>

      <div className={s.riskCardSecondaryRow}>
        {HOOLI_HOLDINGS.risks.slice(1).map((risk) => (
          <div key={risk.id} className={s.riskCardSecondary}>
            <div className={s.riskCardHead}>
              <span
                className={`${s.severityPill} ${
                  risk.severity === "high" ? s.severityHigh : s.severityMed
                }`}
              >
                {risk.severity.toUpperCase()}
              </span>
              <span className={s.riskCardTitle}>{risk.title}</span>
            </div>
            <p className={s.riskCardHeadlineSmall}>{risk.headline}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Step 2: See why ─────────────────────────────────────────────────── */

function Step2SeeWhy() {
  const chain = HOOLI_HOLDINGS.causalChain;
  const primaryRisk = HOOLI_HOLDINGS.risks[0];

  return (
    <section className={s.step}>
      <div className={s.stepHead}>
        <span className={s.stepEyebrow}>Step 2 · See why</span>
        <h2 className={s.stepTitle}>Every Mallín claim traces back to a specific call moment.</h2>
        <p className={s.stepOrientation}>
          You&apos;re not getting a vibe-based alert. Mallín connected the
          three risks into one cascade — Linda goes quiet, Marcus starts
          speaking for her, procurement reframes the conversation, the rep
          ends up reacting. Read the chain and the underlying quotes.
        </p>
      </div>

      <div className={s.chainBlock}>
        <div className={s.chainHead}>
          <span className={s.chainEyebrow}>How Mallín connected the three risks</span>
        </div>
        <ol className={s.chainList}>
          {chain.steps.map((step, i) => (
            <li key={i} className={s.chainItem}>
              <div className={s.chainItemHead}>
                <span className={s.chainItemNum}>{String(i + 1).padStart(2, "0")}</span>
                <span className={s.chainItemActor}>{step.actor}</span>
                <span className={s.chainItemCall}>{step.callId.replace("call_", "Call ")}</span>
              </div>
              <p className={s.chainItemMove}>{step.move}</p>
              <p className={s.chainItemConsequence}>
                <span className={s.chainItemConsequenceLabel}>→</span> {step.consequence}
              </p>
            </li>
          ))}
        </ol>
        <p className={s.chainSummary}>{chain.summary}</p>
      </div>

      <details className={s.askBar}>
        <summary className={s.askBarSummary}>
          <span className={s.askBarIcon}>?</span>
          <span>
            <strong>AskBar</strong> — &ldquo;Why is Mallín flagging Marcus
            specifically?&rdquo;
          </span>
        </summary>
        <div className={s.askBarBody}>
          <p className={s.askBarPara}>
            Mallín is flagging Marcus on three observable behaviors across
            calls 4 and 5:
          </p>
          <ul className={s.askBarEvidenceList}>
            {primaryRisk.evidence.map((e, i) => (
              <li key={i}>
                <blockquote className={s.askBarQuote}>
                  &ldquo;{e.quote}&rdquo;
                  <cite>— {e.callId.replace("call_", "Call ")}</cite>
                </blockquote>
                <p className={s.askBarObs}>{e.observation}</p>
              </li>
            ))}
          </ul>
          <div className={s.askBarPattern}>
            <span className={s.askBarPatternLabel}>Pattern</span>
            <p>{primaryRisk.patternNote}</p>
          </div>
        </div>
      </details>
    </section>
  );
}

/* ─── Step 3: Mallín suggests next moves ─────────────────────────────── */

function Step3SuggestNextMoves() {
  const updates = HOOLI_HOLDINGS.suggestedUpdates;
  const email = HOOLI_HOLDINGS.emailDraft;
  const dm = HOOLI_HOLDINGS.managerDm;

  return (
    <section className={s.step}>
      <div className={s.stepHead}>
        <span className={s.stepEyebrow}>Step 3 · Mallín suggests next moves</span>
        <h2 className={s.stepTitle}>The execution agent already drafted what you would&apos;ve spent an hour writing.</h2>
        <p className={s.stepOrientation}>
          None of this sends without your click. The CRM updates use Stage
          1 Suggest (Looks right / Queue / Why?). The email is drafted in
          your sent-folder voice. The manager DM is compact — deal name,
          severity, two named gaps, one recommended next move.
        </p>
      </div>

      <div className={s.suggestGrid}>
        {/* Email draft — the Cursor moment */}
        <div className={s.suggestCol}>
          <div className={s.suggestColHead}>
            <span className={s.suggestColLabel}>Email draft</span>
            <span className={s.suggestColTag}>execution agent</span>
          </div>
          <div className={s.emailDraft}>
            <div className={s.emailHeader}>
              <div className={s.emailHeaderRow}>
                <span className={s.emailHeaderLabel}>To</span>
                <span>{email.to}</span>
              </div>
              <div className={s.emailHeaderRow}>
                <span className={s.emailHeaderLabel}>Subject</span>
                <span>{email.subject}</span>
              </div>
            </div>
            <pre className={s.emailBody}>{email.body}</pre>
            <div className={s.voiceNote}>
              <span className={s.voiceNoteLabel}>Voice match</span>
              <p>{email.voiceNote}</p>
            </div>
          </div>
        </div>

        {/* Right column: CRM updates + manager DM */}
        <div className={s.suggestCol}>
          {/* Stage 1 Suggest cards */}
          <div className={s.suggestColHead}>
            <span className={s.suggestColLabel}>CRM updates (Stage 1 Suggest)</span>
            <span className={s.suggestColTag}>qualification agent</span>
          </div>
          <div className={s.suggestUpdates}>
            {updates.map((u) => (
              <div key={u.id} className={s.suggestCard}>
                <div className={s.suggestCardHead}>
                  <span className={s.suggestCardField}>{u.field}</span>
                </div>
                <div className={s.suggestCardChange}>
                  <span className={s.suggestCardFrom}>{u.fromValue}</span>
                  <span className={s.suggestCardArrow}>→</span>
                  <span className={s.suggestCardTo}>{u.toValue}</span>
                </div>
                <p className={s.suggestCardRationale}>{u.rationale}</p>
              </div>
            ))}
          </div>

          {/* Manager DM — compact 5-line format */}
          <div className={`${s.suggestColHead} ${s.suggestColHeadSpaced}`}>
            <span className={s.suggestColLabel}>Manager Slack DM</span>
            <span className={s.suggestColTag}>orchestration agent</span>
          </div>
          <div className={s.managerDm}>
            <div className={s.managerDmChannel}>{dm.channel}</div>
            <div className={s.managerDmLines}>
              <div className={s.managerDmLine}>
                <span className={s.managerDmLabel}>Deal</span>
                <span>{dm.lines.deal}</span>
              </div>
              <div className={s.managerDmLine}>
                <span className={s.managerDmLabel}>Severity</span>
                <span>{dm.lines.severity}</span>
              </div>
              <div className={s.managerDmLine}>
                <span className={s.managerDmLabel}>Gaps</span>
                <ul className={s.managerDmGapList}>
                  {dm.lines.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
              <div className={s.managerDmLine}>
                <span className={s.managerDmLabel}>Next move</span>
                <span>{dm.lines.nextMove}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Step 4: Govern the action ──────────────────────────────────────── */

function Step4GovernAction({
  approvedActions,
  onApprove,
}: {
  approvedActions: Set<string>;
  onApprove: (id: string) => void;
}) {
  const queue = HOOLI_HOLDINGS.actionQueue;

  return (
    <section className={s.step}>
      <div className={s.stepHead}>
        <span className={s.stepEyebrow}>Step 4 · Govern the action</span>
        <h2 className={s.stepTitle}>Every action carries provenance, an executor, and an approver.</h2>
        <p className={s.stepOrientation}>
          The action queue is where every Mallín-proposed action waits for
          you. Approve, dismiss, or defer — Stage 1 Suggest never writes
          anything until you click. After approval, the audit ledger
          records who proposed it, who approved it, and the external
          object it touched.
        </p>
      </div>

      <div className={s.queueList}>
        {queue.map((item) => {
          const approved = approvedActions.has(item.id);
          return (
            <div
              key={item.id}
              className={`${s.queueItem} ${approved ? s.queueItemApproved : ""}`}
            >
              <div className={s.queueItemHead}>
                <span className={s.queueItemType}>{queueTypeLabel(item.type)}</span>
                <span className={s.queueItemTitle}>{item.title}</span>
                {approved && (
                  <span className={s.queueItemApprovedTag}>✓ Approved (simulated)</span>
                )}
              </div>
              <p className={s.queueItemPreview}>{item.preview}</p>
              {approved ? (
                <div className={s.ledgerEntry}>
                  <div className={s.ledgerEntryHead}>
                    <span className={s.ledgerEntryLabel}>Audit ledger entry</span>
                  </div>
                  <dl className={s.ledgerList}>
                    <dt>Action ID</dt>
                    <dd>{item.ledgerPreview.actionId}</dd>
                    <dt>Provider</dt>
                    <dd>{item.ledgerPreview.provider}</dd>
                    <dt>External object</dt>
                    <dd>{item.ledgerPreview.externalObject}</dd>
                    <dt>Proposed by</dt>
                    <dd>{item.ledgerPreview.proposedBy}</dd>
                    <dt>Approved by</dt>
                    <dd>you · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd>
                    <dt>Status</dt>
                    <dd>
                      <span className={s.ledgerStatusSim}>
                        EXECUTED (simulation) · would have written to{" "}
                        {item.ledgerPreview.provider}
                      </span>
                    </dd>
                  </dl>
                </div>
              ) : (
                <div className={s.queueItemActions}>
                  <button
                    type="button"
                    className={s.queueApproveBtn}
                    onClick={() => onApprove(item.id)}
                  >
                    Approve
                  </button>
                  <button type="button" className={s.queueSecondaryBtn} disabled>
                    Dismiss
                  </button>
                  <button type="button" className={s.queueSecondaryBtn} disabled>
                    Defer
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {approvedActions.size > 0 && (
        <p className={s.queueFootNote}>
          {approvedActions.size === queue.length
            ? "All three actions logged. In a real deal this is the moment the manager pings you back, the email lands in your drafts, and the CRM reflects the new champion-decay state — without a status meeting."
            : "Try approving the rest. Each one writes its own audit-ledger entry with full provenance."}
        </p>
      )}
    </section>
  );
}

function queueTypeLabel(type: string): string {
  if (type === "send_email") return "EMAIL";
  if (type === "post_slack_dm") return "SLACK DM";
  if (type === "crm_field_update_bundle") return "CRM UPDATE";
  return type.toUpperCase();
}

/* ─── Step 5: Closing CTA ────────────────────────────────────────────── */

function Step5ClosingCTA() {
  return (
    <section className={s.step}>
      <div className={s.stepHead}>
        <span className={s.stepEyebrow}>Step 5 · This is how your pipeline would work</span>
        <h2 className={s.stepTitle}>Every deal gets the same five-call shape Mallín just walked through.</h2>
        <p className={s.stepOrientation}>
          Hooli Holdings was a fictional walkthrough on a real operational
          pattern. On your pipeline, the substrate comes from your Gong
          library, your CRM, your inbox. The cockpit, the alerts, the
          drafts, the audit ledger — all the same. Provenance on every
          write. Manager looped in when severity warrants. Nothing sends
          without your click.
        </p>
      </div>

      <div className={s.closingGrid}>
        <ClosingPoint
          label="Risks surface before the call you&apos;re going to lose them on"
          body="Mallín watches every call, every CRM update, every thread. When the cascade starts — EB drifts, champion thins, procurement enters — the alert fires while you can still intervene."
        />
        <ClosingPoint
          label="Drafts arrive in your voice, not generic"
          body="The execution agent is conditioned on your sent folder. Concise greetings, your exact two-reason cadence, signature with first name only — it reads as you, because it learned from you."
        />
        <ClosingPoint
          label="Manager looped in by the system, not by a status meeting"
          body="The compact DM (deal · severity · gaps · next move) lands in the deal thread the moment two HIGH risks compound. The accountability happens at speed, not at cadence."
        />
        <ClosingPoint
          label="Every action that touches a CRM or your inbox carries provenance"
          body="Who proposed it. Who approved it. The external object ID. The exact field changes. The audit ledger isn't a compliance afterthought — it's how trust gets earned and kept."
        />
      </div>

      <div className={s.applyBlock}>
        <h3 className={s.applyHeadline}>Run Mallín on your last quarter.</h3>
        <p className={s.applyBody}>
          We connect to your Gong library and CRM, run the intelligence
          agent across your account list, and within 24 hours present
          a knowledge base built from eighteen months of your own sales
          activity.
        </p>
        <a
          className={s.applyCta}
          href={`mailto:${CONTACT_EMAIL}?subject=Mallín`}
        >
          Get in touch →
        </a>
      </div>
    </section>
  );
}

function ClosingPoint({ label, body }: { label: string; body: string }) {
  return (
    <div className={s.closingPoint}>
      <div
        className={s.closingPointLabel}
        dangerouslySetInnerHTML={{ __html: label }}
      />
      <p className={s.closingPointBody}>{body}</p>
    </div>
  );
}
