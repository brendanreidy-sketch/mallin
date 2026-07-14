import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";

/**
 * POST /api/onboarding/experience — save the rep's sales-tenure band at signup.
 *
 * The onboarding companion to the /try gate capture: direct signups (who never
 * touch /try) answer "how long in sales?" on the welcome step and land here.
 * Only sets the value if it isn't already set, so a /try-imported tenure is
 * never overwritten. Best-effort — never blocks getting into the app.
 * See rep_experience_persona_adaptation.md.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(["new", "1-3", "3-7", "7-15", "15+"]);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const band =
    typeof body.salesExperience === "string" && VALID.has(body.salesExperience)
      ? body.salesExperience
      : null;
  // Skip / unknown → nothing to store, but not an error (the step is optional).
  if (!band) return NextResponse.json({ ok: true });

  const tenantId = await getCurrentTenantId().catch(() => null);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "no_workspace" }, { status: 403 });
  }

  try {
    // Only if not already set — never clobber a /try-imported value.
    await supabaseAdmin
      .from("tenants")
      .update({ sales_experience: band })
      .eq("id", tenantId)
      .is("sales_experience", null);
  } catch (e) {
    console.warn("[onboarding-experience] save failed:", (e as Error).message);
  }

  return NextResponse.json({ ok: true });
}
