/**
 * ============================================================================
 *  /api/sf/confirm-match — substrate ↔ SF link CRUD
 * ============================================================================
 *
 *  POST /api/sf/confirm-match           Body: { dealId, sfOppId, notes?, replace? }
 *  DELETE /api/sf/confirm-match?dealId  Soft-unlinks active link
 *  GET  /api/sf/confirm-match?dealId    Returns active link + history
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. NO SALESFORCE WRITES.                                        ║
 *  ║     This route writes to the substrate (sf_opportunity_links     ║
 *  ║     table) only. Salesforce is never touched.                    ║
 *  ║                                                                  ║
 *  ║  2. ONE ACTIVE LINK per substrate deal — DB-enforced via the     ║
 *  ║     partial unique index. Replace requires explicit replace=true.║
 *  ║                                                                  ║
 *  ║  3. SOFT DELETE — DELETE sets unlinked_at, doesn't hard-remove   ║
 *  ║     the row. Audit history is permanent.                         ║
 *  ║                                                                  ║
 *  ║  4. PRODUCTION-GUARDED. 403 in prod unless SF_DEBUG_ENABLED=true.║
 *  ╚══════════════════════════════════════════════════════════════════╝
 * ============================================================================
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import {
  confirmLink,
  unlinkDeal,
  getActiveLinkForDeal,
  getLinkHistoryForDeal,
} from "@/lib/sf-diff/links";
import { getConnection } from "@/lib/adapters/salesforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidSalesforceId(id: string): boolean {
  return /^[A-Za-z0-9]{15}$|^[A-Za-z0-9]{18}$/.test(id);
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

function denyIfProdLocked() {
  const access = checkSfDebugAccess();
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "debug_disabled_in_production",
        message: access.reason,
      },
      { status: 403 },
    );
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// GET — read active link + history
// ────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const guard = denyIfProdLocked();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId")?.trim();
  if (!dealId || !isValidUuid(dealId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_dealId", message: "dealId must be a UUID" },
      { status: 400 },
    );
  }

  const [active, history] = await Promise.all([
    getActiveLinkForDeal(dealId),
    getLinkHistoryForDeal(dealId),
  ]);

  return NextResponse.json({
    ok: true,
    writes_performed: false,
    active_link: active,
    history,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// POST — create or confirm a link (idempotent)
// ────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = denyIfProdLocked();
  if (guard) return guard;

  let body: {
    dealId?: string;
    sfOppId?: string;
    notes?: string;
    replace?: boolean;
    confirmedBy?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const dealId = body.dealId?.trim();
  const sfOppId = body.sfOppId?.trim();
  if (!dealId || !isValidUuid(dealId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_dealId", message: "dealId must be a UUID" },
      { status: 400 },
    );
  }
  if (!sfOppId || !isValidSalesforceId(sfOppId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_sfOppId",
        message: "sfOppId must be a 15- or 18-char Salesforce Id",
      },
      { status: 400 },
    );
  }

  // Capture the SF instance URL at confirmation time. Orgs can move,
  // and the link audit row should record where the link was made.
  let sfInstanceUrl = "";
  try {
    const conn = await getConnection();
    sfInstanceUrl = String(conn.instanceUrl ?? "");
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "sf_connection_failed",
        message: (e as Error).message,
      },
      { status: 500 },
    );
  }

  const result = await confirmLink({
    dealId,
    sfOppId,
    sfInstanceUrl,
    confirmedBy: body.confirmedBy ?? null,
    notes: body.notes ?? null,
    replace: !!body.replace,
  });

  if (!result.ok) {
    if (result.error === "deal_not_found") {
      return NextResponse.json(result, { status: 404 });
    }
    if (result.error === "different_link_active") {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    writes_performed: false, // wrote to substrate, not SF
    substrate_writes_performed: true,
    salesforce_writes_performed: false,
    created: result.created,
    replaced: result.replaced,
    link: result.link,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE — soft-unlink active link
// ────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const guard = denyIfProdLocked();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId")?.trim();
  if (!dealId || !isValidUuid(dealId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_dealId", message: "dealId must be a UUID" },
      { status: 400 },
    );
  }

  const result = await unlinkDeal(dealId);
  if (!result.ok) {
    if (result.error === "no_active_link") {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    writes_performed: false,
    substrate_writes_performed: true,
    salesforce_writes_performed: false,
    unlinked: result.unlinked,
  });
}
