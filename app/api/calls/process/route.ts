/**
 * ============================================================================
 *  POST /api/calls/process
 * ============================================================================
 *
 *  The production agentic path. Takes ONE call (transcript + metadata +
 *  prior SF state context) and runs the loop:
 *
 *     1. Claude extractor → structured MEDDPICC field updates + risks
 *     2. tier classifier → split into auto / suggest / readonly
 *     3. Writer → apply auto fields to SF (gated by confirmed link,
 *                 system-attribution wrapped, audited)
 *     4. Return: extraction + apply result + audit id(s)
 *
 *  Suggest fields and readonly fields are NOT written. They're returned
 *  in the response so a UI can render them for human approval (suggest)
 *  or surface the gap (readonly).
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. Production-guarded (existing pattern).                       ║
 *  ║  2. Confirmed link required (re-checked by writer).              ║
 *  ║  3. Auto-tier only writes; everything else returned for UI.      ║
 *  ║  4. dryRun defaults to TRUE — caller must opt in to real write.  ║
 *  ║  5. Every call generates an audit row (success or rejection).    ║
 *  ╚══════════════════════════════════════════════════════════════════╝
 *
 *  Request:
 *    {
 *      dealId, sfOppId,
 *      call: { title, started_at, duration_seconds, summary,
 *              call_index, total_calls_so_far },
 *      dryRun?: boolean (default true),
 *      callSource?: string  (e.g. "intro_call_1_2025-09-24"),
 *      correlationId?: string
 *    }
 * ============================================================================
 */

import { NextResponse, type NextRequest, after } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { sendPostCallRecapEmail } from "@/lib/email/summary-emails";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import { extractCall } from "@/lib/agents/call-extractor";
import { applyAutoUpdates } from "@/lib/sf-diff/sf-writer";
import { getActiveLinkForDeal } from "@/lib/sf-diff/links";
import { loadDealFromDB } from "@/lib/db/load-deal";
import { getDealCustomFields } from "@/lib/crm";
import {
  detectAllEscalations,
  emptyBehavioralSignals,
  type BehavioralSignals,
  type EscalationAlert,
} from "@/lib/sf-diff/methodology-escalation";
import {
  sendEscalationToSlack,
  type SlackSinkContext,
} from "@/lib/sf-diff/slack-sink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Convert SF login URL into a Lightning record URL.
 *  e.g. https://orgfarm-X.develop.my.salesforce.com
 *    →  https://orgfarm-X.develop.lightning.force.com/lightning/r/Opportunity/<id>/view */
function sfLightningUrl(opportunityId: string): string | undefined {
  const login = process.env.SF_LOGIN_URL;
  if (!login) return undefined;
  const base = login
    .replace(".my.salesforce.com", ".lightning.force.com")
    .replace(/\/$/, "");
  return `${base}/lightning/r/Opportunity/${opportunityId}/view`;
}

/** Format an ISO date + duration into a compact "May 8 · 32 min" label. */
function formatLastCallLabel(
  startedAt: string,
  durationSec: number | undefined,
): string | undefined {
  try {
    const d = new Date(startedAt);
    if (Number.isNaN(d.getTime())) return undefined;
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    const mins = durationSec ? Math.round(durationSec / 60) : 0;
    return mins > 0 ? `${month} ${day} · ${mins} min` : `${month} ${day}`;
  } catch {
    return undefined;
  }
}

/** Per-alert outcome surfaced in the response. */
interface SlackAlertResult {
  rule_id: string;
  severity: "warn" | "escalate_to_manager";
  rule_label: string;
  sent: boolean;
  channel_id?: string;
  message_ts?: string;
  error?: string;
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}
function isValidSalesforceId(id: string): boolean {
  return /^[A-Za-z0-9]{15}$|^[A-Za-z0-9]{18}$/.test(id);
}

interface CallInput {
  title?: string;
  started_at?: string;
  duration_seconds?: number;
  summary?: string;
  call_index?: number;
  total_calls_so_far?: number;
}

const FIELDS_FOR_PRIOR_STATE = [
  "Name",
  "StageName",
  "Amount",
  "CloseDate",
  "NextStep",
  "Description",
  "Who_is_the_Champion__c",
  "Who_is_the_Economic_Buyer__c",
  "X15_Who_signs__c",
  "Compelling_Event_Details__c",
  "Final_Competitor__c",
  "Risks_Threats__c",
  "Mitigation__c",
];

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const access = checkSfDebugAccess();
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "debug_disabled_in_production",
        message: access.reason,
        salesforce_writes_performed: false,
      },
      { status: 403 },
    );
  }

  let body: {
    dealId?: string;
    sfOppId?: string;
    call?: CallInput;
    dryRun?: boolean;
    callSource?: string;
    correlationId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", salesforce_writes_performed: false },
      { status: 400 },
    );
  }

  const dealId = body.dealId?.trim();
  const sfOppId = body.sfOppId?.trim();
  if (!dealId || !isValidUuid(dealId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_dealId",
        salesforce_writes_performed: false,
      },
      { status: 400 },
    );
  }
  if (!sfOppId || !isValidSalesforceId(sfOppId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_sfOppId",
        salesforce_writes_performed: false,
      },
      { status: 400 },
    );
  }
  if (
    !body.call ||
    !body.call.title ||
    !body.call.started_at ||
    !body.call.summary
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_call",
        message:
          "call must include title, started_at (ISO), summary at minimum",
        salesforce_writes_performed: false,
      },
      { status: 400 },
    );
  }

  const dryRun = body.dryRun !== false; // default TRUE

  try {
    // 1. Pre-flight: link must exist & point at this sfOppId. (writer
    //    re-checks too; we surface a clear error early.)
    const link = await getActiveLinkForDeal(dealId);
    if (!link) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_active_link",
          message:
            "No confirmed substrate↔SF link for this deal. Confirm the match in /sf/diff first.",
          salesforce_writes_performed: false,
        },
        { status: 400 },
      );
    }
    if (link.sf_opp_id !== sfOppId) {
      return NextResponse.json(
        {
          ok: false,
          error: "link_target_mismatch",
          message: `Active link points to ${link.sf_opp_id}, not ${sfOppId}.`,
          salesforce_writes_performed: false,
        },
        { status: 409 },
      );
    }

    // 2. Load substrate deal context for the extractor
    const loaded = await loadDealFromDB(dealId);
    if (!loaded) {
      return NextResponse.json(
        {
          ok: false,
          error: "deal_not_found",
          salesforce_writes_performed: false,
        },
        { status: 404 },
      );
    }

    // 3. Pull prior CRM state for the fields the extractor + verification
    //    framework consume. Routes through lib/crm so the underlying
    //    CRM (SF today, HubSpot for some tenants) is determined by
    //    tenant.crm_provider — not hardcoded here. SF provider applies
    //    the describe+SOQL filter to handle orgs without Northwind customs;
    //    HS provider does a deal GET with properties param. Same shape
    //    of result either way: Record<string, string | null>.
    const tenantId = loaded.substrate.opportunity?.tenant_id;
    if (!tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error: "deal_missing_tenant_id",
          salesforce_writes_performed: false,
        },
        { status: 500 },
      );
    }
    const priorSfState = await getDealCustomFields(
      tenantId,
      sfOppId,
      FIELDS_FOR_PRIOR_STATE,
    );

    // 4. Run the extractor
    const extraction = await extractCall({
      deal_name: loaded.substrate.opportunity?.name ?? "Unknown Deal",
      account_name: loaded.substrate.account?.name ?? "Unknown Account",
      amount: loaded.substrate.opportunity?.amount ?? null,
      stage_label: priorSfState.StageName ?? null,
      close_date: priorSfState.CloseDate ?? null,
      call_title: body.call.title,
      call_date: body.call.started_at,
      call_duration_min: body.call.duration_seconds
        ? Math.round(body.call.duration_seconds / 60)
        : 0,
      call_summary: body.call.summary,
      call_index: body.call.call_index ?? 1,
      total_calls_so_far: body.call.total_calls_so_far ?? 1,
      prior_sf_state: priorSfState,
      known_stakeholders: (loaded.substrate.stakeholders ?? []).map((s) => ({
        name: s.name,
        title: s.title,
        committee_role: s.committee_role,
      })),
    });

    // 5. Split fields by tier_hint. Auto-tier goes to writer; suggest +
    //    readonly are returned as-is for the UI to render.
    const autoFields: Record<string, string> = {};
    const suggestFields: typeof extraction.fields = [];
    const readonlySurfaced: typeof extraction.fields = [];
    for (const f of extraction.fields) {
      if (f.tier_hint === "auto") {
        autoFields[f.sf_field] = f.proposed_value;
      } else if (f.tier_hint === "suggest") {
        suggestFields.push(f);
      } else {
        readonlySurfaced.push(f);
      }
    }
    // Always include synthesized next_step in the auto path
    if (extraction.next_step) {
      autoFields.NextStep = extraction.next_step;
    }

    // 6. Run the writer (tier-validated, audit-logged, attribution-tagged)
    const writeResult = await applyAutoUpdates({
      dealId,
      sfOppId,
      fields: autoFields,
      dryRun,
      callSource: body.callSource ?? null,
      correlationId: body.correlationId ?? null,
      triggeredByRoute: "/api/calls/process",
    });

    // 7. Verification escalation detection — what gaps does this call's
    //    state expose? The detector returns alerts keyed by the call
    //    index at which they triggered; we surface ONLY the alerts
    //    that fired on THIS call ("qualifying"), not pre-existing ones.
    //
    //    Cumulative reconstruction approach (degraded but honest):
    //      - state AFTER this call = priorSfState merged with the auto
    //        fields just written (the writer's effect, modulo dryRun).
    //      - prior calls (1..N-1) — substrate doesn't store per-call SF
    //        state or behavioral signals yet, so we approximate by
    //        re-using the current state and emptyBehavioralSignals().
    //        This makes the verification framework slightly noisier
    //        for multi-call deals (it can't credit a rep for an ask
    //        that happened on call 2 if call 5 is currently being
    //        processed). Acceptable for v1; full fix needs a
    //        per-call signals migration.
    const callIdx = body.call.call_index ?? 1;
    const totalSoFar = body.call.total_calls_so_far ?? callIdx;
    const stateAfterThisCall: Record<string, string | null> = {
      ...priorSfState,
      ...autoFields,
    };

    const stateByCall: Array<Record<string, string | null>> = [];
    const signalsByCall: BehavioralSignals[] = [];
    for (let i = 1; i < callIdx; i++) {
      stateByCall.push(stateAfterThisCall); // approximation
      signalsByCall.push(emptyBehavioralSignals());
    }
    stateByCall.push(stateAfterThisCall);
    signalsByCall.push(extraction.behavioral_signals);

    const dealName = loaded.substrate.opportunity?.name ?? "Unknown Deal";
    const allAlerts = detectAllEscalations(
      stateByCall,
      signalsByCall,
      dealName,
    );
    const newlyTriggered: EscalationAlert[] = (allAlerts.get(callIdx) ?? []).filter(
      // Filter to alerts that triggered AT this call (not earlier).
      // Map keys are already triggered_at_call, so this is mostly
      // defense-in-depth; an alert that exists in the map at index N
      // by definition has triggered_at_call === N.
      (a) => a.triggered_at_call === callIdx,
    );

    // 8. Fan qualifying alerts out to Slack. Failures are captured in
    //    the response but do NOT fail the route — call processing
    //    succeeded; Slack delivery is a side effect.
    const sinkCtx: SlackSinkContext = {
      deal_name: dealName,
      account_name: loaded.substrate.account?.name,
      rep_name: process.env.DEFAULT_REP_NAME || undefined,
      deal_stage: priorSfState.StageName ?? undefined,
      deal_amount: priorSfState.Amount
        ? `$${Number(priorSfState.Amount).toLocaleString("en-US")}`
        : undefined,
      last_call_label: formatLastCallLabel(
        body.call.started_at,
        body.call.duration_seconds,
      ),
      deal_id: sfOppId,
      deal_url: sfLightningUrl(sfOppId),
    };

    const slackAlertsSent: SlackAlertResult[] = [];
    for (const alert of newlyTriggered) {
      try {
        const result = await sendEscalationToSlack(alert, sinkCtx);
        slackAlertsSent.push({
          rule_id: alert.rule_id,
          severity: alert.severity,
          rule_label: alert.rule_label,
          sent: result.ok,
          channel_id: result.channel_id,
          message_ts: result.message_ts,
          error: result.error,
        });
      } catch (err) {
        slackAlertsSent.push({
          rule_id: alert.rule_id,
          severity: alert.severity,
          rule_label: alert.rule_label,
          sent: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Email the rep a recap of this call (self-notification, non-blocking).
    // Only on real writes — dryRun defaults TRUE, so previews don't send.
    // Resolve the recipient in request context, then send via after() so the
    // response isn't delayed. Fail-safe: never affects the response.
    if (
      !dryRun &&
      (writeResult.status === "success" || writeResult.status === "partial")
    ) {
      let recapTo: string | null = null;
      try {
        const user = await currentUser();
        recapTo =
          user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
            ?.emailAddress ??
          user?.emailAddresses[0]?.emailAddress ??
          null;
      } catch {
        recapTo = null;
      }
      if (recapTo) {
        const to = recapTo;
        const base =
          process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() || "https://mallin.io";
        after(async () => {
          try {
            await sendPostCallRecapEmail(to, {
              accountName: loaded.substrate.account?.name ?? "your account",
              dealName,
              theRead: extraction.the_read,
              risks: extraction.risks.map((r) => r.line),
              nextStep: extraction.next_step,
              fieldsUpdated: Object.keys(writeResult.succeeded ?? {}).length,
              cockpitUrl: `${base}/prep?dealId=${dealId}`,
            });
          } catch (err) {
            console.warn("[call-process] recap email failed:", err);
          }
        });
      }
    }

    return NextResponse.json({
      ok:
        writeResult.status === "success" ||
        writeResult.status === "partial" ||
        writeResult.status === "dry_run" ||
        writeResult.status === "rejected_pre_flight",
      elapsed_ms: Date.now() - t0,
      route: "/api/calls/process",
      dry_run: dryRun,
      salesforce_writes_performed:
        !dryRun &&
        (writeResult.status === "success" || writeResult.status === "partial"),
      // The agent's read of this call
      the_read: extraction.the_read,
      risks: extraction.risks,
      // What the writer did
      write: {
        status: writeResult.status,
        audit_id: writeResult.audit_id,
        attempted: writeResult.attempted,
        succeeded: writeResult.succeeded,
        sent_body: writeResult.sent_body,
        field_outcomes: writeResult.field_outcomes,
      },
      // For UI rendering — suggest queue + readonly surface
      suggest_fields: suggestFields,
      readonly_surfaced: readonlySurfaced,
      // Verification gaps that newly triggered on THIS call. These were
      // sent to Slack (see slack_alerts_sent for delivery results).
      // No SF write happens from these — Stage 1 trust progression.
      verification_alerts_for_this_call: newlyTriggered.map((a) => ({
        rule_id: a.rule_id,
        rule_label: a.rule_label,
        severity: a.severity,
        sf_fields: a.sf_fields,
        next_call_ask: a.next_call_ask,
      })),
      // Slack delivery outcome per alert.
      slack_alerts_sent: slackAlertsSent,
      // Provenance
      extractor: {
        latency_ms: extraction.latency_ms,
        input_tokens: extraction.input_tokens,
        output_tokens: extraction.output_tokens,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "process_failed",
        message: (e as Error).message,
        salesforce_writes_performed: false,
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
