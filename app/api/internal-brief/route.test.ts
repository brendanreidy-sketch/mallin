import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getCurrentTenantId: vi.fn(),
  checkOpportunityAccess: vi.fn(),
  loadInternalBriefSources: vi.fn(),
  generateInternalBrief: vi.fn(),
  createSonnetBriefClient: vi.fn(() => ({})),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/auth/tenant-context", () => ({ getCurrentTenantId: m.getCurrentTenantId }));
vi.mock("@/lib/auth/opportunity-access", () => ({ checkOpportunityAccess: m.checkOpportunityAccess }));
vi.mock("@/lib/deck/load-internal-brief-sources", () => ({ loadInternalBriefSources: m.loadInternalBriefSources }));
vi.mock("@/lib/deck/generate-internal-brief", () => ({
  generateInternalBrief: m.generateInternalBrief,
  createSonnetBriefClient: m.createSonnetBriefClient,
  DEFAULT_BRIEF_MODEL: "claude-sonnet-4-5",
}));

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
  m.generateInternalBrief.mockResolvedValue({ ok: true, buffer: Buffer.from("PK\x03\x04fake"), filename: "deal-internal-brief-abc123def456.pptx", bundleVersion: "abc123def456", modelId: "claude-sonnet-4-5", diagnostics: [] });
});

async function json(res: Response): Promise<{ ok: boolean; error?: string }> {
  return (await res.json()) as { ok: boolean; error?: string };
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
  });

  it("rejects a malformed UUID with 400 and no DB access (no character stripping)", async () => {
    const res = await postDeal("../etc/passwd");
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_deal_id");
    expect(m.auth).not.toHaveBeenCalled();
    expect(m.checkOpportunityAccess).not.toHaveBeenCalled();
    expect(m.loadInternalBriefSources).not.toHaveBeenCalled();
  });
});

describe("POST /api/internal-brief — access & isolation", () => {
  it("returns 401 when unauthenticated", async () => {
    m.auth.mockResolvedValue({ userId: null });
    const res = await postDeal(VALID);
    expect(res.status).toBe(401);
    expect(m.loadInternalBriefSources).not.toHaveBeenCalled();
  });

  it("returns 401 when no tenant resolves", async () => {
    m.getCurrentTenantId.mockRejectedValue(new Error("no org"));
    expect((await postDeal(VALID)).status).toBe(401);
  });

  it("returns 403 on cross-tenant access — and never loads sources", async () => {
    m.checkOpportunityAccess.mockResolvedValue({ ok: false, reason: "wrong_tenant" });
    const res = await postDeal(VALID);
    expect(res.status).toBe(403);
    expect((await json(res)).error).toBe("forbidden");
    expect(m.loadInternalBriefSources).not.toHaveBeenCalled();
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

  it("loads sources only after successful authorization, and passes tenant + deal", async () => {
    await postDeal(VALID);
    expect(m.checkOpportunityAccess).toHaveBeenCalledWith(VALID, "tenantA");
    expect(m.loadInternalBriefSources).toHaveBeenCalledWith(VALID, "tenantA");
  });
});

describe("POST /api/internal-brief — failure mapping (safe, private)", () => {
  const cases: Array<[string, unknown, number, string]> = [
    ["required_artifact_missing", { ok: false, code: "required_artifact_missing" }, 409, "required_artifact_missing"],
    ["current_artifact_conflict", { ok: false, code: "current_artifact_conflict" }, 409, "current_artifact_conflict"],
    ["deal_not_found from loader", { ok: false, code: "deal_not_found" }, 404, "deal_not_found"],
  ];
  for (const [name, loadResult, status, error] of cases) {
    it(`maps loader ${name} → ${status}`, async () => {
      m.loadInternalBriefSources.mockResolvedValue(loadResult);
      const res = await postDeal(VALID);
      expect(res.status).toBe(status);
      expect((await json(res)).error).toBe(error);
    });
  }

  const genCases: Array<[string, number]> = [
    ["brief_failed_validation", 422],
    ["model_generation_failed", 502],
    ["brief_render_failed", 500],
  ];
  for (const [code, status] of genCases) {
    it(`maps generation ${code} → ${status} with no evidence in the body`, async () => {
      m.generateInternalBrief.mockResolvedValue({ ok: false, code });
      const res = await postDeal(VALID);
      expect(res.status).toBe(status);
      const body = await json(res);
      expect(body).toEqual({ ok: false, error: code }); // nothing else leaks
      expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    });
  }
});

describe("POST /api/internal-brief — success", () => {
  it("streams a private, no-store attachment with a bundle-versioned filename", async () => {
    const res = await postDeal(VALID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain('attachment; filename="deal-internal-brief-abc123def456.pptx"');
    expect(cd).toContain("filename*=UTF-8''");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("Pragma")).toBe("no-cache");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

describe("POST /api/internal-brief — narrow concurrency guard (per-instance)", () => {
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const OK = { ok: true as const, buffer: Buffer.from("PK\x03\x04"), filename: "f.pptx", bundleVersion: "v", modelId: "claude-sonnet-4-6", diagnostics: [] };
  const tick = () => new Promise((r) => setTimeout(r, 15));

  it("returns 429 generation_in_progress with private headers, and makes NO second model call", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => { release = r; });
    m.generateInternalBrief.mockReturnValueOnce(pending.then(() => OK)).mockResolvedValue(OK);

    const p1 = postDeal(VALID);
    await tick();
    const r2 = await postDeal(VALID);
    expect(r2.status).toBe(429);
    expect((await json(r2)).error).toBe("generation_in_progress");
    expect(r2.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(m.generateInternalBrief).toHaveBeenCalledTimes(1); // duplicate never reached the model

    release();
    expect((await p1).status).toBe(200);
  });

  it("allows a new request after the first SUCCEEDS (finally released the key)", async () => {
    expect((await postDeal(VALID)).status).toBe(200);
    expect((await postDeal(VALID)).status).toBe(200);
  });

  it("allows a new request after the first FAILS (result) — key not permanently blocked", async () => {
    m.generateInternalBrief.mockResolvedValueOnce({ ok: false, code: "brief_render_failed" });
    expect((await postDeal(VALID)).status).toBe(500);
    expect((await postDeal(VALID)).status).toBe(200); // retry allowed
  });

  it("allows a new request after the first THROWS (finally runs on the catch path)", async () => {
    m.loadInternalBriefSources.mockRejectedValueOnce(new Error("db down"));
    expect((await postDeal(VALID)).status).toBe(500);
    expect((await postDeal(VALID)).status).toBe(200);
  });

  it("does not block a different deal while one is in flight", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => { release = r; });
    m.generateInternalBrief.mockReturnValueOnce(pending.then(() => OK)).mockResolvedValue(OK);

    const p1 = postDeal(VALID); // deal A pending
    await tick();
    const r2 = await postDeal(OTHER); // deal B concurrent → not blocked
    expect(r2.status).toBe(200);

    release();
    expect((await p1).status).toBe(200);
  });
});
