/**
 * ============================================================================
 *  POST /api/sf/apply-suggestion
 * ============================================================================
 *
 *  The rep-approval write path. Triggered when a rep clicks "Apply" on
 *  a suggest-tier field in the UI. Unlike /api/sf/apply-updates which
 *  only accepts auto-tier fields (fire-and-forget), this route accepts
 *  suggest-tier fields one at a time, gated by an explicit click.
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. Production-guarded.                                          ║
 *  ║  2. Confirmed link required.                                     ║
 *  ║  3. NEVER readonly. NEVER system-managed. (Same absolute gates.)  ║
 *  ║  4. ONE field per request. Forces an explicit per-field decision.║
 *  ║  5. Every attempt audited with the rep's evidence + provenance.  ║
 *  ╚══════════════════════════════════════════════════════════════════╝
 * ============================================================================
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import { applyRepApprovedSuggestion } from "@/lib/sf-diff/sf-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}
function isValidSalesforceId(id: string): boolean {
  return /^[A-Za-z0-9]{15}$|^[A-Za-z0-9]{18}$/.test(id);
}

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
    field?: string;
    value?: string | number | boolean | null;
    callSource?: string;
    evidence?: string;
    correlationId?: string;
    dryRun?: boolean;
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
  const field = body.field?.trim();
  const callSource = body.callSource?.trim();

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
  if (!field || !/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_field",
        message: "field must be a valid SF field API name",
        salesforce_writes_performed: false,
      },
      { status: 400 },
    );
  }
  if (!callSource) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_callSource",
        message: "callSource is required for the audit trail",
        salesforce_writes_performed: false,
      },
      { status: 400 },
    );
  }
  // Coerce value to acceptable type
  const v = body.value;
  if (
    v !== null &&
    v !== undefined &&
    typeof v !== "string" &&
    typeof v !== "number" &&
    typeof v !== "boolean"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_value",
        message: "value must be string, number, boolean, or null",
        salesforce_writes_performed: false,
      },
      { status: 400 },
    );
  }
  const coerced: string | number | boolean | null = v ?? null;

  try {
    const result = await applyRepApprovedSuggestion({
      dealId,
      sfOppId,
      field,
      value: coerced,
      callSource,
      evidence: body.evidence ?? null,
      correlationId: body.correlationId ?? null,
      dryRun: body.dryRun === true,
    });

    const realWrite =
      body.dryRun !== true &&
      (result.status === "success" || result.status === "partial");

    return NextResponse.json({
      ok:
        result.status === "success" ||
        result.status === "partial" ||
        result.status === "dry_run",
      elapsed_ms: Date.now() - t0,
      route: "/api/sf/apply-suggestion",
      salesforce_writes_performed: realWrite,
      status: result.status,
      status_detail: result.status_detail ?? null,
      audit_id: result.audit_id,
      sent_body: result.sent_body,
      field_outcomes: result.field_outcomes,
      sf_response: result.sf_response,
      message: result.message,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "writer_threw",
        message: (e as Error).message,
        salesforce_writes_performed: false,
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
