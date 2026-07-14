/**
 * GET /api/live-coach/history?dealId=<uuid>
 *
 * Returns the signed-in user's Live Coach conversation history for
 * the given opportunity, in chronological order. Used by
 * LiveCoach.tsx on mount to hydrate the chat panel so reloads /
 * cross-session use preserves the conversation.
 *
 * Scope: per (tenant, opportunity, user). A rep sees only their own
 * conversations. To read across users (e.g. founder admin reviewing
 * what Gianna asked), use the CLI:
 *   npx tsx scripts/intelligence/show-live-coach.ts --deal <id>
 *
 * Auth: requires a signed-in Clerk user. Anonymous demo-bypass
 * access returns an empty history (no rows to read, since the
 * write path also skips for anonymous).
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/db/client";
import { loadOpportunityShellByDealId } from "@/lib/db/load-account-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TurnRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function badRequest(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const { userId } = await auth().catch(() => ({ userId: null }));
  if (!userId) {
    // Anonymous demo access — return empty history, not an error.
    return NextResponse.json({ ok: true, turns: [] });
  }

  const url = new URL(req.url);
  const dealIdRaw = url.searchParams.get("dealId") ?? "";
  const dealId = dealIdRaw.replace(/[^a-fA-F0-9-]/g, "");
  if (!dealId) return badRequest("dealId is required");

  // Tenant scope via the opportunity. The user can only read their
  // own turns within their tenant — we filter by both (tenant_id,
  // user_id) to enforce that.
  const shell = await loadOpportunityShellByDealId(dealId);
  if (!shell) return badRequest("deal not found", 404);

  const { data, error } = await supabaseAdmin
    .from("live_coach_turns")
    .select("id, role, content, created_at")
    .eq("tenant_id", shell.tenant_id)
    .eq("opportunity_id", dealId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[/api/live-coach/history] db error:", error.message);
    return badRequest(error.message, 500);
  }

  const turns = ((data ?? []) as TurnRow[]).map((t) => ({
    id: t.id,
    role: t.role,
    content: t.content,
    created_at: t.created_at,
  }));

  return NextResponse.json({ ok: true, turns });
}
