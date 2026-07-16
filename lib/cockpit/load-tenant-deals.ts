/**
 * loadTenantDeals — the shared deals loader behind Home (/cockpit) and
 * Deals (/deals). Resolves the tenant from the Clerk org, loads every
 * opportunity, joins account + current-brief artifacts, and ranks them
 * through the priority engine into needs-you / on-track buckets.
 *
 * Returns a discriminated result so each page owns its own redirects
 * (no-tenant → empty state, no-deals → intake).
 */

import { supabaseAdmin } from "@/lib/db/client";
import { dealPriority } from "@/lib/cockpit/deal-priority";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

export interface Deal {
  id: string;
  name: string;
  accountName: string | null;
  domain: string | null;
  live: boolean;
  createdAt: string;
  needsYou: boolean;
  score: number;
  why: string;
  tone: "critical" | "caution" | "neutral";
}

export type TenantDeals =
  | { kind: "no-tenant" }
  | { kind: "no-deals" }
  | {
      kind: "ok";
      tenantId: string;
      tenantName: string | null;
      deals: Deal[];
      needsYou: Deal[];
      onTrack: Deal[];
    };

export async function loadTenantDeals(orgId: string): Promise<TenantDeals> {
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name")
    .eq("slug", orgId)
    .maybeSingle();
  if (!tenant) return { kind: "no-tenant" };

  const { data: opps } = await supabaseAdmin
    .from("opportunities")
    .select("id, name, account_id, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });
  if (!opps || opps.length === 0) return { kind: "no-deals" };

  const accountIds = [...new Set(opps.map((o) => o.account_id).filter(Boolean))];
  const oppIds = opps.map((o) => o.id);
  const [accountsRes, liveRes, intelRes] = await Promise.all([
    accountIds.length
      ? supabaseAdmin.from("accounts").select("id, name, domain").in("id", accountIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; domain: string | null }[] }),
    supabaseAdmin
      .from("execution_artifacts")
      .select("opportunity_id, artifact")
      .in("opportunity_id", oppIds)
      .eq("is_current", true),
    supabaseAdmin
      .from("account_intelligence_artifacts")
      .select("opportunity_id, artifact")
      .in("opportunity_id", oppIds)
      .eq("is_current", true),
  ]);
  const acctById = new Map((accountsRes.data ?? []).map((a) => [a.id, a]));
  const liveById = new Map(
    (liveRes.data ?? []).map((r) => [r.opportunity_id, r.artifact as PrepArtifact]),
  );
  const intelById = new Map(
    (intelRes.data ?? []).map((r) => [
      r.opportunity_id,
      r.artifact as AccountIntelligenceArtifact,
    ]),
  );

  const now = new Date();
  const deals: Deal[] = opps.map((o) => {
    const acct = o.account_id ? acctById.get(o.account_id) : null;
    const live = liveById.get(o.id) ?? null;
    const intel = intelById.get(o.id) ?? null;
    const name = o.name || acct?.name || "Untitled deal";
    const prio = dealPriority({ id: o.id, name, live, intel }, now);
    return {
      id: o.id,
      name,
      accountName: acct?.name ?? null,
      domain: acct?.domain ?? null,
      live: Boolean(live),
      createdAt: o.created_at as string,
      ...prio,
    };
  });

  const needsYou = deals.filter((d) => d.needsYou).sort((a, b) => b.score - a.score);
  const onTrack = deals.filter((d) => !d.needsYou);
  return { kind: "ok", tenantId: tenant.id, tenantName: tenant.name, deals, needsYou, onTrack };
}
