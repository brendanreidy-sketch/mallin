import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// The route is now an ENQUEUE endpoint: authenticate → validate → authorize →
// fast-fail on missing artifacts → enqueue a brief_jobs row → 202 { jobId }.
// The model pipeline runs in the cron worker (tested via lib/deck/brief-jobs).
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getCurrentTenantId: vi.fn(),
  checkOpportunityAccess: vi.fn(),
  loadInternalBriefSources: vi.fn(),
  enqueueBriefJob: vi.fn(),
  isInternalBriefEnabledForTenant: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantId: m.getCurrentTenantId }));
vi.mock("@/lib/auth/opportunity-access", () => ({ checkOpportunityAccess: m.checkOpportunityAccess }));
vi.mock("@/lib/deck/load-internal-brief-sources", () => ({ loadInternalBriefSources: m.loadInternalBriefSources }));
vi.mock("@/lib/deck/brief-jobs", () => ({ enqueueBriefJob: m.enqueueBriefJob }));
vi.mock("@/lib/deck/internal-brief-access", () => ({ isInternalBriefEnabledForTenant: m.isInternalBriefEnabledForTenant }));

import * as route from "./route";

const VALID = "11111111-1111-4111-8111-111111111111";
const post = (body: string) => route.POST(new NextRequest("http://localhost/api/internal-brief", { method: "POST", body }));
const postDeal = (dealId: string) => post(JSON.stringify({ dealId }));

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ userId: "user_1" });
  m.getCurrentTenantId.mockResolvedValue("tenantA");
  m.checkOpportunityAccess.mockResolvedValue({ ok: true, opportunityId: "deal", tenantId: "tenantA" });
  m.loadInternalBriefSources.mockResolvedValue({ ok: true, sources: { opportunity: { name: "Deal" }, companyName: "Co" } });
  m.enqueueBriefJob.mockResolvedValue({ jobId: "11111111-1111-4111-8111-aaaaaaaaaaaa", status: "queued", reused: false });
  m.isInternalBriefEnabledForTenant.mockReturnValue(true); // allowlisted by default
});

async function json(res: Response): Promise<{ ok: boolean; error?: string; jobId?: string; status?: string }> {
  return (await res.json()) as { ok: boolean; error?: string; jobId?: string; status?: string };
}

describe("POST /api/internal-brief — method & validation", () => {
  it("does not expose a GET generator", () => {
    expect((route as Record<string, unknown>).GET).toBeUndefined();
  });

  it("rejects malformed JSON with 400 and no DB access", async () => {
    const res = await post("not-json");
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_request");
    expect(m.checkOpportunityAccess).not.toHaveBeenCalled();
    expect(m.loadInternalBriefSources).not.toHaveBeenCalled();
    expect(m.enqueueBriefJob).not.toHaveBeenCalled();
  });

  it("rejects a malformed UUID with 400 and no DB access (no character stripping)", async () => {
    const res = await postDeal("../etc/passwd");
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_deal_id");
    expect(m.auth).not.toHaveBeenCalled();
    expect(m.enqueueBriefJob).not.toHaveBeenCalled();
  });
});

describe("POST /api/internal-brief — access & isolation", () => {
  it("returns 401 when unauthenticated and never enqueues", async () => {
    m.auth.mockResolvedValue({ userId: null });
    const res = await postDeal(VALID);
    expect(res.status).toBe(401);
    expect(m.loadInternalBriefSources).not.toHaveBeenCalled();
    expect(m.enqueueBriefJob).not.toHaveBeenCalled();
  });

  it("returns 401 when no tenant resolves", async () => {
    m.getCurrentTenantId.mockRejectedValue(new Error("no org"));
    expect((await postDeal(VALID)).status).toBe(401);
    expect(m.enqueueBriefJob).not.toHaveBeenCalled();
  });

  it("returns 403 on cross-tenant access — and never loads sources or enqueues", async () => {
    m.checkOpportunityAccess.mockResolvedValue({ ok: false, reason: "wrong_tenant" });
    const res = await postDeal(VALID);
    expect(res.status).toBe(403);
    expect((await json(res)).error).toBe("forbidden");
    expect(m.loadInternalBriefSources).not.toHaveBeenCalled();
    expect(m.enqueueBriefJob).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown authorized deal", async () => {
    m.checkOpportunityAccess.mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await postDeal(VALID)).status).toBe(404);
  });

  it("grants no access from a customer share token in the body", async () => {
    m.auth.mockResolvedValue({ userId: null });
    const res = await post(JSON.stringify({ dealId: VALID, token: "customer-share-token" }));
    expect(res.status).toBe(401); // token is ignored entirely
    expect(m.checkOpportunityAccess).not.toHaveBeenCalled();
  });
});

describe("POST /api/internal-brief — rollout gate (independent of UI)", () => {
  it("non-allowlisted tenant → 404 feature_not_available, private headers, no downstream work", async () => {
    m.isInternalBriefEnabledForTenant.mockReturnValue(false);
    const res = await postDeal(VALID);
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ ok: false, error: "feature_not_available" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    // Gate is enforced BEFORE any opportunity lookup / access / enqueue.
    expect(m.checkOpportunityAccess).not.toHaveBeenCalled();
    expect(m.loadInternalBriefSources).not.toHaveBeenCalled();
    expect(m.enqueueBriefJob).not.toHaveBeenCalled();
  });

  it("evaluates the gate with the resolved tenant id", async () => {
    await postDeal(VALID);
    expect(m.isInternalBriefEnabledForTenant).toHaveBeenCalledWith("tenantA");
  });

  it("gate precedes access — a non-allowlisted tenant cannot distinguish a real vs missing deal", async () => {
    m.isInternalBriefEnabledForTenant.mockReturnValue(false);
    m.checkOpportunityAccess.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await postDeal(VALID);
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("feature_not_available"); // NOT deal_not_found
    expect(m.checkOpportunityAccess).not.toHaveBeenCalled();
  });

  it("allowlisted tenant preserves existing enqueue behavior (gate transparent)", async () => {
    const res = await postDeal(VALID);
    expect(res.status).toBe(202);
    expect(m.enqueueBriefJob).toHaveBeenCalledWith({ tenantId: "tenantA", dealId: VALID, userId: "user_1" });
  });
});

describe("POST /api/internal-brief — fast-fail preflight (before enqueue)", () => {
  const cases: Array<[string, unknown, number, string]> = [
    ["required_artifact_missing", { ok: false, code: "required_artifact_missing" }, 409, "required_artifact_missing"],
    ["current_artifact_conflict", { ok: false, code: "current_artifact_conflict" }, 409, "current_artifact_conflict"],
    ["deal_not_found from loader", { ok: false, code: "deal_not_found" }, 404, "deal_not_found"],
  ];
  for (const [name, loadResult, status, error] of cases) {
    it(`maps loader ${name} → ${status} and does NOT enqueue`, async () => {
      m.loadInternalBriefSources.mockResolvedValue(loadResult);
      const res = await postDeal(VALID);
      expect(res.status).toBe(status);
      expect((await json(res)).error).toBe(error);
      expect(m.enqueueBriefJob).not.toHaveBeenCalled();
    });
  }
});

describe("POST /api/internal-brief — enqueue", () => {
  it("enqueues after authorization + preflight and returns 202 { jobId } with private headers", async () => {
    const res = await postDeal(VALID);
    expect(res.status).toBe(202);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.jobId).toBe("11111111-1111-4111-8111-aaaaaaaaaaaa");
    expect(body.status).toBe("queued");
    expect(m.checkOpportunityAccess).toHaveBeenCalledWith(VALID, "tenantA");
    expect(m.loadInternalBriefSources).toHaveBeenCalledWith(VALID, "tenantA");
    expect(m.enqueueBriefJob).toHaveBeenCalledWith({ tenantId: "tenantA", dealId: VALID, userId: "user_1" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns the in-flight job (reused) — also 202, no duplicate", async () => {
    m.enqueueBriefJob.mockResolvedValue({ jobId: "22222222-2222-4222-8222-bbbbbbbbbbbb", status: "running", reused: true });
    const res = await postDeal(VALID);
    expect(res.status).toBe(202);
    const body = await json(res);
    expect(body.jobId).toBe("22222222-2222-4222-8222-bbbbbbbbbbbb");
    expect(body.status).toBe("running");
  });

  it("maps an enqueue failure → 500 enqueue_failed with private headers, no leak", async () => {
    m.enqueueBriefJob.mockRejectedValue(new Error("db down"));
    const res = await postDeal(VALID);
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: "enqueue_failed" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  });
});
