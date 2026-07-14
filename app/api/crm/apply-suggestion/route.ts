import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { updateDealField } from "@/lib/crm";
import { isTenantDemo } from "@/lib/auth/tenant-context";
import { recordAudit } from "@/lib/audit/record";

/**
 * POST /api/crm/apply-suggestion
 *
 * The CRM-neutral approve-and-write endpoint for cockpit Stage 1 Suggest
 * cards. Replaces (in spirit) the SF-specific /api/sf/apply-suggestion
 * for routes that originate from the cockpit on /prep.
 *
 * Body shape:
 *   {
 *     tenantId: string,    // resolved from loaded substrate
 *     dealRef: string,     // the external CRM ID for the deal
 *     field: string,       // neutral field name (e.g. "meddpicc.champion")
 *     value: string,       // the value to write
 *     rationale?: string,  // for audit
 *   }
 *
 * Safety:
 *   - Forbidden-field guard lives in lib/crm.updateDealField. Stage /
 *     Amount / CloseDate / ForecastCategory will throw before any write.
 *   - Auth: Clerk session required.
 *   - Tenant scoping enforced by lib/crm/router via tenant.crm_provider.
 */

interface ApplyPayload {
  tenantId: string;
  dealRef: string;
  field: string;
  value: string;
  rationale?: string;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  let payload: ApplyPayload;
  try {
    payload = (await req.json()) as ApplyPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!payload?.tenantId || !payload?.dealRef || !payload?.field) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_fields",
        required: ["tenantId", "dealRef", "field", "value"],
      },
      { status: 400 },
    );
  }

  // Simulation-mode short-circuit. Demo tenants get a simulated
  // success response — no provider write happens. The is_demo flag
  // on tenants is the type-level guard.
  if (await isTenantDemo(payload.tenantId)) {
    return NextResponse.json({
      ok: true,
      simulated: true,
      updated_field: payload.field,
      deal_id: payload.dealRef,
    });
  }

  try {
    const updated = await updateDealField(
      payload.tenantId,
      payload.dealRef,
      payload.field,
      payload.value,
    );
    // Provider-neutral audit into the unified trail. This covers HubSpot
    // (which has no dedicated ledger of its own); SF writes additionally
    // record their detailed sf_writes_audit row inside the SF writer.
    await recordAudit({
      tenantId: payload.tenantId,
      actorUserId: userId,
      action: "crm.write",
      entity: `deal:${updated.id}`,
      meta: {
        field: payload.field,
        value: payload.value ?? null,
        rationale: payload.rationale ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      updated_field: payload.field,
      deal_id: updated.id,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    // Forbidden-field guard throws "forecast-critical" — surface that
    // explicitly so the UI can show the right banner.
    const isForecastCritical = /forecast-critical/.test(message);
    return NextResponse.json(
      {
        ok: false,
        error: isForecastCritical ? "forecast_critical_field" : "apply_failed",
        detail: message,
      },
      { status: isForecastCritical ? 422 : 502 },
    );
  }
}
