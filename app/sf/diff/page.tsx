/**
 * ============================================================================
 *  /sf/diff?dealId=X&sfOppId=Y
 * ============================================================================
 *
 *  Tiny debug view for the read-only Salesforce diff. Renders the actionable
 *  diff items (write_now + suggest) front and center; collapses surface_only
 *  items into an auditable expander so forecast-impacting gaps stay visible
 *  without drawing the eye. no_op items are dropped from view entirely.
 *
 *  Strict invariants reflected in this UI:
 *    - There are NO Approve / Apply / Save buttons. This page is read-only.
 *    - readonly-tier items NEVER appear in the actionable list, regardless
 *      of their status.
 *    - The "writes_performed:false" banner is always rendered as a positive
 *      affordance — it tells the rep nothing was touched on this load.
 *
 *  Data path: this is a server component that fetches from /api/sf/diff
 *  same-host. All filtering decisions are computed server-side; the
 *  client gets pre-shaped data only.
 * ============================================================================
 */

import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import { ConfirmMatchButton, UnlinkButton } from "./LinkActions";
import styles from "./diff.module.css";

export const dynamic = "force-dynamic";

type DiffItem = {
  field_label: string;
  sf_field: string;
  tier: "auto" | "suggest" | "readonly";
  substrate_value: string | null;
  sf_value: string | null;
  status: "match" | "sf_blank" | "substrate_blank" | "differs";
  action: "write_now" | "suggest" | "surface_only" | "no_op";
  reason: string;
};

type ExistingLink = {
  sf_opp_id: string;
  sf_instance_url: string;
  confirmed_at: string;
  confirmed_by: string | null;
  notes: string | null;
  diff_url: string;
};

type MatchCandidate = {
  sf_id: string;
  sf_name: string;
  sf_account_name: string | null;
  sf_amount: number | null;
  sf_close_date: string | null;
  sf_stage: string | null;
  sf_is_closed: boolean;
  confidence: number;
  strength: "strong" | "weak" | "uncertain";
  evidence: string[];
  diff_url: string;
};

type MatchResponse =
  | {
      ok: true;
      writes_performed: false;
      requires_human_confirmation: true;
      substrate_deal_id: string;
      substrate_summary: {
        deal_name: string | null;
        account_name: string | null;
        amount: number | null;
        close_date: string | null;
      };
      pool: {
        candidate_pool_size: number;
        scored_above_threshold: number;
      };
      best_match: MatchCandidate | null;
      candidates: MatchCandidate[];
      existing_link: ExistingLink | null;
      hint: string;
    }
  | { ok: false; error: string; message: string };

type DryRunItem = {
  field_label: string;
  sf_field: string;
  tier: "auto" | "suggest" | "readonly";
  value: string | number | boolean | null;
  current_sf_value: string | null;
  reason: string;
};

type DryRunPayload = {
  dry_run: true;
  sf_opp_id: string;
  would_auto_write: {
    items: DryRunItem[];
    rest_url: string;
    method: "PATCH";
    body: Record<string, string | number | boolean | null>;
    curl_preview: string;
  };
  would_suggest_to_rep: { items: DryRunItem[]; notes: string };
  excluded_readonly: { items: DryRunItem[]; notes: string };
  summary: {
    auto_count: number;
    suggest_count: number;
    excluded_readonly_count: number;
    payload_size_bytes: number;
  };
};

type DiffResponse =
  | {
      ok: true;
      elapsed_ms: number;
      writes_performed: false;
      filter: {
        actionableOnly: boolean;
        hidden_surface_only_count: number;
        hidden_no_op_count: number;
      };
      diff: {
        sf_id: string;
        sf_name: string;
        substrate_deal_id: string;
        total: number;
        by_status: Record<string, number>;
        by_action: Record<string, number>;
        items: DiffItem[];
      };
      substrate_summary: {
        deal_name: string | null;
        account_name: string | null;
        stakeholder_count: number;
        activity_count: number;
      };
      link: {
        status: "unconfirmed" | "confirmed_match" | "confirmed_other";
        active: {
          sf_opp_id: string;
          confirmed_at: string;
          confirmed_by: string | null;
          notes: string | null;
        } | null;
      };
      dry_run: DryRunPayload;
    }
  | { ok: false; error: string; message: string; hint?: string };

/** Same-origin fetch helper for the server component. Falls back to
 *  localhost:3000 when running outside a Next request context. */
async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchMatch(dealId: string): Promise<MatchResponse> {
  const base = await getBaseUrl();
  const res = await fetch(
    `${base}/api/sf/match?dealId=${encodeURIComponent(dealId)}`,
    { cache: "no-store" },
  );
  return (await res.json()) as MatchResponse;
}

async function fetchDiff(
  dealId: string,
  sfOppId: string,
): Promise<{ all: DiffResponse; actionable: DiffResponse }> {
  const base = await getBaseUrl();
  const qs = (extra = "") =>
    `dealId=${encodeURIComponent(dealId)}&sfOppId=${encodeURIComponent(
      sfOppId,
    )}${extra}`;
  // Two parallel calls: full payload (for the auditable surface_only block)
  // and actionable-only (for the primary list). We could derive both from
  // a single full payload client-side, but doing it via the param keeps the
  // route's filter contract exercised on every page load.
  const [allRes, actRes] = await Promise.all([
    fetch(`${base}/api/sf/diff?${qs()}`, { cache: "no-store" }),
    fetch(`${base}/api/sf/diff?${qs("&actionableOnly=true")}`, {
      cache: "no-store",
    }),
  ]);
  return {
    all: (await allRes.json()) as DiffResponse,
    actionable: (await actRes.json()) as DiffResponse,
  };
}

function ValueCell({ v }: { v: string | null }) {
  if (v === null || v === "") {
    return <span className={`${styles.v} ${styles.empty}`}>(blank)</span>;
  }
  return <span className={styles.v}>{v}</span>;
}

function pillClass(kind: "tier" | "action", value: string): string {
  return `${styles.pill} ${styles[`${kind}_${value}`] ?? ""}`;
}

function ItemRow({ item }: { item: DiffItem }) {
  return (
    <div className={styles.item}>
      <div className={styles.itemHeader}>
        <span className={styles.itemTitle}>{item.field_label}</span>
        <span className={styles.sfFieldName}>{item.sf_field}</span>
        <span className={pillClass("tier", item.tier)}>{item.tier}</span>
        <span className={pillClass("action", item.action)}>
          {item.action.replace("_", " ")}
        </span>
      </div>
      <div className={styles.itemBody}>
        <div className={styles.kv}>
          <div className={styles.k}>Substrate</div>
          <ValueCell v={item.substrate_value} />
        </div>
        <div className={styles.kv}>
          <div className={styles.k}>Salesforce</div>
          <ValueCell v={item.sf_value} />
        </div>
      </div>
      <div className={styles.itemReason}>{item.reason}</div>
    </div>
  );
}

export default async function SfDiffDebugPage({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string; sfOppId?: string }>;
}) {
  // Production guard — return 404 in prod unless explicitly enabled.
  // 404 (vs 403) so the route's existence isn't confirmed to outsiders.
  const access = checkSfDebugAccess();
  if (!access.allowed) {
    notFound();
  }

  const sp = await searchParams;
  const dealId = sp.dealId?.trim() ?? "";
  const sfOppId = sp.sfOppId?.trim() ?? "";

  // dealId WITHOUT sfOppId → run the matcher and show ranked candidates.
  // The user picks one to proceed to the diff. Auto-proceed is forbidden
  // even on a high-confidence match — Brendan's directive: "require human
  // confirmation before using it."
  if (dealId && !sfOppId) {
    const match = await fetchMatch(dealId);
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <h1 className={styles.h1}>Salesforce match candidates</h1>
          <p className={styles.subtle}>
            Substrate deal <code>{dealId}</code>
          </p>

          {!match.ok ? (
            <div className={styles.errorCard}>
              <h2>Couldn’t find candidates</h2>
              <div>
                <b>{(match as { error: string }).error}</b>:{" "}
                {(match as { message: string }).message}
              </div>
              <p style={{ marginTop: 12 }}>
                <a
                  href="/sf/diff"
                  style={{ color: "#9eb0d8", textDecoration: "underline" }}
                >
                  ← change inputs
                </a>
              </p>
            </div>
          ) : (
            <>
              {match.existing_link ? (
                <div className={`${styles.linkBanner} ${styles.confirmed}`}>
                  <div className={styles.linkText}>
                    <b>✓ Previously confirmed match.</b>{" "}
                    SF opportunity{" "}
                    <code>{match.existing_link.sf_opp_id}</code>{" "}
                    confirmed{" "}
                    {new Date(
                      match.existing_link.confirmed_at,
                    ).toLocaleString()}
                    {match.existing_link.confirmed_by
                      ? ` by ${match.existing_link.confirmed_by}`
                      : ""}
                    .
                  </div>
                  <div className={styles.linkActions}>
                    <a
                      href={match.existing_link.diff_url}
                      className={styles.linkButton}
                    >
                      Inspect diff →
                    </a>
                    <UnlinkButton dealId={dealId} />
                  </div>
                </div>
              ) : null}

              <div className={styles.safeBanner}>
                <b>Read-only.</b> No SF data is written. No candidate is
                pre-selected — you must pick one to view the diff.
              </div>

              <div className={styles.confirmBanner}>
                <b>Human confirmation required.</b> Match confidence is a
                heuristic, not authority. Even a strong-confidence match
                surfaces here as a suggestion. Click a candidate to inspect
                the diff; nothing is acted on until you decide.
              </div>

              <div className={styles.metaGrid}>
                <div className={styles.metaCard}>
                  <div className={styles.label}>Substrate deal</div>
                  <div className={styles.value}>
                    {match.substrate_summary.deal_name ?? "—"}
                  </div>
                </div>
                <div className={styles.metaCard}>
                  <div className={styles.label}>Substrate account</div>
                  <div className={styles.value}>
                    {match.substrate_summary.account_name ?? "—"}
                  </div>
                </div>
                <div className={styles.metaCard}>
                  <div className={styles.label}>Pool searched</div>
                  <div className={styles.value}>
                    {match.pool.candidate_pool_size}
                  </div>
                </div>
                <div className={styles.metaCard}>
                  <div className={styles.label}>Above threshold</div>
                  <div className={styles.value}>
                    {match.pool.scored_above_threshold}
                  </div>
                </div>
              </div>

              <div className={styles.sectionLabel}>
                Candidates ({match.candidates.length})
              </div>

              {match.candidates.length === 0 ? (
                <div className={styles.noCandidates}>
                  No candidates above minimum confidence threshold (0.15).
                  This substrate deal may not exist in this Salesforce org,
                  or the name/account/amount signal is too weak.
                  <br />
                  <br />
                  Provide an explicit <code>sfOppId</code> if you know it:
                  <br />
                  <a
                    href="/sf/diff"
                    style={{
                      color: "#9eb0d8",
                      textDecoration: "underline",
                      marginTop: 12,
                      display: "inline-block",
                    }}
                  >
                    ← change inputs
                  </a>
                </div>
              ) : (
                <div className={styles.candidateList}>
                  {match.candidates.map((c) => (
                    <a
                      key={c.sf_id}
                      href={`/sf/diff?dealId=${encodeURIComponent(dealId)}&sfOppId=${encodeURIComponent(c.sf_id)}`}
                      className={styles.candidate}
                    >
                      <div className={styles.candidateHeader}>
                        <span className={styles.candidateName}>
                          {c.sf_name}
                        </span>
                        <span
                          className={`${styles.pill} ${styles[`strengthPill_${c.strength}`]}`}
                        >
                          {c.strength}
                        </span>
                        <div className={styles.confidenceBar}>
                          <div className={styles.confidenceTrack}>
                            <div
                              className={`${styles.confidenceFill} ${styles[c.strength]}`}
                              style={{
                                width: `${Math.round(c.confidence * 100)}%`,
                              }}
                            />
                          </div>
                          <span className={styles.confidenceText}>
                            {(c.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className={styles.candidateMeta}>
                        <div>
                          <div className={styles.k}>SF account</div>
                          <div className={styles.v}>
                            {c.sf_account_name ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div className={styles.k}>Stage</div>
                          <div className={styles.v}>
                            {c.sf_stage ?? "—"}
                            {c.sf_is_closed ? " (closed)" : ""}
                          </div>
                        </div>
                        <div>
                          <div className={styles.k}>Amount</div>
                          <div className={styles.v}>
                            {c.sf_amount != null
                              ? "$" + c.sf_amount.toLocaleString()
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className={styles.k}>Close</div>
                          <div className={styles.v}>
                            {c.sf_close_date ?? "—"}
                          </div>
                        </div>
                      </div>
                      {c.evidence.length > 0 ? (
                        <div className={styles.evidenceList}>
                          <ul>
                            {c.evidence.map((e, i) => (
                              <li key={i}>· {e}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className={styles.candidateAction}>
                        <span>SF Id: <code>{c.sf_id}</code></span>
                        <span className={styles.arrow}>Inspect diff →</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              <p className={styles.subtle} style={{ marginTop: 32 }}>
                <a
                  href="/sf/diff"
                  style={{ color: "#9eb0d8", textDecoration: "underline" }}
                >
                  ← change inputs
                </a>{" "}
                ·{" "}
                <a
                  href={`/api/sf/match?dealId=${encodeURIComponent(dealId)}`}
                  style={{ color: "#9eb0d8", textDecoration: "underline" }}
                >
                  raw match JSON ↗
                </a>
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  // No params at all: show the input form so the user can submit them.
  if (!dealId || !sfOppId) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <h1 className={styles.h1}>Salesforce ↔ Substrate diff</h1>
          <p className={styles.subtle}>
            Read-only debug surface. Pass <code>dealId</code> and{" "}
            <code>sfOppId</code> to see what the bridge would suggest.
          </p>
          <form
            className={styles.queryForm}
            action="/sf/diff"
            method="get"
          >
            <input
              name="dealId"
              placeholder="substrate deal id (uuid)"
              defaultValue={dealId}
              autoFocus
            />
            <input
              name="sfOppId"
              placeholder="Salesforce opp id (15 or 18 chars)"
              defaultValue={sfOppId}
            />
            <button type="submit">Diff</button>
          </form>
          <div className={styles.subtle}>
            Engine: <code>lib/sf-diff/engine.ts</code> · Route:{" "}
            <code>app/api/sf/diff</code> · This view never writes to
            Salesforce.
          </div>
        </div>
      </main>
    );
  }

  // Trim whitespace + canonicalize. The route also re-validates.
  if (sp.dealId !== dealId || sp.sfOppId !== sfOppId) {
    redirect(
      `/sf/diff?dealId=${encodeURIComponent(dealId)}&sfOppId=${encodeURIComponent(sfOppId)}`,
    );
  }

  const { all, actionable } = await fetchDiff(dealId, sfOppId);

  if (!all.ok || !actionable.ok) {
    const errSrc = !all.ok ? all : actionable;
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <h1 className={styles.h1}>Salesforce ↔ Substrate diff</h1>
          <div className={styles.errorCard}>
            <h2>Couldn’t compute the diff</h2>
            <div>
              <b>{(errSrc as { error: string }).error}</b>:{" "}
              {(errSrc as { message: string }).message}
            </div>
            {"hint" in errSrc && errSrc.hint ? (
              <pre>{errSrc.hint}</pre>
            ) : null}
          </div>
          <p className={styles.subtle}>
            <a
              href="/sf/diff"
              style={{ color: "#9eb0d8", textDecoration: "underline" }}
            >
              ← change inputs
            </a>
          </p>
        </div>
      </main>
    );
  }

  const fullDiff = all.diff;
  const actionableItems = actionable.diff.items;
  // Surface_only items are only visible in the full payload — pull them from there.
  const surfaceOnlyItems = fullDiff.items.filter(
    (i) => i.action === "surface_only",
  );

  const writeNowCount = fullDiff.by_action.write_now ?? 0;
  const suggestCount = fullDiff.by_action.suggest ?? 0;
  const surfaceOnlyCount = fullDiff.by_action.surface_only ?? 0;
  const noOpCount = fullDiff.by_action.no_op ?? 0;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <h1 className={styles.h1}>{actionable.diff.sf_name}</h1>
        <p className={styles.subtle}>
          SF <code>{actionable.diff.sf_id}</code> · substrate{" "}
          <code>{actionable.diff.substrate_deal_id}</code>
        </p>

        {/* Link state banner — confirmed match / unconfirmed / different opp */}
        {all.link.status === "confirmed_match" && all.link.active ? (
          <div className={`${styles.linkBanner} ${styles.confirmed}`}>
            <div className={styles.linkText}>
              <b>✓ Confirmed link.</b> This Salesforce opportunity is the
              authoritative match for this substrate deal. Confirmed{" "}
              {new Date(all.link.active.confirmed_at).toLocaleString()}
              {all.link.active.confirmed_by
                ? ` by ${all.link.active.confirmed_by}`
                : ""}
              {all.link.active.notes ? ` · ${all.link.active.notes}` : ""}
              .
            </div>
            <div className={styles.linkActions}>
              <UnlinkButton dealId={dealId} />
            </div>
          </div>
        ) : all.link.status === "confirmed_other" && all.link.active ? (
          <div className={`${styles.linkBanner} ${styles.warn}`}>
            <div className={styles.linkText}>
              <b>⚠ Different opportunity already confirmed.</b> Substrate
              deal previously linked to{" "}
              <code>{all.link.active.sf_opp_id}</code> on{" "}
              {new Date(all.link.active.confirmed_at).toLocaleString()}.
              Confirming here will <b>replace</b> that link (the old one
              soft-unlinks; audit trail preserved).
            </div>
            <div className={styles.linkActions}>
              <ConfirmMatchButton
                dealId={dealId}
                sfOppId={sfOppId}
                replace
              />
              <a
                href={`/sf/diff?dealId=${encodeURIComponent(dealId)}&sfOppId=${encodeURIComponent(all.link.active.sf_opp_id)}`}
                className={styles.linkButtonSubtle}
                style={{ textDecoration: "none", display: "inline-block" }}
              >
                View previous link
              </a>
            </div>
          </div>
        ) : (
          <div className={`${styles.linkBanner} ${styles.unconfirmed}`}>
            <div className={styles.linkText}>
              <b>Match not yet confirmed.</b> Click confirm to record this
              substrate↔Salesforce link in the audit log. Still no SF writes
              — only writes the link to substrate's own table.
            </div>
            <div className={styles.linkActions}>
              <ConfirmMatchButton dealId={dealId} sfOppId={sfOppId} />
            </div>
          </div>
        )}

        <div className={styles.safeBanner}>
          <b>Safe view.</b> This page never writes to Salesforce.{" "}
          <code style={{ fontSize: 11 }}>writes_performed: false</code> ·{" "}
          fetched in {actionable.elapsed_ms}ms
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaCard}>
            <div className={styles.label}>Substrate deal</div>
            <div className={styles.value}>
              {actionable.substrate_summary.deal_name ?? "—"}
            </div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>Substrate account</div>
            <div className={styles.value}>
              {actionable.substrate_summary.account_name ?? "—"}
            </div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>Stakeholders</div>
            <div className={styles.value}>
              {actionable.substrate_summary.stakeholder_count}
            </div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>Activities</div>
            <div className={styles.value}>
              {actionable.substrate_summary.activity_count}
            </div>
          </div>
        </div>

        {/* Action rollups */}
        <div className={styles.metaGrid}>
          <div className={styles.metaCard}>
            <div className={styles.label}>Auto (write_now)</div>
            <div className={styles.value}>{writeNowCount}</div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>Suggest</div>
            <div className={styles.value}>{suggestCount}</div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>Surface-only</div>
            <div className={styles.value}>{surfaceOnlyCount}</div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>No-op</div>
            <div className={styles.value}>{noOpCount}</div>
          </div>
        </div>

        {/* Actionable items */}
        <div className={styles.sectionLabel}>
          Actionable ({actionableItems.length})
        </div>
        {actionableItems.length === 0 ? (
          <div className={styles.subtle}>
            No write-now or suggest items. The diff is either fully aligned, or
            all gaps are forecast-impacting (see surface-only below).
          </div>
        ) : (
          <div className={styles.itemList}>
            {actionableItems.map((it) => (
              <ItemRow key={it.sf_field} item={it} />
            ))}
          </div>
        )}

        {/* Dry-run preview — what WOULD fire if writes were enabled */}
        <div className={styles.sectionLabel}>Dry-run preview</div>
        <div className={styles.dryRunBanner}>
          <b>Nothing was sent.</b> This is the literal Salesforce PATCH payload
          the system <i>would</i> fire if auto-writes were enabled. Useful for
          verifying the data shape before you ever earn the write privilege.{" "}
          <code style={{ fontSize: 11 }}>dry_run: true</code>
        </div>

        <div className={styles.dryRunSummary}>
          <div className={styles.metaCard}>
            <div className={styles.label}>Auto-write payload</div>
            <div className={`${styles.value} ${all.dry_run.summary.auto_count > 0 ? styles.positive : styles.muted}`}>
              {all.dry_run.summary.auto_count}
            </div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>Suggest-to-rep</div>
            <div className={`${styles.value} ${all.dry_run.summary.suggest_count > 0 ? styles.warn : styles.muted}`}>
              {all.dry_run.summary.suggest_count}
            </div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>Excluded (readonly)</div>
            <div className={`${styles.value} ${styles.muted}`}>
              {all.dry_run.summary.excluded_readonly_count}
            </div>
          </div>
          <div className={styles.metaCard}>
            <div className={styles.label}>Payload size</div>
            <div className={`${styles.value} ${styles.muted}`}>
              {all.dry_run.summary.payload_size_bytes}b
            </div>
          </div>
        </div>

        {/* Auto-write block: the literal PATCH the system would fire */}
        <div className={styles.dryRunBlock}>
          <div className={styles.dryRunBlockHeader}>
            <div className={styles.dryRunBlockTitle}>
              Would auto-write
              <span className={styles.count}>
                ({all.dry_run.would_auto_write.items.length} field
                {all.dry_run.would_auto_write.items.length === 1 ? "" : "s"})
              </span>
            </div>
            <span className={`${styles.pill} ${styles.tier_auto}`}>
              tier=auto · sf_blank only
            </span>
          </div>
          {all.dry_run.would_auto_write.items.length > 0 ? (
            <>
              <div className={styles.dryRunRequest}>
                <span className={styles.verb}>{all.dry_run.would_auto_write.method}</span>{" "}
                <span className={styles.url}>
                  {all.dry_run.would_auto_write.rest_url}
                </span>
                {"\n\n"}
                {JSON.stringify(all.dry_run.would_auto_write.body, null, 2)}
              </div>
              <div className={styles.dryRunNote}>
                The cURL below is what an engineer would run to trigger this
                manually. Bearer token is redacted — copy-pasting this would
                NOT fire a real write without first substituting your own
                auth.
              </div>
              <pre className={styles.dryRunRequest}>
                {all.dry_run.would_auto_write.curl_preview}
              </pre>
            </>
          ) : (
            <div className={styles.dryRunNote}>
              No fields qualify for auto-write right now. (tier=auto +
              SF-blank + substrate has a confident value is the criterion.)
            </div>
          )}
        </div>

        {/* Suggest block */}
        <div className={styles.dryRunBlock}>
          <div className={styles.dryRunBlockHeader}>
            <div className={styles.dryRunBlockTitle}>
              Would render to rep for approval
              <span className={styles.count}>
                ({all.dry_run.would_suggest_to_rep.items.length})
              </span>
            </div>
            <span className={`${styles.pill} ${styles.tier_suggest}`}>
              tier=suggest · awaits Approve
            </span>
          </div>
          {all.dry_run.would_suggest_to_rep.items.length > 0 ? (
            <ul className={styles.dryRunFieldList}>
              {all.dry_run.would_suggest_to_rep.items.map((it) => (
                <li key={it.sf_field}>
                  <span className={styles.dryRunFieldName}>{it.sf_field}</span>
                  <span className={styles.dryRunArrow}>:</span>
                  <span className={styles.dryRunValue}>
                    {JSON.stringify(it.value)}
                  </span>
                  {it.current_sf_value ? (
                    <span style={{ color: "#6a6a73", fontSize: 11 }}>
                      {" "}
                      (currently: {it.current_sf_value})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.dryRunNote}>
              No fields would render for approval.
            </div>
          )}
          <div className={styles.dryRunNote}>
            {all.dry_run.would_suggest_to_rep.notes}
          </div>
        </div>

        {/* Excluded readonly block */}
        <div className={styles.dryRunBlock}>
          <div className={styles.dryRunBlockHeader}>
            <div className={styles.dryRunBlockTitle}>
              Excluded — readonly tier
              <span className={styles.count}>
                ({all.dry_run.excluded_readonly.items.length})
              </span>
            </div>
            <span className={`${styles.pill} ${styles.tier_readonly}`}>
              never written, ever
            </span>
          </div>
          {all.dry_run.excluded_readonly.items.length > 0 ? (
            <ul className={styles.dryRunFieldList}>
              {all.dry_run.excluded_readonly.items.map((it) => (
                <li key={it.sf_field}>
                  <span className={styles.dryRunFieldName}>{it.sf_field}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.dryRunNote}>
              No readonly fields in scope for this opportunity.
            </div>
          )}
          <div className={styles.dryRunNote}>
            {all.dry_run.excluded_readonly.notes}
          </div>
        </div>

        {/* Surface-only — collapsed, but auditable */}
        {surfaceOnlyItems.length > 0 ? (
          <details className={styles.auditDetails}>
            <summary className={styles.auditSummary}>
              {surfaceOnlyItems.length} surface-only{" "}
              {surfaceOnlyItems.length === 1 ? "gap" : "gaps"} (forecast-impacting,
              never auto-written)
            </summary>
            <div className={styles.auditBody}>
              <p className={styles.subtle} style={{ margin: "8px 0 12px" }}>
                These fields disagree between Salesforce and substrate, but
                doctrine §11.3 forbids writing them. Rep edits them in
                Salesforce directly. Surfaced here for audit only.
              </p>
              <div className={styles.itemList}>
                {surfaceOnlyItems.map((it) => (
                  <ItemRow key={it.sf_field} item={it} />
                ))}
              </div>
            </div>
          </details>
        ) : null}

        <p className={styles.subtle} style={{ marginTop: 32 }}>
          <a
            href="/sf/diff"
            style={{ color: "#9eb0d8", textDecoration: "underline" }}
          >
            ← change inputs
          </a>{" "}
          ·{" "}
          <a
            href={`/api/sf/diff?dealId=${encodeURIComponent(dealId)}&sfOppId=${encodeURIComponent(sfOppId)}`}
            style={{ color: "#9eb0d8", textDecoration: "underline" }}
          >
            raw JSON ↗
          </a>
        </p>
      </div>
    </main>
  );
}
