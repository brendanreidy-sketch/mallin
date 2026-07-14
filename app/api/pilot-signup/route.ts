/**
 * POST /api/pilot-signup
 *
 * Public endpoint (no auth) that captures inbound pilot-program signups
 * from /pilot. Stores the row in pilot_signups, then fires a notification
 * email to brendan@mallin.io via Resend.
 *
 * Flow:
 *   1. Parse + validate body (Zod).
 *   2. Honeypot check — bots fill hidden hp_field; humans never do.
 *      Silently 200 if it's populated (don't reveal we filter spam).
 *   3. Insert into pilot_signups. Duplicate email (unique violation
 *      code 23505) is treated as success — don't leak which addresses
 *      already submitted.
 *   4. Fire email notification. Email failure does NOT fail the request;
 *      the row is still in the DB and Brendan can recover via query.
 *
 * Why no auth: the form is for prospects who do not yet have an account.
 * Defense is in input validation, the honeypot, and the unique-email
 * constraint — not authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/db/client";
import { sendPilotSignupNotification } from "@/lib/email/resend";

const PilotSignupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Valid email required").max(200),
  company: z.string().trim().min(1, "Company is required").max(160),
  role: z.string().trim().max(120).optional(),
  what_you_sell: z.string().trim().min(1, "Tell us what you sell").max(200),
  team_size: z.string().trim().max(60).optional(),
  current_stack: z.array(z.string().trim().max(60)).max(40).optional(),
  win_rate: z.string().trim().max(60).optional(),
  deal_profile: z.string().trim().max(60).optional(),
  team_experience: z.string().trim().max(60).optional(),
  trigger: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
  utm_source: z.string().trim().max(120).optional(),
  utm_campaign: z.string().trim().max(120).optional(),
  utm_medium: z.string().trim().max(120).optional(),
  // Honeypot — must be empty (bots fill, humans don't see).
  hp_field: z.string().max(0).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  // 1. Parse JSON
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  // 2. Validate
  const parsed = PilotSignupSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  // 3. Honeypot — silent success for bots
  if (parsed.data.hp_field && parsed.data.hp_field.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const ua = req.headers.get("user-agent");
  const ipRaw =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ip_hash = ipRaw
    ? createHash("sha256").update(ipRaw).digest("hex").slice(0, 16)
    : null;

  const {
    name,
    email,
    company,
    role,
    what_you_sell,
    team_size,
    current_stack,
    win_rate,
    deal_profile,
    team_experience,
    trigger,
    notes,
    utm_source,
    utm_campaign,
    utm_medium,
  } = parsed.data;

  // 4. Insert
  const { data, error } = await supabaseAdmin
    .from("pilot_signups")
    .insert({
      name,
      email: email.toLowerCase(),
      company,
      role: role || null,
      what_you_sell,
      team_size: team_size || null,
      current_stack: current_stack && current_stack.length > 0 ? current_stack : null,
      win_rate: win_rate || null,
      deal_profile: deal_profile || null,
      team_experience: team_experience || null,
      trigger: trigger || null,
      notes: notes || null,
      source: "pilot_page",
      utm_source: utm_source || null,
      utm_campaign: utm_campaign || null,
      utm_medium: utm_medium || null,
      user_agent: ua,
      ip_hash,
      status: "new",
    })
    .select("id")
    .single();

  // 23505 = duplicate email (unique violation). Treat as success.
  if (error && error.code !== "23505") {
    console.error("[pilot-signup] db insert failed:", error);
    return NextResponse.json(
      { ok: false, error: "db_insert_failed" },
      { status: 500 },
    );
  }

  // 5. Best-effort email — DB record is the source of truth.
  // Don't await long; fire-and-forget if it errors, just log.
  try {
    await sendPilotSignupNotification({
      name,
      email,
      company,
      role: role || null,
      what_you_sell,
      team_size: team_size || null,
      current_stack: current_stack || null,
      win_rate: win_rate || null,
      deal_profile: deal_profile || null,
      team_experience: team_experience || null,
      trigger: trigger || null,
      notes: notes || null,
    });
  } catch (emailErr) {
    console.error("[pilot-signup] email send threw:", emailErr);
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
