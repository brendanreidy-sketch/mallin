import { describe, it, expect, beforeEach, vi } from "vitest";

// Chainable Supabase stub. It records every table + eq filter, resolves either
// via .maybeSingle() (opportunity) or by being awaited directly (artifact list).
const h = vi.hoisted(() => {
  const queried: string[] = [];
  const eqs: Array<[string, string, unknown]> = [];
  const rows: Record<string, unknown> = {};
  return { queried, eqs, rows };
});

vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: {
    from(table: string) {
      h.queried.push(table);
      const result = () => Promise.resolve({ data: h.rows[table] ?? null, error: null });
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (k: string, v: unknown) => {
          h.eqs.push([table, k, v]);
          return b;
        },
        maybeSingle: () => result(),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => result().then(onF, onR),
      };
      return b;
    },
  },
}));

import { loadInternalBriefSources } from "./load-internal-brief-sources";

const OPP = { id: "opp1", name: "Deal", stage_label: "Discovery", amount: 100, currency: "USD", close_date: "2026-10-01", last_activity_at: "2026-06-14T00:00:00Z", accounts: { name: "Acme" } };
const INTEL = { id: "intel1", artifact: { account: { name: "Acme" }, meeting: { date: "2026-06-12", attendees: [], agenda: [], quotes: [] } } };
const EXEC = { id: "exec1", artifact: { top_line: {} }, generated_at: "2026-06-15T00:00:00Z" };

beforeEach(() => {
  h.queried.length = 0;
  h.eqs.length = 0;
  for (const k of Object.keys(h.rows)) delete h.rows[k];
});
function seedAll() {
  h.rows.opportunities = OPP;
  h.rows.account_intelligence_artifacts = [INTEL];
  h.rows.execution_artifacts = [EXEC];
}

describe("loadInternalBriefSources — reads", () => {
  it("reads only opportunity + current intelligence + current execution — never raw transcripts", async () => {
    seedAll();
    const res = await loadInternalBriefSources("opp1", "tenantA");
    expect(res.ok).toBe(true);
    expect([...new Set(h.queried)].sort()).toEqual(["account_intelligence_artifacts", "execution_artifacts", "opportunities"]);
    expect(h.queried).not.toContain("deal_transcripts");
  });

  it("scopes every read to the tenant and the opportunity", async () => {
    seedAll();
    await loadInternalBriefSources("opp1", "tenantA");
    for (const table of ["opportunities", "account_intelligence_artifacts", "execution_artifacts"]) {
      expect(h.eqs.some(([t, k, v]) => t === table && k === "tenant_id" && v === "tenantA")).toBe(true);
    }
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
});

describe("loadInternalBriefSources — current-record cardinality (fail closed)", () => {
  it("deal_not_found when the opportunity is absent", async () => {
    expect(await loadInternalBriefSources("opp1", "tenantA")).toEqual({ ok: false, code: "deal_not_found" });
  });

  it("required_artifact_missing when ZERO current intelligence rows", async () => {
    h.rows.opportunities = OPP;
    h.rows.account_intelligence_artifacts = [];
    h.rows.execution_artifacts = [EXEC];
    expect(await loadInternalBriefSources("opp1", "tenantA")).toEqual({ ok: false, code: "required_artifact_missing" });
  });

  it("required_artifact_missing when ZERO current execution rows", async () => {
    h.rows.opportunities = OPP;
    h.rows.account_intelligence_artifacts = [INTEL];
    h.rows.execution_artifacts = [];
    expect(await loadInternalBriefSources("opp1", "tenantA")).toEqual({ ok: false, code: "required_artifact_missing" });
  });

  it("ok when EXACTLY ONE of each current artifact", async () => {
    seedAll();
    expect((await loadInternalBriefSources("opp1", "tenantA")).ok).toBe(true);
  });

  it("current_artifact_conflict when MULTIPLE current intelligence rows", async () => {
    h.rows.opportunities = OPP;
    h.rows.account_intelligence_artifacts = [INTEL, { ...INTEL, id: "intel2" }];
    h.rows.execution_artifacts = [EXEC];
    expect(await loadInternalBriefSources("opp1", "tenantA")).toEqual({ ok: false, code: "current_artifact_conflict" });
  });

  it("current_artifact_conflict when MULTIPLE current execution rows", async () => {
    h.rows.opportunities = OPP;
    h.rows.account_intelligence_artifacts = [INTEL];
    h.rows.execution_artifacts = [EXEC, { ...EXEC, id: "exec2" }];
    expect(await loadInternalBriefSources("opp1", "tenantA")).toEqual({ ok: false, code: "current_artifact_conflict" });
  });
});
