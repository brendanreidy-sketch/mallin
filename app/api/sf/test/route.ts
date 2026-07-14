/**
 * ============================================================================
 *  GET /api/sf/test
 * ============================================================================
 *
 *  Smoke test for the Salesforce adapter. Confirms:
 *    1. Env vars present
 *    2. Login works
 *    3. Can query open opportunities
 *    4. Can describe the Opportunity object (schema discovery)
 *
 *  Returns a compact report. Use this to verify connection health before
 *  building anything else against the adapter.
 *
 *  No auth on this route during dev — once credentials are wired and
 *  the adapter is stable, add Clerk auth + scope to admin role.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import {
  getConnection,
  listOpenOpportunities,
  describeOpportunity,
  SalesforceConfigError,
} from "@/lib/adapters/salesforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  try {
    // 1. Login probe
    const conn = await getConnection();

    // 2. Query open opps (capped at 5 for the test)
    const opps = await listOpenOpportunities(5);

    // 3. Schema describe (count of custom fields)
    const schema = await describeOpportunity();
    const customFieldCount = schema.fields.filter((f) => f.custom).length;
    const standardFieldCount = schema.fields.length - customFieldCount;

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - t0,
      connection: {
        instance_url: conn.instanceUrl,
        api_version: conn.version,
        org_id: conn.userInfo?.organizationId,
        user_id: conn.userInfo?.id,
      },
      opportunities: {
        count: opps.length,
        sample: opps.slice(0, 3).map((o) => ({
          id: o.Id,
          name: o.Name,
          stage: o.StageName,
          amount: o.Amount,
          close_date: o.CloseDate,
        })),
      },
      schema: {
        total_fields: schema.fields.length,
        standard_fields: standardFieldCount,
        custom_fields: customFieldCount,
        custom_field_names: schema.fields
          .filter((f) => f.custom)
          .map((f) => f.name),
      },
    });
  } catch (e) {
    if (e instanceof SalesforceConfigError) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_env",
          message: e.message,
          hint: "Add SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN to .env.local",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "salesforce_error",
        message: (e as Error).message,
        hint: "Verify credentials + check that your security token is current (it changes on each reset).",
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
