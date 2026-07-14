/**
 * Cockpit mockup — static, no backend calls. Lives at /cockpit-mock for
 * design preview only. Will be deleted (or rewritten as the real
 * unified cockpit) after the design is locked.
 *
 * Shows what the per-deal cockpit looks like with all five surfaces:
 *   1. Header — deal at a glance
 *   2. Action bar — quick-jump to each surface
 *   3. Alerts panel — active escalations
 *   4. Email composer — Mallín-drafted follow-up
 *   5. CRM updates panel — Stage 1 Suggest cards
 *   6. Slack activity — what Mallín posted on the rep's behalf
 *   7. Insights summary — substrate signals at a glance
 *
 * Static data only. The real implementation pulls from substrate.
 */
import s from "./mock.module.css";

export const dynamic = "force-static";

export default function CockpitMock() {
  return (
    <div className={s.page}>
      {/* ─── Sticky header — deal at a glance ─── */}
      <header className={s.header}>
        <div className={s.headerLeft}>
          <a href="/" className={s.back} aria-label="Back to deals">
            ←
          </a>
          <div>
            <h1 className={s.dealName}>Acme Corp</h1>
            <div className={s.dealMeta}>
              $450K · Stage 4: Evaluation · Close June 28 · 6 calls
            </div>
          </div>
        </div>
        <div className={s.headerRight}>
          <span className={s.severityChip} data-sev="warn">
            ⚠ 2 active alerts
          </span>
        </div>
      </header>

      {/* ─── Action bar — anchor jumps + primary actions ─── */}
      <nav className={s.actionBar} aria-label="Cockpit actions">
        <a href="#alerts" className={s.actionChip}>
          <span className={s.actionEmoji}>🚨</span> Alerts
          <span className={s.actionCount}>2</span>
        </a>
        <a href="#email" className={s.actionChip}>
          <span className={s.actionEmoji}>📧</span> Draft email
        </a>
        <a href="#crm" className={s.actionChip}>
          <span className={s.actionEmoji}>📝</span> CRM updates
          <span className={s.actionCount}>3</span>
        </a>
        <a href="#risks" className={s.actionChip}>
          <span className={s.actionEmoji}>⚠️</span> Risks
          <span className={s.actionCount}>2</span>
        </a>
        <a href="#slack" className={s.actionChip}>
          <span className={s.actionEmoji}>💬</span> Slack
        </a>
        <a href="#insights" className={s.actionChip}>
          <span className={s.actionEmoji}>💡</span> Insights
        </a>
        <button className={s.actionAsk}>
          Ask Mallín →
        </button>
      </nav>

      <main className={s.main}>
        {/* ─── ALERTS ─── */}
        <section id="alerts" className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Active alerts</h2>
            <span className={s.sectionMeta}>Sorted by severity · fired in last 24h</span>
          </div>

          <article className={`${s.alertCard} ${s.alertHigh}`}>
            <div className={s.alertCardHeader}>
              <span className={s.alertSev} data-sev="high">HIGH</span>
              <span className={s.alertRule}>Champion-commitment warning</span>
              <span className={s.alertWhen}>14 min ago</span>
            </div>
            <p className={s.alertBody}>
              Marcus hasn&apos;t asked a question in two consecutive calls.
              The signer&apos;s pattern is inconsistent with stage 4.
            </p>
            <div className={s.alertAction}>
              <strong>Do this next:</strong> &ldquo;Before we send the
              procurement template — what would it take for you to commit
              to a signature date by July 1?&rdquo;
            </div>
            <div className={s.alertFooter}>
              <span className={s.tag}>manager DM sent</span>
              <span className={s.tag}>posted to #acme-deal</span>
              <a className={s.alertLink} href="#">View thread →</a>
            </div>
          </article>

          <article className={`${s.alertCard} ${s.alertWarn}`}>
            <div className={s.alertCardHeader}>
              <span className={s.alertSev} data-sev="warn">WARN</span>
              <span className={s.alertRule}>Power-map gap</span>
              <span className={s.alertWhen}>1h ago</span>
            </div>
            <p className={s.alertBody}>
              Champion has never introduced anyone above their direct
              manager. CFO not yet engaged with two weeks until close.
            </p>
            <div className={s.alertAction}>
              <strong>Do this next:</strong> &ldquo;Marcus, who else on
              your team needs to feel confident in this before we sign?&rdquo;
            </div>
            <div className={s.alertFooter}>
              <span className={s.tag}>posted to #acme-deal</span>
              <a className={s.alertLink} href="#">View thread →</a>
            </div>
          </article>
        </section>

        {/* ─── EMAIL COMPOSER ─── */}
        <section id="email" className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Suggested email</h2>
            <span className={s.sectionMeta}>
              Voice-matched to your 47 sent threads · Gmail
            </span>
          </div>

          <article className={s.composer}>
            <div className={s.composerField}>
              <label className={s.composerLabel}>To</label>
              <div className={s.composerValue}>
                marcus.chen@acme.com
                <span className={s.composerTag}>Champion</span>
              </div>
            </div>
            <div className={s.composerField}>
              <label className={s.composerLabel}>Subject</label>
              <div className={s.composerValue}>
                Re: Platform evaluation — confirming next steps
              </div>
            </div>
            <div className={s.composerField}>
              <label className={s.composerLabel}>Body</label>
              <div className={s.composerBody}>
                <p>Marcus,</p>
                <p>
                  Following up from yesterday&apos;s call. Two things to
                  align on before the procurement template goes out:
                </p>
                <p>
                  1. Signature path — who needs to feel confident in this
                  before we sign? Happy to put a 30-min session on the
                  books for your CFO if that helps.
                </p>
                <p>
                  2. Implementation timeline — we talked about a Q3 cutover.
                  I want to make sure your team has what they need to
                  green-light the cutover plan. Sending the implementation
                  doc with this email.
                </p>
                <p>
                  Free Thursday 2pm or Friday 10am for a 20-min check-in?
                </p>
                <p>— Jordan</p>
              </div>
            </div>

            <div className={s.composerMeta}>
              <span className={s.draftSource}>
                Drafted from call 4 · May 9, 11:14 AM
              </span>
              <span className={s.confidenceTag}>92% voice match</span>
            </div>

            <div className={s.composerActions}>
              <button className={s.btnPrimary}>
                ✉ Send via Gmail
              </button>
              <button className={s.btnSecondary}>
                💾 Save to Drafts
              </button>
              <button className={s.btnTertiary}>
                ✏️ Edit
              </button>
              <button className={s.btnTertiary}>
                💡 Rewrite with Mallín
              </button>
              <span className={s.composerNever}>
                Mallín never sends without your click
              </span>
            </div>
          </article>
        </section>

        {/* ─── CRM UPDATES ─── */}
        <section id="crm" className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Suggested CRM updates</h2>
            <span className={s.sectionMeta}>
              Stage 1 · Suggest · 3 captured from recent calls
            </span>
          </div>

          <article className={s.suggestCard}>
            <div className={s.suggestHead}>
              <span className={s.stageTag}>STAGE 1 · SUGGEST</span>
              <span className={s.suggestCrm}>HubSpot</span>
            </div>
            <div className={s.suggestField}>
              <span className={s.suggestFieldName}>mallin_meddpicc_champion</span>
              <span className={s.arrow}>→</span>
              <span className={s.suggestNewValue}>Marcus Chen</span>
            </div>
            <p className={s.suggestCapture}>
              Captured from call 4 · &ldquo;I&apos;ll be the one bringing this
              to the buying committee. I&apos;ve already aligned with Sarah on
              finance and Mark on IT.&rdquo;
            </p>
            <div className={s.suggestActions}>
              <button className={s.btnApply}>✓ Looks right</button>
              <button className={s.btnReject}>✗ Looks wrong</button>
              <button className={s.btnEdit}>✏️ Edit</button>
              <button className={s.btnWhy}>💡 Why?</button>
            </div>
          </article>

          <article className={s.suggestCard}>
            <div className={s.suggestHead}>
              <span className={s.stageTag}>STAGE 1 · SUGGEST</span>
              <span className={s.suggestCrm}>HubSpot</span>
            </div>
            <div className={s.suggestField}>
              <span className={s.suggestFieldName}>mallin_meddpicc_competition</span>
              <span className={s.arrow}>→</span>
              <span className={s.suggestNewValue}>
                Vantage (primary) · Meridian (mentioned, not active)
              </span>
            </div>
            <p className={s.suggestCapture}>
              Captured from call 5 · Competitor named explicitly. No
              head-to-head plan exists in HubSpot.
            </p>
            <div className={s.suggestActions}>
              <button className={s.btnApply}>✓ Looks right</button>
              <button className={s.btnReject}>✗ Looks wrong</button>
              <button className={s.btnEdit}>✏️ Edit</button>
              <button className={s.btnWhy}>💡 Why?</button>
            </div>
          </article>

          <article className={s.suggestCard}>
            <div className={s.suggestHead}>
              <span className={s.stageTag}>STAGE 1 · SUGGEST</span>
              <span className={s.suggestCrm}>HubSpot</span>
            </div>
            <div className={s.suggestField}>
              <span className={s.suggestFieldName}>mallin_meddpicc_decision_process</span>
              <span className={s.arrow}>→</span>
              <span className={s.suggestNewValue}>
                CFO sign-off required · target signature July 1
              </span>
            </div>
            <p className={s.suggestCapture}>
              Captured from call 5 · &ldquo;Once procurement signs off, we
              need our CFO to bless it. She&apos;s seen the demo.&rdquo;
            </p>
            <div className={s.suggestActions}>
              <button className={s.btnApply}>✓ Looks right</button>
              <button className={s.btnReject}>✗ Looks wrong</button>
              <button className={s.btnEdit}>✏️ Edit</button>
              <button className={s.btnWhy}>💡 Why?</button>
            </div>
          </article>

          <div className={s.neverAuto}>
            <strong>NEVER AUTO-WRITTEN:</strong> Stage · Amount · Close Date · Forecast Category
          </div>
        </section>

        {/* ─── CRITICAL RISKS ─── */}
        <section id="risks" className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Critical risks</h2>
            <span className={s.sectionMeta}>From Pass 4 critical_risks · 2 active</span>
          </div>

          <article className={s.riskCard}>
            <div className={s.riskCardHeader}>
              <span className={s.riskTitle}>Champion-commitment thinning</span>
              <span className={s.riskSev} data-sev="high">HIGH</span>
            </div>
            <p className={s.riskBody}>
              Champion has not said &ldquo;we&apos;re choosing you&rdquo; despite
              being two weeks from close. Last two calls had no commitment
              language from their side.
            </p>
            <div className={s.riskMetaRow}>
              <span className={s.riskMetaLabel}>Failure</span>
              <span>Soft no at signature; competitor wins by default</span>
            </div>
            <div className={s.riskMetaRow}>
              <span className={s.riskMetaLabel}>Posture</span>
              <span>Force the head-on conversation; manager DM if not done by next call</span>
            </div>
            <div className={s.riskAskRow}>
              <button className={s.btnWhy}>💡 Explain this risk</button>
            </div>
          </article>

          <article className={s.riskCard}>
            <div className={s.riskCardHeader}>
              <span className={s.riskTitle}>Power-map gap above champion</span>
              <span className={s.riskSev} data-sev="warn">WARN</span>
            </div>
            <p className={s.riskBody}>
              Champion has never introduced anyone above their direct
              manager. CFO not yet in any deal interaction; 14 days to close.
            </p>
            <div className={s.riskMetaRow}>
              <span className={s.riskMetaLabel}>Failure</span>
              <span>CFO sees the deal cold at signature step; pushback</span>
            </div>
            <div className={s.riskMetaRow}>
              <span className={s.riskMetaLabel}>Posture</span>
              <span>Get explicit champion commitment to a CFO intro this week</span>
            </div>
            <div className={s.riskAskRow}>
              <button className={s.btnWhy}>💡 Explain this risk</button>
            </div>
          </article>
        </section>

        {/* ─── SLACK ACTIVITY ─── */}
        <section id="slack" className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Slack activity</h2>
            <span className={s.sectionMeta}>What Mallín posted on your behalf · last 7 days</span>
          </div>

          <article className={s.activityRow}>
            <div className={s.activityWhen}>14m ago</div>
            <div className={s.activityBody}>
              <span className={s.activityTarget}>Manager DM</span>
              <span className={s.activityText}>
                ⚠ HIGH · Champion-commitment warning on Acme Corp
              </span>
            </div>
            <a className={s.activityOpen} href="#">Open →</a>
          </article>

          <article className={s.activityRow}>
            <div className={s.activityWhen}>14m ago</div>
            <div className={s.activityBody}>
              <span className={s.activityTarget}>#acme-deal</span>
              <span className={s.activityText}>
                Alert posted with verbatim next-call question
              </span>
            </div>
            <a className={s.activityOpen} href="#">Open →</a>
          </article>

          <article className={s.activityRow}>
            <div className={s.activityWhen}>1h ago</div>
            <div className={s.activityBody}>
              <span className={s.activityTarget}>#acme-deal</span>
              <span className={s.activityText}>
                Power-map gap noted · 2 weeks to close
              </span>
            </div>
            <a className={s.activityOpen} href="#">Open →</a>
          </article>

          <div className={s.activityFooter}>
            <button className={s.btnSecondary}>📢 Notify manager manually</button>
            <span className={s.activityHint}>
              Toggle in Settings → Integrations to also post to Microsoft Teams
            </span>
          </div>
        </section>

        {/* ─── INSIGHTS ─── */}
        <section id="insights" className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.sectionTitle}>Insights at a glance</h2>
            <span className={s.sectionMeta}>From Pass 2 substrate · updated 2:47 PM</span>
          </div>

          <div className={s.insightsGrid}>
            <div className={s.insightCard}>
              <div className={s.insightLabel}>Decision frame</div>
              <div className={s.insightValue}>Buy vs build · resolved Apr 28</div>
              <div className={s.insightDetail}>
                Champion confirmed buy-side preference on call 2
              </div>
            </div>

            <div className={s.insightCard}>
              <div className={s.insightLabel}>Risk score</div>
              <div className={s.insightValue}>
                <span className={s.scoreNum}>62</span>/100
              </div>
              <div className={s.insightDetail}>
                Driven by champion-commitment + power-map gaps
              </div>
            </div>

            <div className={s.insightCard}>
              <div className={s.insightLabel}>Who&apos;s in the room</div>
              <div className={s.insightValue}>3 stakeholders</div>
              <div className={s.insightDetail}>
                Champion · Decision-maker (CFO) · Technical (CTO)
              </div>
            </div>

            <div className={s.insightCard}>
              <div className={s.insightLabel}>Last call</div>
              <div className={s.insightValue}>May 9 · 32 min</div>
              <div className={s.insightDetail}>
                Pricing discussion, no signature commitment
              </div>
            </div>

            <div className={s.insightCard}>
              <div className={s.insightLabel}>Competing priorities</div>
              <div className={s.insightValue}>2 known</div>
              <div className={s.insightDetail}>
                Q2 close + Salesforce migration sharing CFO attention
              </div>
            </div>

            <div className={s.insightCard}>
              <div className={s.insightLabel}>Walk-in-with</div>
              <div className={s.insightValue}>3 verbatim questions</div>
              <div className={s.insightDetail}>
                Ready for next call · scroll to Ask Mallín for more
              </div>
            </div>
          </div>
        </section>

        {/* ─── FOOTER ─── */}
        <footer className={s.footer}>
          <div className={s.footerLeft}>
            Mallín · cockpit mockup · static design preview
          </div>
          <div className={s.footerRight}>
            <a href="/settings/integrations" className={s.footerLink}>
              Integrations →
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
