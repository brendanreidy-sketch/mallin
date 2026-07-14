/**
 * Nurture cron — the over-time autonomy. Finds nurture-band leads that have
 * gone quiet (no touch in NURTURE_IDLE_DAYS) and re-engages the prospect with
 * a gentle check-in, then stamps last_nurture_at so it won't re-fire.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}`. Reject otherwise.
 * Per-lead try/catch; bounded per run. Email honors dry-run = false (real),
 * but only fires when a prospect email was captured.
 */
import { NextResponse, type NextRequest } from "next/server";
import { loadSdrConfig } from "@/lib/sdr/config-store";
import { sendEmail } from "@/lib/sdr/effects";
import { markNurtured, nurtureCandidates } from "@/lib/sdr/store";
import type { SdrTenantConfig } from "@/lib/sdr/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NURTURE_IDLE_DAYS = 7;
const MAX_PER_RUN = 100;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const candidates = (await nurtureCandidates(NURTURE_IDLE_DAYS)).slice(0, MAX_PER_RUN);
  const configCache = new Map<string, SdrTenantConfig | null>();
  let touched = 0;
  let skipped = 0;

  for (const c of candidates) {
    try {
      const email = (c.lead?.email as string | undefined)?.trim();
      if (!email) {
        skipped++;
        continue;
      }
      if (!configCache.has(c.tenant_id)) {
        configCache.set(c.tenant_id, await loadSdrConfig(c.tenant_id));
      }
      const config = configCache.get(c.tenant_id);
      if (!config) {
        skipped++;
        continue;
      }
      const name = (c.lead?.name as string | undefined) || "there";
      const detail =
        config.implementation.nurture.detail || "a quick resource that might help";
      const text = `Hi ${name},\n\nFollowing up from your chat with ${config.company_name} — when the timing's right, here's ${detail}. Happy to help whenever you're ready.\n\n— The ${config.company_name} team`;
      await sendEmail(email, `Checking in from ${config.company_name}`, text);
      await markNurtured(c.conversation_id);
      touched++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, touched, skipped });
}
