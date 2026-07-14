import { NextResponse, type NextRequest } from "next/server";
import { loadSdrConfig } from "@/lib/sdr/config-store";
import { hasSdrAccess } from "@/lib/sdr/entitlement";
import { sdrRespond } from "@/lib/sdr/sdr-agent";
import {
  appendMessage,
  createConversation,
  loadActions,
  loadMessages,
  logAction,
  saveConversationState,
  upsertLead,
} from "@/lib/sdr/store";

/**
 * POST /api/sdr/widget/chat — the PUBLIC entry the embedded widget calls.
 *
 * Unlike /api/sdr/chat, the caller is an anonymous website visitor, NOT a
 * signed-in Mallin user. The tenant is identified by `key` (the tenant id in
 * the embed snippet) instead of a Clerk session. In middleware isPublicRoute.
 *
 * Effects run for REAL (no dryRun). NOTE (hardening follow-up): add rate
 * limiting + a rotatable public key — today the key is the tenant uuid
 * (unguessable, but not revocable).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { key?: string; conversationId?: string; message?: string }
    | null;
  const key = (body?.key ?? "").trim();
  const message = (body?.message ?? "").trim();
  if (!UUID.test(key)) return NextResponse.json({ error: "bad_key" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "message_required" }, { status: 400 });

  const tenantId = key;
  const config = await loadSdrConfig(tenantId);
  if (!config || !config.offering) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }
  // Entitlement gate — the public runtime is where the cost lives, so a
  // lapsed/unentitled tenant's widget must stop here (paid, sales-led).
  if (!(await hasSdrAccess(tenantId))) {
    return NextResponse.json({ error: "not_enabled" }, { status: 403 });
  }

  const conversationId = body?.conversationId ?? (await createConversation(tenantId));
  await appendMessage(conversationId, tenantId, "prospect", message);
  const history = await loadMessages(conversationId);
  const priorActions = await loadActions(conversationId);

  try {
    const { turn } = await sdrRespond(config, history, { priorActions, tenantId });
    await appendMessage(conversationId, tenantId, "agent", turn.reply);
    await saveConversationState(conversationId, turn.triage, turn.state);
    for (const a of turn.actions) await logAction(conversationId, tenantId, a);
    if (turn.triage !== "qualifying") {
      await upsertLead(conversationId, tenantId, turn.triage, turn.state.lead);
    }
    // Only the reply is public — never leak triage/state/actions to the visitor.
    return NextResponse.json({ conversationId, reply: turn.reply });
  } catch (e) {
    return NextResponse.json(
      { error: "agent_failed", detail: (e as Error).message.slice(0, 120) },
      { status: 500 },
    );
  }
}
