import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import {
  loadSdrConfig,
  saveSdrConfig,
  defaultSdrConfig,
} from "@/lib/sdr/config-store";
import { hasSdrAccess } from "@/lib/sdr/entitlement";
import type { SdrTenantConfig } from "@/lib/sdr/types";

/**
 * GET  /api/sdr/config — the signed-in tenant's SDR config (or a blank default).
 * POST /api/sdr/config — save the tenant's SDR config.
 *
 * Self-auths; MUST stay in middleware isPublicRoute, else Clerk protect() 404s
 * unauth requests and Vercel edge-caches the 404 for everyone (see
 * clerk_protect_cached_404). Per-tenant: a customer only ever touches their own.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tenant(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  try {
    return await getCurrentTenantId();
  } catch {
    return null;
  }
}

export async function GET() {
  const tenantId = await tenant();
  if (!tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const config = (await loadSdrConfig(tenantId)) ?? defaultSdrConfig();
    // widget_key = the tenant id; the embed snippet carries it so the public
    // widget endpoint knows whose agent to run.
    return NextResponse.json({
      config,
      configured: config.offering !== "",
      widget_key: tenantId,
      entitled: await hasSdrAccess(tenantId),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "load_failed", detail: (e as Error).message.slice(0, 200) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const tenantId = await tenant();
  if (!tenantId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { config?: SdrTenantConfig }
    | null;
  const config = body?.config;
  if (!config || typeof config.company_name !== "string" || !config.governance) {
    return NextResponse.json({ error: "bad_config" }, { status: 400 });
  }
  // Paid capability — saving a config (which arms the embeddable widget) is
  // gated. Editing is fine; enabling requires entitlement.
  if (!(await hasSdrAccess(tenantId))) {
    return NextResponse.json({ error: "not_enabled" }, { status: 403 });
  }
  try {
    await saveSdrConfig(tenantId, config);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "save_failed", detail: (e as Error).message.slice(0, 200) },
      { status: 500 },
    );
  }
}
