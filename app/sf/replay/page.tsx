/**
 * /sf/replay — call-by-call agentic timeline
 *
 * For a deal where every call has been processed through the
 * extractor, render a top-to-bottom story:
 *
 *   - Header: deal + outcome
 *   - For each call: the AI's read on the LEFT, what landed in SF on the RIGHT
 *   - Final card: the resulting SF state
 *
 * Reads from the cached extractor output (the cached extractor
 * output) and joins to sf_writes_audit by correlation_id.
 *
 * This is the demo surface for "system reads call → updates SF →
 * audit trail" — a non-technical viewer should be able to scroll
 * top to bottom and watch the deal become winnable.
 */

import { notFound } from "next/navigation";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import { supabaseAdmin } from "@/lib/db/client";
import ApplySuggestion from "./ApplySuggestion";
import {
  detectAllEscalations,
  emptyBehavioralSignals,
  flattenEscalations,
  renderNextCallAsks,
  type EscalationAlert,
  type BehavioralSignals,
} from "@/lib/sf-diff/methodology-escalation";
import {
  recallMomentForCall,
  type MatchContext,
} from "@/lib/sf-diff/recall";
import styles from "./replay.module.css";

export const dynamic = "force-dynamic";

type ExtractionField = {
  sf_field: string;
  proposed_value: string;
  tier_hint: "auto" | "suggest" | "readonly";
  confidence: "high" | "medium" | "low";
  evidence: string;
};

type ExtractionRisk = { line: string; confidence: string };

type CachedCall = {
  call_index: number;
  call_id: string;
  call_title: string;
  call_date: string;
  call_duration_min: number;
  call_summary?: string;
  extraction: {
    the_read: string;
    fields: ExtractionField[];
    risks: ExtractionRisk[];
    next_step: string | null;
  };
  sf_state_after: Record<string, string>;
  behavioral_signals?: BehavioralSignals;
};

type Cache = {
  generated_at: string;
  dealId: string;
  sfOppId: string;
  deal_name: string;
  account_name: string;
  outcome?: "won" | "lost" | "open";
  outcome_label?: string;
  amount?: number | null;
  close_date?: string | null;
  total_calls: number;
  calls: CachedCall[];
};

type AuditRow = {
  id: string;
  call_source: string | null;
  status: string;
  succeeded_field_count: number;
  attempted_field_count: number;
  body: Record<string, unknown>;
  field_outcomes: Array<{ field: string; status: string; error?: string }>;
  sf_response_status: number | null;
  created_at: string;
};

/** Pull the first proper-noun name from a free-text field — handles
 *  "John Franceski (CAO)" → "John", "Greg, signer" → "Greg".
 *  Falls back to null for unhelpful inputs. */
function extractFirstName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(/[A-Z][a-z]+/);
  return m ? m[0] : null;
}

function loadCache(slug: string): Cache | null {
  // Whitelist allowed slugs to avoid path traversal.
  if (!/^[a-z0-9_-]+$/.test(slug)) return null;
  try {
    const raw = readFileSync(
      resolve(process.cwd(), `scripts/${slug}/extractions.json`),
      "utf8",
    );
    return JSON.parse(raw) as Cache;
  } catch {
    return null;
  }
}

async function loadAuditByCallSource(
  dealId: string,
): Promise<Record<string, AuditRow>> {
  // Index audit rows by call_source for O(1) lookup per call card.
  const { data } = await supabaseAdmin
    .from("sf_writes_audit")
    .select(
      "id, call_source, status, succeeded_field_count, attempted_field_count, body, field_outcomes, sf_response_status, created_at",
    )
    .eq("opportunity_id", dealId)
    .eq("dry_run", false)
    .order("created_at", { ascending: false });
  const byCallSource: Record<string, AuditRow> = {};
  for (const row of (data ?? []) as AuditRow[]) {
    if (row.call_source && !byCallSource[row.call_source]) {
      // Most-recent wins (per call_source); ascending order would invert.
      byCallSource[row.call_source] = row;
    }
  }
  return byCallSource;
}

export default async function SfReplayPage({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string; slug?: string }>;
}) {
  if (!checkSfDebugAccess().allowed) notFound();

  const sp = await searchParams;
  const slug = (sp.slug ?? "demo").trim();
  const cache = loadCache(slug);
  if (!cache) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.dealHead}>
            <h1>Replay cache not found for slug: {slug}</h1>
            <p className={styles.meta}>
              Run{" "}
              <code>
                REPLAY_SLUG={slug} node scripts/precompute_extractions.mjs
              </code>{" "}
              first.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const auditByCallSource = await loadAuditByCallSource(cache.dealId);

  // Compute methodology escalations from the cumulative SF state at
  // each checkpoint, plus the per-call behavioral signals (which the
  // verification framework needs to check things like "did the rep
  // ASK who signs?" and "did the champion commit to bringing them in?").
  const escalationsByCall = detectAllEscalations(
    cache.calls.map((c) => c.sf_state_after as Record<string, string | null>),
    cache.calls.map((c) => c.behavioral_signals ?? emptyBehavioralSignals()),
    cache.deal_name,
  );
  const allEscalations = flattenEscalations(escalationsByCall);
  const managerEscalations = allEscalations.filter(
    (e) => e.severity === "escalate_to_manager",
  );

  // Pre-compute recall matches for the full timeline so we can dedupe.
  // A moment fires AT MOST ONCE per replay — first match wins, later
  // matches of the same moment id are suppressed (silence > noise).
  const recallByCall = new Map<number, ReturnType<typeof recallMomentForCall>>();
  const seenMomentIds = new Set<string>();
  for (const c of cache.calls) {
    const fields: Record<string, string> = {};
    for (const f of c.extraction.fields) {
      fields[f.sf_field] = String(f.proposed_value ?? "");
    }
    const ctx: MatchContext = {
      call_index: c.call_index,
      total_calls_so_far: c.call_index,
      extracted_fields: fields,
      cumulative_state:
        (c.sf_state_after as Record<string, string | null>) ?? {},
      call_summary: c.call_summary ?? "",
      behavioral: c.behavioral_signals ?? emptyBehavioralSignals(),
      the_read: c.extraction.the_read,
      current_deal: cache.deal_name,
    };
    const m = recallMomentForCall(ctx);
    if (m && !seenMomentIds.has(m.id)) {
      seenMomentIds.add(m.id);
      recallByCall.set(c.call_index, m);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.banner}>
        <span>
          <b>Replay.</b> Watch the AI read each call, update Salesforce, and
          audit every write — call by call, top to bottom.
        </span>
      </div>

      <div className={styles.shell}>
        <div className={styles.dealHead}>
          <div className={styles.label}>Opportunity</div>
          <h1>{cache.deal_name}</h1>
          <div className={styles.meta}>
            <b>{cache.account_name}</b> · {cache.total_calls} calls processed
            · SF opp <code>{cache.sfOppId}</code>
            {cache.outcome ? (
              <span
                className={`${styles.outcomeBadge} ${
                  cache.outcome === "won"
                    ? styles.won
                    : cache.outcome === "lost"
                    ? styles.lost
                    : ""
                }`}
                style={{ marginLeft: 12 }}
              >
                {cache.outcome_label ?? cache.outcome}
              </span>
            ) : null}
          </div>
        </div>

        {/* Deal-level escalation summary (manager view) */}
        {managerEscalations.length > 0 ? (
          <div className={styles.escalationSummary}>
            <h3>Manager escalations on this deal</h3>
            <div className={styles.sub}>
              The system flagged these {managerEscalations.length === 1 ? "gap" : "gaps"} during the deal — each one
              would have triggered a manager-level alert in real time.
            </div>
            <div className={styles.escalationList}>
              {allEscalations.map((e: EscalationAlert, i) => (
                <div
                  key={i}
                  className={`${styles.escalationRow} ${
                    e.severity === "escalate_to_manager"
                      ? styles.escalate
                      : styles.warn
                  }`}
                >
                  <div className={styles.when}>
                    {e.severity === "escalate_to_manager"
                      ? "Manager · "
                      : "Rep · "}
                    Call {e.triggered_at_call}
                  </div>
                  <div className={styles.msg}>
                    <div className={styles.msgRep}>
                      <b>{e.rule_label}.</b> {e.rep_message}
                    </div>
                    {e.manager_message ? (
                      <div className={styles.msgManager}>
                        Manager: {e.manager_message}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {cache.calls.map((call) => {
          const callSource = `demo_call_${call.call_index}_${call.call_date.slice(0, 10)}`;
          const audit = auditByCallSource[callSource];
          const auto = call.extraction.fields.filter(
            (f) => f.tier_hint === "auto",
          );
          const suggest = call.extraction.fields.filter(
            (f) => f.tier_hint === "suggest",
          );
          const readonly = call.extraction.fields.filter(
            (f) => f.tier_hint === "readonly",
          );

          const alertsThisCall = escalationsByCall.get(call.call_index) ?? [];

          // Recall: pre-deduped — fires AT MOST ONCE per replay.
          const recall = recallByCall.get(call.call_index) ?? null;

          // Tie-back: convert this call's alerts into explicit asks
          // for the NEXT call. Pull champion/signer names from the
          // current SF state for placeholder rendering.
          const championName =
            (call.sf_state_after as Record<string, string>)
              .Who_is_the_Champion__c ?? null;
          const signerName =
            (call.sf_state_after as Record<string, string>)
              .Who_is_the_Economic_Buyer__c ??
            (call.sf_state_after as Record<string, string>)
              .X15_Who_signs__c ??
            null;
          const nextCallAsks = renderNextCallAsks(alertsThisCall, {
            champion_name: extractFirstName(championName),
            signer_name: extractFirstName(signerName),
            deal_name: cache.deal_name,
          });

          return (
            <div key={call.call_index} className={styles.callCard}>
              <div className={styles.callHeader}>
                <span className={styles.callIndex}>
                  Call {call.call_index} of {cache.total_calls}
                </span>
                <span className={styles.callTitle}>{call.call_title}</span>
                <span className={styles.callMeta}>
                  {call.call_date.slice(0, 10)} · {call.call_duration_min} min
                </span>
              </div>
              {alertsThisCall.map((a, i) => (
                <div
                  key={i}
                  className={`${styles.callAlert} ${
                    a.severity === "escalate_to_manager"
                      ? styles.escalate
                      : styles.warn
                  }`}
                >
                  <span className={styles.badge}>
                    {a.severity === "escalate_to_manager"
                      ? "Manager alert"
                      : "Rep alert"}
                  </span>
                  <div className={styles.body}>
                    <div className={styles.ruleLabel}>{a.rule_label}</div>
                    <div className={styles.reps}>{a.rep_message}</div>
                    {a.manager_message ? (
                      <div className={styles.mgr}>
                        Manager: {a.manager_message}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              <div className={styles.callBody}>
                {/* LEFT: what the AI read */}
                <div className={styles.left}>
                  <div className={styles.sectionLabel}>The read</div>
                  <div className={styles.theRead}>
                    {call.extraction.the_read}
                  </div>

                  {/* Recall — surfaced quietly, no label, just story.
                      Max 1 per call. */}
                  {recall ? (
                    <div className={styles.recall}>
                      <div className={styles.recallAnchor}>
                        This looks like {recall.source_deal} (Call{" "}
                        {recall.source_call_index})
                      </div>
                      <div className={styles.recallSituation}>
                        {recall.situation}
                      </div>
                      <div className={styles.recallMove}>
                        {recall.rep_move}
                      </div>
                      <div
                        className={`${styles.recallOutcome} ${
                          recall.outcome === "won"
                            ? styles.won
                            : recall.outcome === "lost"
                            ? styles.lost
                            : ""
                        }`}
                      >
                        {recall.what_happened}
                      </div>
                      <div className={styles.recallLesson}>
                        {recall.lesson}
                      </div>
                    </div>
                  ) : null}

                  {call.extraction.risks.length > 0 ? (
                    <div className={styles.risks}>
                      <div className={styles.sectionLabel}>What's at risk</div>
                      <ul>
                        {call.extraction.risks.map((r, i) => (
                          <li key={i}>{r.line}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {suggest.length > 0 ? (
                    <div className={styles.suggestQueue}>
                      <div className={styles.sectionLabel}>
                        For rep approval ({suggest.length})
                      </div>
                      {suggest.map((f) => {
                        const callSource = `${slug}_call_${call.call_index}_${call.call_date.slice(0, 10)}`;
                        return (
                          <div key={f.sf_field} className={styles.suggestItem}>
                            <div className={styles.field}>{f.sf_field}</div>
                            <div className={styles.value}>{f.proposed_value}</div>
                            {f.evidence ? (
                              <div className={styles.evidence}>· {f.evidence}</div>
                            ) : null}
                            <div style={{ marginTop: 8 }}>
                              <ApplySuggestion
                                dealId={cache.dealId}
                                sfOppId={cache.sfOppId}
                                field={f.sf_field}
                                value={f.proposed_value}
                                callSource={callSource}
                                evidence={f.evidence}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {/* RIGHT: what actually landed in SF */}
                <div className={styles.right}>
                  <div className={styles.sectionLabel}>
                    Auto-applied to Salesforce
                  </div>
                  {auto.length === 0 && !call.extraction.next_step ? (
                    <div className={styles.empty}>
                      Nothing auto-applied — call surfaced suggestions only.
                    </div>
                  ) : (
                    <div className={styles.appliedBlock}>
                      {call.extraction.next_step ? (
                        <div className={styles.appliedItem}>
                          <div className={styles.field}>NextStep</div>
                          <div className={styles.value}>
                            {call.extraction.next_step}
                          </div>
                        </div>
                      ) : null}
                      {auto
                        .filter((f) => f.sf_field !== "NextStep")
                        .map((f) => (
                          <div
                            key={f.sf_field}
                            className={styles.appliedItem}
                          >
                            <div className={styles.field}>{f.sf_field}</div>
                            <div className={styles.value}>
                              {f.proposed_value}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {readonly.length > 0 ? (
                    <>
                      <div className={styles.sectionLabel}>
                        Surfaced — never written
                      </div>
                      <div
                        className={styles.empty}
                        style={{ marginBottom: 12 }}
                      >
                        {readonly.map((f) => f.sf_field).join(", ")} —
                        forecast-impacting, rep edits in Salesforce.
                      </div>
                    </>
                  ) : null}

                  {audit ? (
                    <div className={styles.auditLine}>
                      <span className={styles.ok}>● Audit row</span>{" "}
                      {audit.id.slice(0, 8)}… · status={audit.status} ·
                      succeeded={audit.succeeded_field_count}/
                      {audit.attempted_field_count} · sf_response={" "}
                      {audit.sf_response_status ?? "—"}
                    </div>
                  ) : (
                    <div className={styles.auditLine}>
                      <span style={{ color: "#b3261e" }}>● No audit row</span>
                      {" "}
                      for this call (write may not have run yet).
                    </div>
                  )}
                </div>
              </div>

              {/* Tie-back to execution agent: explicit asks for the
                  NEXT call when this call surfaced verification gaps. */}
              {nextCallAsks.length > 0 ? (
                <div className={styles.nextCallAsks}>
                  <div className={styles.sectionLabel}>
                    Going into the next call — ask these
                  </div>
                  {nextCallAsks.map((a) => (
                    <div key={a.source_rule_id} className={styles.askItem}>
                      <div className={styles.step}>{a.missing_step}</div>
                      <div className={styles.who}>
                        Ask <b>{a.who}</b>:
                      </div>
                      <div className={styles.question}>"{a.question}"</div>
                      <div className={styles.why}>
                        <b>Why:</b> {a.why}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Final state card */}
        {cache.calls.length > 0 ? (
          <div className={styles.finalCard}>
            <h2>Where the deal landed</h2>
            <div className={styles.sub}>
              {cache.outcome_label ?? "Outcome unknown"}. Cumulative SF state
              after the AI processed all {cache.total_calls} calls:
            </div>
            <div className={styles.finalState}>
              {Object.entries(
                cache.calls[cache.calls.length - 1].sf_state_after,
              )
                .filter(([, v]) => v !== null && v !== "")
                .map(([k, v]) => (
                  <div key={k} className={styles.finalField}>
                    <div className={styles.label}>{k}</div>
                    <div className={styles.value}>{String(v)}</div>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
