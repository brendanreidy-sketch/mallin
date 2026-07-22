import { describe, it, expect, beforeEach, vi } from "vitest";

// Chainable Supabase stub that records every table + eq filter it sees.
const h = vi.hoisted(() => {
  const queried: string[] = [];
  const eqs: Array<[string, string, unknown]> = []; // [table, key, value]
  const rows: Record<string, unknown> = {};
  return { queried, eqs, rows };
});

vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: {
    from(table: string) {
      h.queried.push(table);
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (k: string, v: unknown) => {
          h.eqs.push([table, k, v]);
          return b;
        },
        maybeSingle: () => Promise.resolve({ data: h.rows[table] ?? null, error: null }),
      };
      return b;
    },
  },
}));

import { loadInternalBriefSources } from "./load-internal-brief-sources";

beforeEach(() => {
  h.queried.length = 0;
  h.eqs.length = 0;
  for (const k of Object.keys(h.rows)) delete h.rows[k];
});

function seedAll() {
  h.rows.opportunities = { id: "opp1", name: "Deal", stage_label: "Discovery", amount: 100, currency: "USD", close_date: "2026-10-01", last_activity_at: "2026-06-14T00:00:00Z", accounts: { name: "Acme" } };
  h.rows.account_intelligence_artifacts = { id: "intel1", artifact: { account: { name: "Acme" }, meeting: { date: "2026-06-12", attendees: [], agenda: [], quotes: [] } } };
  h.rows.execution_artifacts = { id: "exec1", artifact: { top_line: {} }, generated_at: "2026-06-15T00:00:00Z" };
}

describe("loadInternalBriefSources", () => {
  it("reads only opportunity + current intelligence + current execution — never raw transcripts", async () => {
    seedAll();
    const res = await loadInternalBriefSources("opp1", "tenantA");
    expect(res.ok).toBe(true);
    expect(h.queried.sort()).toEqual(["account_intelligence_artifacts", "execution_artifacts", "opportunities"]);
    expect(h.queried).not.toContain("deal_transcripts");
  });

  it("scopes every read to the tenant and the opportunity", async () => {
    seedAll();
    await loadInternalBriefSources("opp1", "tenantA");
    // Every table filtered by tenant_id = tenantA.
    for (const table of ["opportunities", "account_intelligence_artifacts", "execution_artifacts"]) {
      expect(h.eqs.some(([t, k, v]) => t === table && k === "tenant_id" && v === "tenantA")).toBe(true);
    }
    // Artifacts filtered by opportunity_id + is_current; opportunity by id.
    expect(h.eqs.some(([t, k, v]) => t === "opportunities" && k === "id" && v === "opp1")).toBe(true);
    for (const table of ["account_intelligence_artifacts", "execution_artifacts"]) {
      expect(h.eqs.some(([t, k, v]) => t === table && k === "opportunity_id" && v === "opp1")).toBe(true);
      expect(h.eqs.some(([t, k, v]) => t === table && k === "is_current" && v === true)).toBe(true);
    }
  });

  it("builds bundle coordinates from immutable source ids", async () => {
    seedAll();
    const res = await loadInternalBriefSources("opp1", "tenantA");
    if (!res.ok) throw new Error("expected ok");
    expect(res.sources.coords).toMatchObject({ opportunityId: "opp1", intelligenceArtifactId: "intel1", executionArtifactId: "exec1" });
  });

  it("returns required_artifact_missing when the current execution artifact is absent", async () => {
    h.rows.opportunities = { id: "opp1", name: "Deal", accounts: { name: "Acme" } };
    h.rows.account_intelligence_artifacts = { id: "intel1", artifact: { account: { name: "Acme" } } };
    // execution_artifacts left unseeded
    const res = await loadInternalBriefSources("opp1", "tenantA");
    expect(res).toEqual({ ok: false, code: "required_artifact_missing" });
  });

  it("returns deal_not_found when the opportunity row is absent", async () => {
    const res = await loadInternalBriefSources("opp1", "tenantA");
    expect(res).toEqual({ ok: false, code: "deal_not_found" });
  });
});
