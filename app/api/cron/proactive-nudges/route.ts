/**
 * Proactive-nudge cron — the "system reaches out" trigger.
 *
 * Vercel hits this on the schedule in vercel.json. For each tenant it scans live
 * deals for a state change worth pushing (stall / silence / win-back) and — IF
 * the send path is enabled — delivers each to Slack.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}`; anything else is
 * rejected. Send gate: PROACTIVE_NUDGES_ENABLED must equal "1" (OFF by default),
 * and a Slack webhook must be set — so this delivers NOTHING until both are
 * true. Detection runs regardless and is safe; the response reports found vs
 * sent so you can watch it in dry mode before flipping it on.
 *
 * Per-tenant try/catch so one tenant's failure never aborts the run.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushNudgesForTenant } from "@/lib/proactive/push-nudges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TENANTS_PER_RUN = 200;

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured = locked down
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return new NextResponse("Unauthorized", { status: 401 });

  const enabled = process.env.PROACTIVE_NUDGES_ENABLED === "1";
  const now = Date.now();

  const { data: tenants } = await db()
    .from("tenants")
    .select("id")
    .limit(MAX_TENANTS_PER_RUN);

  let found = 0;
  let sent = 0;
  for (const t of tenants ?? []) {
    try {
      const r = await pushNudgesForTenant(t.id as string, now);
      found += r.found;
      sent += r.sent;
    } catch {
      /* per-tenant isolation — one failure never aborts the run */
    }
  }

  return NextResponse.json({
    ok: true,
    send_enabled: enabled,
    tenants: tenants?.length ?? 0,
    nudges_found: found,
    nudges_sent: sent,
  });
}
