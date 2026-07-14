import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
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
 * POST /api/sdr/chat — one persisted SDR turn. The runtime behind the (future)
 * chat widget: load conversation + prior actions (memory), run the agentic
 * loop (real effects), persist the reply, the audit trail, lead, and state.
 *
 * Self-auths; in middleware isPublicRoute (the cached-404 trap). Tenant-scoped.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  const config = await loadSdrConfig(tenantId);
  if (!config || !config.offering) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }
  if (!(await hasSdrAccess(tenantId))) {
    return NextResponse.json({ error: "not_enabled" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { conversationId?: string; message?: string }
    | null;
  const message = (body?.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "message_required" }, { status: 400 });

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

    return NextResponse.json({
      conversationId,
      reply: turn.reply,
      triage: turn.triage,
      actions: turn.actions,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "agent_failed", detail: (e as Error).message.slice(0, 200) },
      { status: 500 },
    );
  }
}
