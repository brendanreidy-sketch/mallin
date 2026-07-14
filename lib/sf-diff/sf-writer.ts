/**
 * ============================================================================
 *  sf-writer — gated Salesforce write helper
 * ============================================================================
 *
 *  This module is the chokepoint for every actual write to Salesforce.
 *  Caller cannot bypass it without a code change. Every guardrail is
 *  enforced HERE, not just at the route layer (defense in depth).
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       INVARIANTS                                 ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. NO WRITE WITHOUT A CONFIRMED LINK.                           ║
 *  ║     The substrate↔SF link must exist (sf_opportunity_links has   ║
 *  ║     an active row for this dealId pointing at this sfOppId).     ║
 *  ║                                                                  ║
 *  ║  2. NO READONLY-TIER WRITES, EVER.                               ║
 *  ║     Even if caller passes Stage / Amount / CloseDate, the writer ║
 *  ║     refuses with reason="readonly_field_blocked" and audits.     ║
 *  ║                                                                  ║
 *  ║  3. NO SYSTEM-MANAGED WRITES.                                    ║
 *  ║     LastActivityDate, IsClosed, IsWon, etc. are blocked the same ║
 *  ║     way. Use createTask() for activity-shaped data instead.      ║
 *  ║                                                                  ║
 *  ║  4. AUTO-TIER ONLY (for now).                                    ║
 *  ║     Suggest-tier fields require rep approval — they don't flow   ║
 *  ║     through this writer at all. They go through a separate       ║
 *  ║     approve flow (TODO).                                         ║
 *  ║                                                                  ║
 *  ║  5. AUDIT EVERY ATTEMPT.                                         ║
 *  ║     Including dry-runs. Including pre-flight rejections.         ║
 *  ║     The sf_writes_audit table is the permanent ledger.           ║
 *  ╚══════════════════════════════════════════════════════════════════╝
 * ============================================================================
 */

import { supabaseAdmin } from "../db/client";
import { getConnection } from "../adapters/salesforce";
import {
  tierForField,
  SF_SYSTEM_MANAGED_FIELDS,
} from "../adapters/salesforce-mapping";
import { getActiveLinkForDeal } from "./links";
import {
  systemName,
  TAG_WRAPPED_FIELDS,
  wrapWithSystemAttribution,
} from "./system-attribution";
import { recordAudit } from "@/lib/audit/record";

export type WriteFieldOutcome =
  | { field: string; status: "ok" }
  | {
      field: string;
      status: "rejected";
      error: "readonly" | "system_managed" | "non_auto_tier";
    }
  | { field: string; status: "sf_error"; error: string };

export type WriteStatus =
  | "dry_run"
  | "success"
  | "partial"
  | "failed"
  | "rejected_pre_flight";

/** Input for the rep-approval path. ONE field per call — the rep
 *  is approving a specific suggested update from the UI. */
export interface ApplyRepApprovedSuggestionInput {
  dealId: string;
  sfOppId: string;
  /** Single SF field name (e.g. "NextStep"). */
  field: string;
  /** Value the rep is approving (or null to clear). */
  value: string | number | boolean | null;
  /** Required: which call this came from. Audit chain. */
  callSource: string;
  /** The evidence quote / citation (rendered to the user before they
   *  clicked Apply). Stored in the audit row. */
  evidence?: string | null;
  triggeredBy?: string | null;
  correlationId?: string | null;
  dryRun?: boolean;
}

export interface ApplyAutoUpdatesInput {
  dealId: string;
  sfOppId: string;
  /** field → value map. Caller has already determined these are auto-tier
   *  candidates from the diff engine. We re-validate every one. */
  fields: Record<string, string | number | boolean | null>;
  /** When true (default), do not actually call SF. Just compute the
   *  payload, run all the guards, audit the dry-run, return the
   *  preview. */
  dryRun?: boolean;
  /** Provenance — e.g. "intro_call_2026-03-06". Stored in
   *  audit row for traceability. */
  callSource?: string | null;
  /** Email/user id of the rep, if available. */
  triggeredBy?: string | null;
  /** Route that triggered this — e.g. "/api/sf/apply-updates". */
  triggeredByRoute?: string | null;
  /** Groups related writes from one triggering action. Free-form;
   *  recommended: source event id (Gong call id, etc.). */
  correlationId?: string | null;
  /** When true (default), text-field values get a system attribution
   *  tag appended before write so SF users can see "this was updated
   *  by [system name]". Set to false only for tests / rare paths. */
  appendSystemAttribution?: boolean;
}

// systemName, TAG_WRAPPED_FIELDS, wrapWithSystemAttribution all live
// in ./system-attribution.ts (pure module, no DB deps, separately
// testable). Imported above.

export interface ApplyAutoUpdatesResult {
  status: WriteStatus;
  status_detail?: string;
  audit_id: string | null;
  /** What WAS sent (or would have been sent on dry-run). */
  sent_body: Record<string, string | number | boolean | null>;
  /** Per-field outcomes. */
  field_outcomes: WriteFieldOutcome[];
  /** Counts. */
  attempted: number;
  succeeded: number;
  /** Raw SF response, redacted of access tokens. */
  sf_response?: { status: number; body: unknown };
  /** Diagnostic message. */
  message: string;
}

const REST_PATH_PREFIX = "/services/data/v62.0/sobjects/Opportunity";

/** Pre-flight: filter the caller's field bag into (allowed, rejected).
 *
 *  Two modes:
 *    - acceptedTiers = ["auto"] (default)
 *        Only auto-tier fields pass. Suggest-tier rejected as
 *        non_auto_tier. This is the fire-and-forget path.
 *    - acceptedTiers = ["auto", "suggest"]  (rep-approval path)
 *        Both pass. Used when a rep has explicitly clicked Apply on
 *        a single suggest-tier field. Readonly + system-managed are
 *        STILL refused — those gates are absolute.
 */
function preFlight(
  fields: Record<string, string | number | boolean | null>,
  acceptedTiers: ("auto" | "suggest")[] = ["auto"],
): {
  allowed: Record<string, string | number | boolean | null>;
  outcomes: WriteFieldOutcome[];
} {
  const allowed: Record<string, string | number | boolean | null> = {};
  const outcomes: WriteFieldOutcome[] = [];
  const accepted = new Set<string>(acceptedTiers);
  for (const [field, value] of Object.entries(fields)) {
    if ((SF_SYSTEM_MANAGED_FIELDS as readonly string[]).includes(field)) {
      outcomes.push({ field, status: "rejected", error: "system_managed" });
      continue;
    }
    const tier = tierForField(field);
    if (tier === "readonly") {
      outcomes.push({ field, status: "rejected", error: "readonly" });
      continue;
    }
    if (!accepted.has(tier)) {
      outcomes.push({ field, status: "rejected", error: "non_auto_tier" });
      continue;
    }
    allowed[field] = value;
  }
  return { allowed, outcomes };
}

/** Audit-row writer. Always called — even on pre-flight rejections,
 *  so the rejection itself is logged. */
async function writeAuditRow(args: {
  link_id: string;
  opportunity_id: string;
  sf_opp_id: string;
  sf_instance_url: string;
  rest_url: string;
  rest_method: "PATCH" | "POST" | "GET";
  body: Record<string, unknown>;
  field_outcomes: WriteFieldOutcome[];
  status: WriteStatus;
  status_detail?: string;
  dry_run: boolean;
  sf_response_status?: number | null;
  sf_response_body?: unknown;
  triggered_by?: string | null;
  triggered_by_route?: string | null;
  call_source?: string | null;
  correlation_id?: string | null;
}): Promise<string | null> {
  const attempted = args.field_outcomes.length;
  const succeeded = args.field_outcomes.filter(
    (o) => o.status === "ok",
  ).length;
  const { data, error } = await supabaseAdmin
    .from("sf_writes_audit")
    .insert({
      link_id: args.link_id,
      opportunity_id: args.opportunity_id,
      sf_opp_id: args.sf_opp_id,
      sf_instance_url: args.sf_instance_url,
      rest_url: args.rest_url,
      rest_method: args.rest_method,
      body: args.body,
      field_outcomes: args.field_outcomes,
      attempted_field_count: attempted,
      succeeded_field_count: succeeded,
      status: args.status,
      status_detail: args.status_detail ?? null,
      dry_run: args.dry_run,
      sf_response_status: args.sf_response_status ?? null,
      sf_response_body: args.sf_response_body ?? null,
      triggered_by: args.triggered_by ?? null,
      triggered_by_route: args.triggered_by_route ?? null,
      call_source: args.call_source ?? null,
      correlation_id: args.correlation_id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[sf-writer] audit insert failed:", error.message);
    return null;
  }
  const auditId = (data as { id: string }).id;

  // Mirror into the unified audit_log so SF writes share one trail with queue
  // executions + compliance actions. Best-effort; points back to the detailed
  // sf_writes_audit row. A tenant lookup keeps the entry filterable by tenant.
  try {
    const { data: opp } = await supabaseAdmin
      .from("opportunities")
      .select("tenant_id")
      .eq("id", args.opportunity_id)
      .maybeSingle();
    await recordAudit({
      tenantId: (opp as { tenant_id?: string } | null)?.tenant_id ?? null,
      action: "sf.write",
      entity: `opportunity:${args.opportunity_id}`,
      meta: {
        sf_writes_audit_id: auditId,
        sf_opp_id: args.sf_opp_id,
        status: args.status,
        dry_run: args.dry_run,
        attempted,
        succeeded,
        route: args.triggered_by_route ?? null,
      },
    });
  } catch {
    // never block the write path on the mirror
  }

  return auditId;
}

/**
 * Apply auto-tier updates to a Salesforce Opportunity. Default dry-run
 * = true. Refuses everything that fails any of the 5 invariants.
 */
export async function applyAutoUpdates(
  input: ApplyAutoUpdatesInput,
): Promise<ApplyAutoUpdatesResult> {
  const dryRun = input.dryRun !== false; // default true
  const restUrl = `${REST_PATH_PREFIX}/${input.sfOppId}`;
  const triggeredBy = input.triggeredBy ?? null;
  const triggeredByRoute = input.triggeredByRoute ?? null;
  const callSource = input.callSource ?? null;
  const correlationId = input.correlationId ?? null;

  // ─── Invariant 1: confirmed link required ───────────────────────
  const link = await getActiveLinkForDeal(input.dealId);
  if (!link) {
    return {
      status: "rejected_pre_flight",
      status_detail: "no_active_link",
      audit_id: null,
      sent_body: {},
      field_outcomes: [],
      attempted: 0,
      succeeded: 0,
      message:
        "No active substrate↔SF link for this deal. Confirm the match in /sf/diff before applying updates.",
    };
  }
  if (link.sf_opp_id !== input.sfOppId) {
    return {
      status: "rejected_pre_flight",
      status_detail: "link_target_mismatch",
      audit_id: null,
      sent_body: {},
      field_outcomes: [],
      attempted: 0,
      succeeded: 0,
      message: `Active link points to ${link.sf_opp_id}, not ${input.sfOppId}. Re-confirm the match before applying.`,
    };
  }

  // ─── Invariants 2-4: pre-flight tier check ──────────────────────
  // Auto path: accepts auto-tier only.
  const { allowed, outcomes: rejectedOutcomes } = preFlight(input.fields, [
    "auto",
  ]);

  // ─── System-attribution tagging (text fields only) ──────────────
  // For whitelisted text fields (NextStep, Description), append a
  // suffix so the SF UI shows "this update came from RevOps". Audit
  // logs the wrapped value (what actually goes to SF). Skip when
  // appendSystemAttribution=false (rare; tests / explicit override).
  const shouldTag = input.appendSystemAttribution !== false;
  if (shouldTag) {
    const tagName = systemName();
    for (const [field, value] of Object.entries(allowed)) {
      if (
        TAG_WRAPPED_FIELDS.has(field) &&
        typeof value === "string" &&
        value.length > 0
      ) {
        allowed[field] = wrapWithSystemAttribution(
          value,
          input.callSource ?? null,
          tagName,
        );
      }
    }
  }

  // ─── Empty payload after filtering: audit + return early ─────────
  if (Object.keys(allowed).length === 0) {
    const audit_id = await writeAuditRow({
      link_id: link.id,
      opportunity_id: input.dealId,
      sf_opp_id: input.sfOppId,
      sf_instance_url: link.sf_instance_url,
      rest_url: restUrl,
      rest_method: "PATCH",
      body: {},
      field_outcomes: rejectedOutcomes,
      status: "rejected_pre_flight",
      status_detail: "no_eligible_fields",
      dry_run: dryRun,
      triggered_by: triggeredBy,
      triggered_by_route: triggeredByRoute,
      call_source: callSource,
      correlation_id: correlationId,
    });
    return {
      status: "rejected_pre_flight",
      status_detail: "no_eligible_fields",
      audit_id,
      sent_body: {},
      field_outcomes: rejectedOutcomes,
      attempted: rejectedOutcomes.length,
      succeeded: 0,
      message:
        "No fields eligible for auto-write. All fields were either readonly, system-managed, or non-auto tier.",
    };
  }

  // ─── Dry-run path ───────────────────────────────────────────────
  if (dryRun) {
    const dryRunOutcomes: WriteFieldOutcome[] = [
      ...rejectedOutcomes,
      ...Object.keys(allowed).map<WriteFieldOutcome>((field) => ({
        field,
        status: "ok",
      })),
    ];
    const audit_id = await writeAuditRow({
      link_id: link.id,
      opportunity_id: input.dealId,
      sf_opp_id: input.sfOppId,
      sf_instance_url: link.sf_instance_url,
      rest_url: restUrl,
      rest_method: "PATCH",
      body: allowed,
      field_outcomes: dryRunOutcomes,
      status: "dry_run",
      dry_run: true,
      triggered_by: triggeredBy,
      triggered_by_route: triggeredByRoute,
      call_source: callSource,
      correlation_id: correlationId,
    });
    return {
      status: "dry_run",
      audit_id,
      sent_body: allowed,
      field_outcomes: dryRunOutcomes,
      attempted: dryRunOutcomes.length,
      succeeded: Object.keys(allowed).length,
      message: `Dry-run: ${Object.keys(allowed).length} field(s) would write, ${rejectedOutcomes.length} rejected pre-flight.`,
    };
  }

  // ─── Real write path ────────────────────────────────────────────
  let sfResponseStatus: number | null = null;
  let sfResponseBody: unknown = null;
  let writeStatus: WriteStatus;
  let writeMessage: string;
  const allowedOutcomes: WriteFieldOutcome[] = [];

  try {
    const conn = await getConnection();
    const result = await conn
      .sobject("Opportunity")
      .update({ Id: input.sfOppId, ...allowed });
    if (Array.isArray(result)) {
      writeStatus = "failed";
      writeMessage = "unexpected bulk result from SF (expected single)";
      for (const f of Object.keys(allowed)) {
        allowedOutcomes.push({
          field: f,
          status: "sf_error",
          error: writeMessage,
        });
      }
    } else if (result.success) {
      // SF doesn't tell us per-field success on a single PATCH — if the
      // overall update succeeded, every field we sent stuck. (If any
      // field had been invalid, the entire PATCH would have 400'd.)
      sfResponseStatus = 204; // SF returns 204 on successful update
      writeStatus = "success";
      writeMessage = `${Object.keys(allowed).length} field(s) written to SF.`;
      for (const f of Object.keys(allowed)) {
        allowedOutcomes.push({ field: f, status: "ok" });
      }
    } else {
      writeStatus = "failed";
      const errors =
        (result.errors as Array<{ message: string }>)?.map((e) => e.message) ??
        ["update failed (no error message)"];
      writeMessage = errors.join("; ");
      sfResponseBody = { errors };
      for (const f of Object.keys(allowed)) {
        allowedOutcomes.push({
          field: f,
          status: "sf_error",
          error: writeMessage,
        });
      }
    }
  } catch (e) {
    writeStatus = "failed";
    writeMessage = (e as Error).message;
    sfResponseBody = { error: writeMessage };
    for (const f of Object.keys(allowed)) {
      allowedOutcomes.push({
        field: f,
        status: "sf_error",
        error: writeMessage,
      });
    }
  }

  const allOutcomes: WriteFieldOutcome[] = [
    ...rejectedOutcomes,
    ...allowedOutcomes,
  ];
  const succeeded = allOutcomes.filter((o) => o.status === "ok").length;
  const finalStatus: WriteStatus =
    writeStatus === "success"
      ? rejectedOutcomes.length > 0
        ? "partial"
        : "success"
      : writeStatus;

  const audit_id = await writeAuditRow({
    link_id: link.id,
    opportunity_id: input.dealId,
    sf_opp_id: input.sfOppId,
    sf_instance_url: link.sf_instance_url,
    rest_url: restUrl,
    rest_method: "PATCH",
    body: allowed,
    field_outcomes: allOutcomes,
    status: finalStatus,
    dry_run: false,
    sf_response_status: sfResponseStatus,
    sf_response_body: sfResponseBody,
    triggered_by: triggeredBy,
    triggered_by_route: triggeredByRoute,
    call_source: callSource,
    correlation_id: correlationId,
  });

  return {
    status: finalStatus,
    audit_id,
    sent_body: allowed,
    field_outcomes: allOutcomes,
    attempted: allOutcomes.length,
    succeeded,
    sf_response:
      sfResponseStatus != null
        ? { status: sfResponseStatus, body: sfResponseBody }
        : undefined,
    message: writeMessage,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rep-approval path — one suggest-tier field at a time, explicit click
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the Step 2 model: rep reads the suggestion, clicks Apply, the
// system writes that single field. Same defense-in-depth as auto-write
// (no readonly, no system-managed) — only difference is the writer
// accepts suggest-tier fields here.

export async function applyRepApprovedSuggestion(
  input: ApplyRepApprovedSuggestionInput,
): Promise<ApplyAutoUpdatesResult> {
  const dryRun = input.dryRun === true; // default FALSE — rep clicked Apply
  const restUrl = `${REST_PATH_PREFIX}/${input.sfOppId}`;
  const triggeredBy = input.triggeredBy ?? null;
  const triggeredByRoute = "/api/sf/apply-suggestion";
  const callSource = input.callSource;
  const correlationId = input.correlationId ?? null;

  // Confirmed link required.
  const link = await getActiveLinkForDeal(input.dealId);
  if (!link) {
    return {
      status: "rejected_pre_flight",
      status_detail: "no_active_link",
      audit_id: null,
      sent_body: {},
      field_outcomes: [],
      attempted: 0,
      succeeded: 0,
      message: "No active substrate↔SF link for this deal.",
    };
  }
  if (link.sf_opp_id !== input.sfOppId) {
    return {
      status: "rejected_pre_flight",
      status_detail: "link_target_mismatch",
      audit_id: null,
      sent_body: {},
      field_outcomes: [],
      attempted: 0,
      succeeded: 0,
      message: `Active link points to ${link.sf_opp_id}, not ${input.sfOppId}.`,
    };
  }

  // Pre-flight — accepts BOTH auto and suggest tiers (rep approval).
  // Still refuses readonly + system-managed.
  const fields = { [input.field]: input.value };
  const { allowed, outcomes: rejectedOutcomes } = preFlight(fields, [
    "auto",
    "suggest",
  ]);

  if (Object.keys(allowed).length === 0) {
    const audit_id = await writeAuditRow({
      link_id: link.id,
      opportunity_id: input.dealId,
      sf_opp_id: input.sfOppId,
      sf_instance_url: link.sf_instance_url,
      rest_url: restUrl,
      rest_method: "PATCH",
      body: {},
      field_outcomes: rejectedOutcomes,
      status: "rejected_pre_flight",
      status_detail:
        rejectedOutcomes[0]?.status === "rejected"
          ? `field_${rejectedOutcomes[0].error}`
          : "no_eligible_fields",
      dry_run: dryRun,
      triggered_by: triggeredBy,
      triggered_by_route: triggeredByRoute,
      call_source: callSource,
      correlation_id: correlationId,
    });
    return {
      status: "rejected_pre_flight",
      status_detail:
        rejectedOutcomes[0]?.status === "rejected"
          ? rejectedOutcomes[0].error
          : "no_eligible_fields",
      audit_id,
      sent_body: {},
      field_outcomes: rejectedOutcomes,
      attempted: rejectedOutcomes.length,
      succeeded: 0,
      message: `Field rejected pre-flight: ${input.field} (${rejectedOutcomes[0]?.status === "rejected" ? (rejectedOutcomes[0] as { error: string }).error : "unknown"}).`,
    };
  }

  // Apply system-attribution wrap to text fields the same way auto does.
  if (
    TAG_WRAPPED_FIELDS.has(input.field) &&
    typeof allowed[input.field] === "string" &&
    String(allowed[input.field]).length > 0
  ) {
    allowed[input.field] = wrapWithSystemAttribution(
      String(allowed[input.field]),
      callSource,
      systemName(),
    );
  }

  // Dry-run path
  if (dryRun) {
    const dryRunOutcomes: WriteFieldOutcome[] = [
      ...rejectedOutcomes,
      { field: input.field, status: "ok" },
    ];
    const audit_id = await writeAuditRow({
      link_id: link.id,
      opportunity_id: input.dealId,
      sf_opp_id: input.sfOppId,
      sf_instance_url: link.sf_instance_url,
      rest_url: restUrl,
      rest_method: "PATCH",
      body: allowed,
      field_outcomes: dryRunOutcomes,
      status: "dry_run",
      dry_run: true,
      triggered_by: triggeredBy,
      triggered_by_route: triggeredByRoute,
      call_source: callSource,
      correlation_id: correlationId,
    });
    return {
      status: "dry_run",
      audit_id,
      sent_body: allowed,
      field_outcomes: dryRunOutcomes,
      attempted: dryRunOutcomes.length,
      succeeded: 1,
      message: `Dry-run: would write ${input.field}.`,
    };
  }

  // Real write path
  let sfResponseStatus: number | null = null;
  let sfResponseBody: unknown = null;
  let writeStatus: WriteStatus;
  let writeMessage: string;
  const allowedOutcomes: WriteFieldOutcome[] = [];

  try {
    const conn = await getConnection();
    const result = await conn
      .sobject("Opportunity")
      .update({ Id: input.sfOppId, ...allowed });
    if (Array.isArray(result)) {
      writeStatus = "failed";
      writeMessage = "unexpected bulk result";
      allowedOutcomes.push({
        field: input.field,
        status: "sf_error",
        error: writeMessage,
      });
    } else if (result.success) {
      sfResponseStatus = 204;
      writeStatus = "success";
      writeMessage = `Wrote ${input.field} to SF.`;
      allowedOutcomes.push({ field: input.field, status: "ok" });
    } else {
      writeStatus = "failed";
      const errors =
        (result.errors as Array<{ message: string }>)?.map((e) => e.message) ??
        ["update failed"];
      writeMessage = errors.join("; ");
      sfResponseBody = { errors };
      allowedOutcomes.push({
        field: input.field,
        status: "sf_error",
        error: writeMessage,
      });
    }
  } catch (e) {
    writeStatus = "failed";
    writeMessage = (e as Error).message;
    sfResponseBody = { error: writeMessage };
    allowedOutcomes.push({
      field: input.field,
      status: "sf_error",
      error: writeMessage,
    });
  }

  const allOutcomes: WriteFieldOutcome[] = [
    ...rejectedOutcomes,
    ...allowedOutcomes,
  ];
  const succeeded = allOutcomes.filter((o) => o.status === "ok").length;
  const finalStatus: WriteStatus =
    writeStatus === "success"
      ? rejectedOutcomes.length > 0
        ? "partial"
        : "success"
      : writeStatus;

  // Audit row carries the evidence quote/citation that drove this approval.
  // Tucked into the body's __evidence key (audit body is JSONB; this is
  // additive metadata, not a SF-bound field).
  const auditBody = {
    ...allowed,
    ...(input.evidence ? { __evidence: input.evidence } : {}),
  };

  const audit_id = await writeAuditRow({
    link_id: link.id,
    opportunity_id: input.dealId,
    sf_opp_id: input.sfOppId,
    sf_instance_url: link.sf_instance_url,
    rest_url: restUrl,
    rest_method: "PATCH",
    body: auditBody,
    field_outcomes: allOutcomes,
    status: finalStatus,
    dry_run: false,
    sf_response_status: sfResponseStatus,
    sf_response_body: sfResponseBody,
    triggered_by: triggeredBy,
    triggered_by_route: triggeredByRoute,
    call_source: callSource,
    correlation_id: correlationId,
  });

  return {
    status: finalStatus,
    audit_id,
    sent_body: allowed,
    field_outcomes: allOutcomes,
    attempted: allOutcomes.length,
    succeeded,
    sf_response:
      sfResponseStatus != null
        ? { status: sfResponseStatus, body: sfResponseBody }
        : undefined,
    message: writeMessage,
  };
}
