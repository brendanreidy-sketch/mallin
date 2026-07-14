/**
 * ============================================================================
 *  POST /api/notes — create a rep note (Mallin row + CRM sync)
 *  GET  /api/notes?opportunityId=… | accountId=… — list notes for a target
 * ============================================================================
 *
 *  Per write-through doctrine: the API persists the rep's contribution
 *  in Mallin's rep_notes table AND syncs to the customer's CRM via the
 *  provider-neutral lib/crm.createNote() boundary. Both happen in one
 *  request; the sync_status column reflects current state on the
 *  returned row so the cockpit can render Syncing / Synced / Pending
 *  retry / Failed without an extra poll.
 *
 *  Auth: Clerk session required. Tenant scope is derived from the
 *  Mallin record referenced by opportunity_id or account_id — we trust
 *  those FK rows to carry the right tenant_id.
 *
 *  Doctrine references:
 *    - memory:write_through_operating_layer.md
 *    - memory:write_through_surface_contract.md
 * ============================================================================
 */

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { supabaseAdmin } from "@/lib/db/client";
import {
  insertNote,
  listNotesForAccount,
  listNotesForOpportunity,
} from "@/lib/notes/repository";
import { syncNote } from "@/lib/notes/sync";
import type { CreateRepNoteInput } from "@/lib/notes/types";

// ─── POST /api/notes ──────────────────────────────────────────────────────

interface PostBody extends CreateRepNoteInput {
  // No additional fields; this mirrors CreateRepNoteInput verbatim. The
  // alias is here so the validation function below has a stable name to
  // assert against.
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  let payload: PostBody;
  try {
    payload = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const validation = validateCreateInput(payload);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.reason },
      { status: 400 },
    );
  }

  // Resolve tenant_id from the referenced Mallin record. Either an opp
  // or an account is required (validated above); we look it up to find
  // the canonical tenant_id rather than trust the client to send it.
  const tenantId = await resolveTenantId(payload);
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "target_not_found" },
      { status: 404 },
    );
  }

  // Capture the rep's email for CRM author attribution (some providers
  // want an email rather than an internal ID to set the activity owner).
  const user = await currentUser().catch(() => null);
  const primaryEmail =
    user?.emailAddresses?.find((e) => e.id === user?.primaryEmailAddressId)
      ?.emailAddress ?? null;

  // 1) Persist the rep's contribution in Mallin (sync_status = 'pending').
  let note;
  try {
    note = await insertNote({
      tenantId,
      input: payload,
      createdByUserId: userId,
      createdByEmail: primaryEmail,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "insert_failed";
    return NextResponse.json(
      { ok: false, error: "persistence_failed", detail },
      { status: 500 },
    );
  }

  // 2) Sync to CRM through the neutral boundary. syncNote() updates
  //    sync_status in-place. The note we return below reflects the
  //    terminal state of that transition (synced / pending-retry /
  //    failed) — the rep sees it without a follow-up fetch.
  const synced = await syncNote(note);

  return NextResponse.json({ ok: true, note: synced });
}

function validateCreateInput(input: PostBody): { ok: true } | { ok: false; reason: string } {
  if (typeof input.body !== "string" || input.body.trim().length === 0) {
    return { ok: false, reason: "body is required" };
  }
  if (input.body.length > 8000) {
    return { ok: false, reason: "body too long (max 8000)" };
  }
  if (input.attach_to !== "deal" && input.attach_to !== "account") {
    return { ok: false, reason: "attach_to must be 'deal' or 'account'" };
  }
  if (input.attach_to === "deal" && !input.opportunity_id) {
    return { ok: false, reason: "opportunity_id is required when attach_to='deal'" };
  }
  if (input.attach_to === "account" && !input.account_id) {
    return { ok: false, reason: "account_id is required when attach_to='account'" };
  }
  return { ok: true };
}

async function resolveTenantId(payload: PostBody): Promise<string | null> {
  if (payload.attach_to === "deal" && payload.opportunity_id) {
    const { data } = await supabaseAdmin
      .from("opportunities")
      .select("tenant_id")
      .eq("id", payload.opportunity_id)
      .maybeSingle();
    return data?.tenant_id ?? null;
  }
  if (payload.attach_to === "account" && payload.account_id) {
    const { data } = await supabaseAdmin
      .from("accounts")
      .select("tenant_id")
      .eq("id", payload.account_id)
      .maybeSingle();
    return data?.tenant_id ?? null;
  }
  return null;
}

// ─── GET /api/notes?opportunityId=… | accountId=… ────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const opportunityId = url.searchParams.get("opportunityId");
  const accountId = url.searchParams.get("accountId");

  if (!opportunityId && !accountId) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_query",
        detail: "Provide ?opportunityId=… or ?accountId=…",
      },
      { status: 400 },
    );
  }

  // Resolve tenant from the referenced record (same pattern as POST).
  let tenantId: string | null = null;
  if (opportunityId) {
    const { data } = await supabaseAdmin
      .from("opportunities")
      .select("tenant_id")
      .eq("id", opportunityId)
      .maybeSingle();
    tenantId = data?.tenant_id ?? null;
  } else if (accountId) {
    const { data } = await supabaseAdmin
      .from("accounts")
      .select("tenant_id")
      .eq("id", accountId)
      .maybeSingle();
    tenantId = data?.tenant_id ?? null;
  }
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "target_not_found" },
      { status: 404 },
    );
  }

  try {
    const notes = opportunityId
      ? await listNotesForOpportunity(tenantId, opportunityId)
      : await listNotesForAccount(tenantId, accountId!);
    return NextResponse.json({ ok: true, notes });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "list_failed";
    return NextResponse.json(
      { ok: false, error: "list_failed", detail },
      { status: 500 },
    );
  }
}
