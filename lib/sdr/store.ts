/**
 * SDR runtime persistence (migration 021). The agent's memory + ledger:
 * conversations, transcript, the audit trail of actions, and leads.
 *
 * supabaseAdmin CRUD — same pattern as the rest of the app. Tenant-scoped.
 */
import { supabaseAdmin } from "@/lib/db/client";
import type {
  AuditEntry,
  ConversationTurn,
  QualificationState,
  TriageDecision,
} from "./types";

export async function createConversation(tenantId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("sdr_conversations")
    .insert({ tenant_id: tenantId })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createConversation failed: ${error?.message}`);
  return data.id as string;
}

export async function loadMessages(conversationId: string): Promise<ConversationTurn[]> {
  const { data, error } = await supabaseAdmin
    .from("sdr_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`loadMessages failed: ${error.message}`);
  return (data ?? []).map((m) => ({ role: m.role as "prospect" | "agent", content: m.content }));
}

export async function appendMessage(
  conversationId: string,
  tenantId: string,
  role: "prospect" | "agent",
  content: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("sdr_messages")
    .insert({ conversation_id: conversationId, tenant_id: tenantId, role, content });
  if (error) throw new Error(`appendMessage failed: ${error.message}`);
}

export async function saveConversationState(
  conversationId: string,
  triage: TriageDecision,
  state: QualificationState,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("sdr_conversations")
    .update({ triage, state, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) throw new Error(`saveConversationState failed: ${error.message}`);
}

export async function logAction(
  conversationId: string,
  tenantId: string,
  entry: AuditEntry,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("sdr_actions")
    .insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      tool: entry.tool,
      input: entry.input,
      mode: entry.mode,
      status: entry.status,
      result: entry.result,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`logAction failed: ${error?.message}`);
  return data.id as string;
}

/** Prior actions on a conversation — feeds the agent's cross-turn memory. */
export async function loadActions(conversationId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("sdr_actions")
    .select("tool, input, mode, status, result")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`loadActions failed: ${error.message}`);
  return (data ?? []).map((a) => ({
    tool: a.tool,
    input: (a.input ?? {}) as Record<string, unknown>,
    mode: a.mode,
    status: a.status === "approved" ? "executed" : a.status,
    result: a.result ?? "",
  })) as AuditEntry[];
}

export interface PendingAction {
  id: string;
  conversation_id: string;
  tool: string;
  input: Record<string, unknown>;
  result: string;
  created_at: string;
}

export async function listPendingApprovals(tenantId: string): Promise<PendingAction[]> {
  const { data, error } = await supabaseAdmin
    .from("sdr_actions")
    .select("id, conversation_id, tool, input, result, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listPendingApprovals failed: ${error.message}`);
  return (data ?? []) as PendingAction[];
}

export async function getPendingAction(
  actionId: string,
  tenantId: string,
): Promise<PendingAction | null> {
  const { data } = await supabaseAdmin
    .from("sdr_actions")
    .select("id, conversation_id, tool, input, result, created_at")
    .eq("id", actionId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending_approval")
    .maybeSingle();
  return (data as PendingAction | null) ?? null;
}

export async function resolveAction(
  actionId: string,
  tenantId: string,
  status: "approved" | "denied",
  approvedBy: string,
  result: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("sdr_actions")
    .update({ status, approved_by: approvedBy, result, resolved_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`resolveAction failed: ${error.message}`);
}

export async function upsertLead(
  conversationId: string,
  tenantId: string,
  triage: TriageDecision,
  lead: unknown,
): Promise<void> {
  const { error } = await supabaseAdmin.from("sdr_leads").upsert(
    {
      conversation_id: conversationId,
      tenant_id: tenantId,
      triage,
      lead,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id" },
  );
  if (error) throw new Error(`upsertLead failed: ${error.message}`);
}

export interface NurtureCandidate {
  conversation_id: string;
  tenant_id: string;
  lead: Record<string, unknown> | null;
}

/** Nurture-band leads that haven't been touched in `idleDays`. */
export async function nurtureCandidates(idleDays: number): Promise<NurtureCandidate[]> {
  const cutoff = new Date(Date.now() - idleDays * 864e5).toISOString();
  const { data, error } = await supabaseAdmin
    .from("sdr_leads")
    .select("conversation_id, tenant_id, lead, last_nurture_at, updated_at")
    .eq("triage", "nurture")
    .or(`last_nurture_at.is.null,last_nurture_at.lt.${cutoff}`)
    .limit(100);
  if (error) throw new Error(`nurtureCandidates failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    conversation_id: r.conversation_id,
    tenant_id: r.tenant_id,
    lead: r.lead as Record<string, unknown> | null,
  }));
}

export async function markNurtured(conversationId: string): Promise<void> {
  await supabaseAdmin
    .from("sdr_leads")
    .update({ last_nurture_at: new Date().toISOString() })
    .eq("conversation_id", conversationId);
}
