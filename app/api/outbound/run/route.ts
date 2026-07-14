import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { loadOutboundConfig } from "@/lib/sdr/outbound/config-store";
import { sourceProspects } from "@/lib/sdr/outbound/sourcing-agent";

/**
 * POST /api/outbound/run — source a fresh batch of prospects.
 *
 * Loads the tenant's saved outbound config (400 if they haven't run setup),
 * runs the sourcing agent, and inserts each prospect as a pending row under one
 * new run_id. Returns the inserted rows for the review queue. Sourcing
 * web-searches heavily — raise maxDuration.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  const config = await loadOutboundConfig(tenantId);
  if (!config) {
    return NextResponse.json(
      {
        error: "no_config",
        message: "Set up your targeting first — start on the setup page.",
      },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { count?: number };
  const count =
    typeof body.count === "number" && body.count > 0 && body.count <= 20
      ? Math.floor(body.count)
      : 6;

  let prospects;
  try {
    const result = await sourceProspects(config, { count });
    prospects = result.prospects;
  } catch (err) {
    console.error(`[outbound/run] sourcing failed for tenant ${tenantId}:`, err);
    return NextResponse.json(
      {
        error: "sourcing_failed",
        message: "We couldn't source prospects this run. Please try again.",
        detail: ((err as Error)?.message ?? String(err)).slice(0, 300),
      },
      { status: 500 },
    );
  }

  const runId = randomUUID();
  const rows = prospects.map((prospect) => ({
    tenant_id: tenantId,
    run_id: runId,
    prospect,
    status: "pending" as const,
  }));

  if (rows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("outbound_prospects")
      .insert(rows)
      .select("id, run_id, prospect, status, created_at");
    if (error) {
      console.error(`[outbound/run] insert failed for tenant ${tenantId}:`, error);
      return NextResponse.json(
        { error: "persist_failed", message: "Sourced, but couldn't save. Please try again." },
        { status: 500 },
      );
    }
    return NextResponse.json({ runId, prospects: data ?? [] });
  }

  return NextResponse.json({ runId, prospects: [] });
}
