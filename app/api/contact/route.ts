/**
 * POST /api/contact
 *
 * Public endpoint (no auth) for the /contact form. Stores the row in
 * contact_messages, then fires a best-effort notification email to
 * brendan@mallin.io via Resend.
 *
 * Pattern mirrors /api/pilot-signup. See that file for the long-form
 * notes on safety (Zod, honeypot, best-effort email).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/db/client";
import { sendContactNotification } from "@/lib/email/resend";

const ContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Valid email required").max(200),
  message: z.string().trim().min(1, "Message is required").max(4000),
  utm_source: z.string().trim().max(120).optional(),
  utm_campaign: z.string().trim().max(120).optional(),
  utm_medium: z.string().trim().max(120).optional(),
  // Honeypot — must be empty (bots fill, humans don't see).
  hp_field: z.string().max(0).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = ContactSchema.safeParse(raw);
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

  const { name, email, message, utm_source, utm_campaign, utm_medium } =
    parsed.data;

  const { data, error } = await supabaseAdmin
    .from("contact_messages")
    .insert({
      name,
      email: email.toLowerCase(),
      message,
      source: "contact_page",
      utm_source: utm_source || null,
      utm_campaign: utm_campaign || null,
      utm_medium: utm_medium || null,
      user_agent: ua,
      ip_hash,
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[contact] db insert failed:", error);
    return NextResponse.json(
      { ok: false, error: "db_insert_failed" },
      { status: 500 },
    );
  }

  // Best-effort email — DB record is the source of truth.
  try {
    await sendContactNotification({ name, email, message });
  } catch (emailErr) {
    console.error("[contact] email send threw:", emailErr);
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
