/**
 * POST /api/instrument
 *
 * Lightweight behavioral event sink for the demo cockpit. Receives
 * batched events from CockpitInstrumentation and writes them to the
 * cockpit_events table — but ONLY for tenants where is_demo=true.
 * Real tenants are not instrumented.
 *
 * The intent is observational learning for the first design-partner
 * sessions (Gianna, then 2-3 more). Reviewed manually via SQL; never
 * exposed as a dashboard. See memory: approval_emotional_contract.md
 * + operating_loop.md for the strategic frame.
 *
 * Event types accepted:
 *   - first_scroll       — fired once per session on first scroll
 *   - pdf_visible        — Primary Decision Focus block entered viewport
 *   - pdf_hidden         — PDF block left viewport
 *   - pattern_toggle     — "Pattern observed across the corpus" expanded/collapsed
 *   - attribution_hover  — cursor lingered > 1s on an evidence attribution line
 *
 * Failure mode: always returns 200 (this is observation, not gating).
 * A failed write logs but does not surface to the user.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/db/client";
import { getCurrentTenant } from "@/lib/auth/tenant-context";

interface IncomingEvent {
  event_type: string;
  event_data?: Record<string, unknown>;
  ms_since_load?: number;
  session_id: string;
}

const ALLOWED_TYPES = new Set([
  "first_scroll",
  "pdf_visible",
  "pdf_hidden",
  "pattern_toggle",
  "attribution_hover",
]);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      // Unauth = ignore quietly. Demo flows are auth-gated; this is
      // defense-in-depth only.
      return NextResponse.json({ ok: true, recorded: 0 });
    }

    const tenant = await getCurrentTenant();
    if (!tenant.is_demo) {
      // Real tenants are not instrumented. Return ok so client code
      // doesn't need to know which kind of tenant it's in.
      return NextResponse.json({ ok: true, recorded: 0 });
    }

    const body = (await req.json()) as { events?: IncomingEvent[] };
    const events = body.events ?? [];
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ ok: true, recorded: 0 });
    }

    // Defensive: filter to known event types, cap at 100 per request,
    // never trust client-provided fields beyond what's in the schema.
    const rows = events
      .filter((e) => e && ALLOWED_TYPES.has(e.event_type))
      .slice(0, 100)
      .map((e) => ({
        tenant_id: tenant.id,
        user_id: userId,
        session_id: String(e.session_id ?? "").slice(0, 64),
        event_type: e.event_type,
        event_data: e.event_data ?? {},
        ms_since_load:
          typeof e.ms_since_load === "number" && Number.isFinite(e.ms_since_load)
            ? Math.max(0, Math.floor(e.ms_since_load))
            : null,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, recorded: 0 });
    }

    const { error } = await supabaseAdmin.from("cockpit_events").insert(rows);
    if (error) {
      console.warn("[/api/instrument] insert failed:", error.message);
      return NextResponse.json({ ok: true, recorded: 0 });
    }

    return NextResponse.json({ ok: true, recorded: rows.length });
  } catch (err) {
    // Never gate on instrumentation errors.
    console.warn(
      "[/api/instrument] unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ ok: true, recorded: 0 });
  }
}
