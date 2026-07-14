/**
 * POST /api/try-brief/save
 *
 * Captures a lead from the anonymous /try flow's exit-intent "save your brief"
 * box: the email + the intent the visitor already gave + the generated brief.
 * Stores it in try_leads (migration 028) for signup-import, and notifies the
 * founder in real time. Every step is best-effort — a save must never fail on a
 * DB hiccup or a missing table (pre-migration environments).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/client";
import { sendTryLeadNotification } from "@/lib/email/resend";

export const runtime = "nodejs";

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = clip(body.email, 200);
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
  }

  // Rep sales-tenure band — whitelisted so only known values land in the DB.
  const VALID_EXPERIENCE = new Set(["new", "1-3", "3-7", "7-15", "15+"]);
  const salesExperience =
    typeof body.salesExperience === "string" && VALID_EXPERIENCE.has(body.salesExperience)
      ? body.salesExperience
      : null;

  const lead = {
    email,
    name: clip(body.name, 120) || null,
    company: clip(body.company, 200) || null,
    product_context: clip(body.productContext, 300) || null,
    stakeholders: clip(body.stakeholders, 300) || null,
    account_name: clip(body.account_name, 200) || null,
    artifact: (body.artifact as Record<string, unknown> | undefined) ?? null,
    sales_experience: salesExperience,
  };

  // Persist — best-effort (no-op cleanly if the table isn't there yet).
  const { error } = await supabaseAdmin.from("try_leads").insert(lead);
  if (error) console.warn(`[try-save] insert skipped: ${error.message}`);

  // Notify the founder in real time — best-effort.
  await sendTryLeadNotification({
    email,
    name: lead.name ?? undefined,
    company: lead.company ?? undefined,
    productContext: lead.product_context ?? undefined,
    stakeholders: lead.stakeholders ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
