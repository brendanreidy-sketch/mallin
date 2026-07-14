import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { setAutonomyLevel, setPaused, setTargetSeniority } from "@/lib/sdr/outbound/config-store";
import type { AutonomyLevel } from "@/lib/sdr/outbound/autonomy";

/**
 * POST /api/outbound/settings — the governance controls.
 *
 *   { level } → set autonomy (draft_only | approve_before_send | full_auto).
 *   { paused }→ flip the global kill-switch — pause/resume ALL outreach.
 *
 * Either or both may be present. Both require an existing outbound config (the
 * store throws otherwise → surfaced as 400).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS: AutonomyLevel[] = ["draft_only", "approve_before_send", "full_auto"];

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

  const body = (await req.json().catch(() => ({}))) as {
    level?: string;
    paused?: boolean;
    seniority?: string;
  };

  if (
    body.level === undefined &&
    body.paused === undefined &&
    body.seniority === undefined
  ) {
    return NextResponse.json(
      { error: "nothing_to_set", message: "Provide a level, paused, and/or seniority." },
      { status: 400 },
    );
  }
  if (body.level !== undefined && !LEVELS.includes(body.level as AutonomyLevel)) {
    return NextResponse.json({ error: "bad_level" }, { status: 400 });
  }
  if (body.seniority !== undefined && body.seniority !== "ae" && body.seniority !== "sdr") {
    return NextResponse.json({ error: "bad_seniority" }, { status: 400 });
  }

  try {
    if (body.level !== undefined) {
      await setAutonomyLevel(tenantId, body.level as AutonomyLevel);
    }
    if (body.paused !== undefined) {
      await setPaused(tenantId, Boolean(body.paused));
    }
    if (body.seniority !== undefined) {
      await setTargetSeniority(tenantId, body.seniority as "ae" | "sdr");
    }
  } catch (err) {
    // The store throws when the tenant has no outbound config yet.
    return NextResponse.json(
      {
        error: "no_config",
        message: "Set up your targeting before changing autonomy settings.",
        detail: ((err as Error)?.message ?? String(err)).slice(0, 200),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
