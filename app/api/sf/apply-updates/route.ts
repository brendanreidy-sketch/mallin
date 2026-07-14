/**
 * ============================================================================
 *  POST /api/sf/apply-updates
 * ============================================================================
 *
 *  THE AGENTIC WRITE PATH. This is the ONLY route in the codebase that
 *  actually mutates Salesforce. Every guardrail is enforced here AND
 *  again in lib/sf-diff/sf-writer.ts (defense in depth).
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. PRODUCTION-GUARDED. 403 in prod unless SF_DEBUG_ENABLED=true.║
 *  ║                                                                  ║
 *  ║  2. CONFIRMED LINK REQUIRED. The active sf_opportunity_links     ║
 *  ║     row for this dealId must point at this sfOppId, exactly.     ║
 *  ║                                                                  ║
 *  ║  3. DRY-RUN BY DEFAULT. Caller MUST send dryRun=false explicitly ║
 *  ║     to actually write. Default behavior renders a preview.       ║
 *  ║                                                                  ║
 *  ║  4. AUTO-TIER ONLY. Suggest + readonly fields are filtered out   ║
 *  ║     before any SF call is made. Audit row records the rejection. ║
 *  ║                                                                  ║
 *  ║  5. EVERY ATTEMPT IS AUDITED. Including dry-runs and pre-flight  ║
 *  ║     rejections. sf_writes_audit is the permanent ledger.         ║
 *  ║                                                                  ║
 *  ║  6. APPLY ATTEMPTED FLAG. Even on success, the response carries  ║
 *  ║     the literal `salesforce_writes_performed` boolean so callers ║
 *  ║     can never confuse a dry-run with a real write.               ║
 *  ╚══════════════════════════════════════════════════════════════════╝
 *
 *  Request:
 *    {
 *      dealId:  uuid,
 *      sfOppId: 15- or 18-char SF id,
 *      fields:  { [SfFieldName]: string|number|boolean|null },
 *      dryRun:  boolean       (default true; pass false to actually write),
 *      callSource?: string    (provenance, e.g. "intro_call_2026-03-06")
 *    }
 * ============================================================================
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import { applyAutoUpdates } from "@/lib/sf-diff/sf-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidSalesforceId(id: string): boolean {
  return /^[A-Za-z0-9]{15}$|^[A-Za-z0-9]{18}$/.test(id);
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  // Invariant 1: production guard
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

  // Parse + validate body
  let body: {
    dealId?: string;
    sfOppId?: string;
    fields?: Record<string, unknown>;
    dryRun?: boolean;
    callSource?: string;
    triggeredBy?: string;
    correlationId?: string;
    appendSystemAttribution?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_json",
        salesforce_writes_performed: false,
      },
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
        message: "dealId must be a UUID",
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
        message: "sfOppId must be a 15- or 18-char Salesforce Id",
        salesforce_writes_performed: false,
      },
      { status: 400 },
    );
  }

  if (
    !body.fields ||
    typeof body.fields !== "object" ||
    Array.isArray(body.fields)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_fields",
        message: "fields must be an object of {fieldName: value}",
        salesforce_writes_performed: false,
      },
      { status: 400 },
    );
  }

  // Coerce field values to the writer's accepted types.
  const coercedFields: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(body.fields)) {
    if (v === null || v === undefined) {
      coercedFields[k] = null;
    } else if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      coercedFields[k] = v;
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_field_value",
          message: `Field '${k}' has unsupported type. Only string, number, boolean, null are allowed.`,
          salesforce_writes_performed: false,
        },
        { status: 400 },
      );
    }
  }

  // Default dryRun = true. Caller must explicitly pass false.
  const dryRun = body.dryRun !== false;

  // Hand off to the writer (which enforces all 5 invariants again).
  try {
    const result = await applyAutoUpdates({
      dealId,
      sfOppId,
      fields: coercedFields,
      dryRun,
      callSource: body.callSource ?? null,
      triggeredBy: body.triggeredBy ?? null,
      triggeredByRoute: "/api/sf/apply-updates",
      correlationId: body.correlationId ?? null,
      appendSystemAttribution: body.appendSystemAttribution !== false,
    });

    const realWritePerformed =
      !dryRun && (result.status === "success" || result.status === "partial");

    return NextResponse.json({
      ok:
        result.status === "success" ||
        result.status === "partial" ||
        result.status === "dry_run",
      elapsed_ms: Date.now() - t0,
      route: "/api/sf/apply-updates",
      dry_run: dryRun,
      // Explicit boolean — callers should branch on THIS, not on `ok`.
      salesforce_writes_performed: realWritePerformed,
      status: result.status,
      status_detail: result.status_detail ?? null,
      audit_id: result.audit_id,
      sent_body: result.sent_body,
      field_outcomes: result.field_outcomes,
      counts: {
        attempted: result.attempted,
        succeeded: result.succeeded,
      },
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
