import { describe, it, expect, beforeEach, vi } from "vitest";

// Focused tests for the async worker + stale-job recovery. A per-operation mock
// of the service-role client records every update payload (captured) and the
// full filter chain (calls), and routes each query through a per-test `handler`
// so we can assert compare-and-set behavior precisely.
type Ctx = { op: "select" | "insert" | "update"; payload?: Record<string, unknown>; cols?: string; filters: Array<[string, unknown[]]> };
const captured: Array<Record<string, unknown>> = [];
const calls: Ctx[] = [];
let handler: (ctx: Ctx) => { data: unknown; error: unknown };

const h = vi.hoisted(() => ({ loadInternalBriefSources: vi.fn(), generateInternalBrief: vi.fn(), createSonnetBriefClient: vi.fn(() => ({})) }));

vi.mock("@/lib/db/client", () => {
  const build = () => {
    const ctx: Ctx = { op: "select", filters: [] };
    const b: Record<string, unknown> = {};
    b.insert = (p: Record<string, unknown>) => { ctx.op = "insert"; ctx.payload = p; return b; };
    b.update = (p: Record<string, unknown>) => { ctx.op = "update"; ctx.payload = p; captured.push(p); return b; };
    b.select = (cols?: string) => { ctx.cols = cols; return b; };
    for (const k of ["eq", "in", "lt", "gte", "order", "limit"] as const) {
      b[k] = (...args: unknown[]) => { ctx.filters.push([k, args]); return b; };
    }
    b.maybeSingle = async () => { calls.push(ctx); return handler(ctx); };
    (b as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => { calls.push(ctx); return Promise.resolve(handler(ctx)).then(onF, onR); };
    return b;
  };
  return { supabaseAdmin: { from: () => build() } };
});
vi.mock("@/lib/deck/load-internal-brief-sources", () => ({ loadInternalBriefSources: h.loadInternalBriefSources }));
vi.mock("@/lib/deck/generate-internal-brief", () => ({ generateInternalBrief: h.generateInternalBrief, createSonnetBriefClient: h.createSonnetBriefClient }));

import { runClaimedBriefJob, reapStaleRunningJobs, enqueueBriefJob, STALE_RUNNING_MS, type BriefJob } from "./brief-jobs";

const JOB: BriefJob = { id: "j1", tenant_id: "t1", opportunity_id: "d1", user_id: "u1", status: "running", created_at: "", started_at: null, finished_at: null, filename: null, bundle_version: null, model_id: null, pptx_base64: null, error_code: null, attempts: 1 };
const NOW_MS = Date.parse("2026-07-23T12:00:00.000Z");

const eqVal = (ctx: Ctx, col: string) => { const f = ctx.filters.find(([n, a]) => n === "eq" && (a as unknown[])[0] === col); return f ? (f[1] as unknown[])[1] : undefined; };
const hasEq = (ctx: Ctx, col: string, val: unknown) => ctx.filters.some(([n, a]) => n === "eq" && (a as unknown[])[0] === col && (a as unknown[])[1] === val);
const hasLt = (ctx: Ctx, col: string) => ctx.filters.some(([n, a]) => n === "lt" && (a as unknown[])[0] === col);

// Default handler: inserts create a fresh queued row; updates WIN their CAS
// (1 row); selects find nothing. Individual tests override for lost-race cases.
function defaultHandler(ctx: Ctx): { data: unknown; error: unknown } {
  if (ctx.op === "insert") return { data: { id: "newjob", status: "queued" }, error: null };
  if (ctx.op === "update") return { data: [{ id: eqVal(ctx, "id") ?? "j1" }], error: null };
  return { data: null, error: null };
}

beforeEach(() => {
  captured.length = 0;
  calls.length = 0;
  handler = defaultHandler;
  vi.clearAllMocks();
  h.loadInternalBriefSources.mockResolvedValue({ ok: true, sources: { opportunity: { name: "Cedar" }, companyName: "Co" } });
});

describe("runClaimedBriefJob — terminal result mapping", () => {
  it("succeeded: stores base64 pptx + filename + bundle + model, no error", async () => {
    h.generateInternalBrief.mockResolvedValue({ ok: true, buffer: Buffer.from("PK\x03\x04deck"), filename: "cedar.pptx", bundleVersion: "v9", modelId: "claude-sonnet-4-6", diagnostics: [] });
    const status = await runClaimedBriefJob(JOB);
    expect(status).toBe("succeeded");
    const upd = captured.at(-1)!;
    expect(upd.status).toBe("succeeded");
    expect(upd.filename).toBe("cedar.pptx");
    expect(upd.bundle_version).toBe("v9");
    expect(upd.model_id).toBe("claude-sonnet-4-6");
    expect(Buffer.from(upd.pptx_base64 as string, "base64").subarray(0, 2).toString("latin1")).toBe("PK");
    expect(upd.error_code).toBeUndefined();
  });

  it("failed (generation): stores the public code, no pptx", async () => {
    h.generateInternalBrief.mockResolvedValue({ ok: false, code: "brief_failed_validation" });
    const status = await runClaimedBriefJob(JOB);
    expect(status).toBe("failed");
    const upd = captured.at(-1)!;
    expect(upd.status).toBe("failed");
    expect(upd.error_code).toBe("brief_failed_validation");
    expect(upd.pptx_base64).toBeUndefined();
  });

  it("failed (missing required artifact): maps loader code", async () => {
    h.loadInternalBriefSources.mockResolvedValue({ ok: false, code: "required_artifact_missing" });
    const status = await runClaimedBriefJob(JOB);
    expect(status).toBe("failed");
    expect(captured.at(-1)!.error_code).toBe("required_artifact_missing");
  });

  it("failed (thrown): maps to brief_render_failed, never throws", async () => {
    h.generateInternalBrief.mockRejectedValue(new Error("render boom"));
    const status = await runClaimedBriefJob(JOB);
    expect(status).toBe("failed");
    expect(captured.at(-1)!.error_code).toBe("brief_render_failed");
  });

  it("every terminal write is compare-and-set on (id, status='running')", async () => {
    h.generateInternalBrief.mockResolvedValue({ ok: true, buffer: Buffer.from("PK"), filename: "c.pptx", bundleVersion: "v1", modelId: "m", diagnostics: [] });
    await runClaimedBriefJob(JOB);
    const write = calls.find((c) => c.op === "update")!;
    expect(hasEq(write, "id", "j1")).toBe(true);
    expect(hasEq(write, "status", "running")).toBe(true);
  });
});

describe("runClaimedBriefJob — lost race (reaper already won)", () => {
  it("success write matching zero rows does NOT overwrite the reaper's terminal state", async () => {
    h.generateInternalBrief.mockResolvedValue({ ok: true, buffer: Buffer.from("PK"), filename: "c.pptx", bundleVersion: "v1", modelId: "m", diagnostics: [] });
    // The row is no longer 'running' (reaper set worker_timeout) → CAS matches 0 rows.
    handler = (ctx) => (ctx.op === "update" ? { data: [], error: null } : defaultHandler(ctx));
    const status = await runClaimedBriefJob(JOB);
    expect(status).toBe("failed"); // safe lost race
    // Only the (rejected) succeeded write was attempted — no second overwrite,
    // and crucially no brief_render_failed write clobbering worker_timeout.
    expect(captured.every((p) => p.error_code !== "brief_render_failed")).toBe(true);
    expect(captured.filter((p) => p.status === "succeeded").length).toBe(1);
  });

  it("outer error handler's failure write is also CAS-guarded (cannot overwrite worker_timeout)", async () => {
    h.generateInternalBrief.mockRejectedValue(new Error("boom"));
    const failWrite: Ctx[] = [];
    handler = (ctx) => {
      if (ctx.op === "update") { failWrite.push(ctx); return { data: [], error: null }; } // reaper already terminal
      return defaultHandler(ctx);
    };
    const status = await runClaimedBriefJob(JOB);
    expect(status).toBe("failed");
    // The catch's fail() write carried the running-CAS guard.
    const w = failWrite.find((c) => (c.payload as { error_code?: string }).error_code === "brief_render_failed")!;
    expect(hasEq(w, "id", "j1")).toBe(true);
    expect(hasEq(w, "status", "running")).toBe(true);
  });
});

describe("reapStaleRunningJobs — stale-running recovery", () => {
  it("fails a stale running job with worker_timeout, CAS on status+age", async () => {
    handler = (ctx) => (ctx.op === "update" ? { data: [{ id: "stale1" }], error: null } : defaultHandler(ctx));
    const reaped = await reapStaleRunningJobs(NOW_MS);
    expect(reaped).toEqual(["stale1"]);
    const upd = captured.at(-1)!;
    expect(upd.status).toBe("failed");
    expect(upd.error_code).toBe("worker_timeout");
    // Compare-and-set conditions: only running rows older than the cutoff.
    const c = calls.find((x) => x.op === "update")!;
    expect(hasEq(c, "status", "running")).toBe(true);
    expect(hasLt(c, "started_at")).toBe(true);
    // Cutoff is exactly NOW - STALE_RUNNING_MS (20 min).
    const lt = c.filters.find(([n]) => n === "lt")!;
    expect((lt[1] as unknown[])[1]).toBe(new Date(NOW_MS - STALE_RUNNING_MS).toISOString());
  });

  it("uses the fixed 20-minute threshold", () => {
    expect(STALE_RUNNING_MS).toBe(20 * 60 * 1000);
  });

  it("recent running / succeeded / failed jobs are excluded by the WHERE — reaps nothing", async () => {
    // No row satisfies status='running' AND started_at<cutoff → empty result.
    handler = (ctx) => (ctx.op === "update" ? { data: [], error: null } : defaultHandler(ctx));
    const reaped = await reapStaleRunningJobs(NOW_MS);
    expect(reaped).toEqual([]);
    // The query still scoped to running + age (never touches other states).
    const c = calls.find((x) => x.op === "update")!;
    expect(hasEq(c, "status", "running")).toBe(true);
    expect(hasLt(c, "started_at")).toBe(true);
  });

  it("is idempotent — a second pass over already-reaped rows finds nothing", async () => {
    let round = 0;
    handler = (ctx) => (ctx.op === "update" ? { data: round++ === 0 ? [{ id: "stale1" }] : [], error: null } : defaultHandler(ctx));
    expect(await reapStaleRunningJobs(NOW_MS)).toEqual(["stale1"]);
    expect(await reapStaleRunningJobs(NOW_MS)).toEqual([]);
  });

  it("surfaces a sanitized error (no DB detail) when the update fails", async () => {
    handler = (ctx) => (ctx.op === "update" ? { data: null, error: { message: "connection refused at 10.0.0.5:5432" } } : defaultHandler(ctx));
    await expect(reapStaleRunningJobs(NOW_MS)).rejects.toThrow("reap_failed");
    await expect(reapStaleRunningJobs(NOW_MS)).rejects.not.toThrow(/10\.0\.0\.5|connection/);
  });
});

describe("enqueue after stale recovery", () => {
  it("a new job for the same (tenant,user,deal) enqueues once the stale lock is released", async () => {
    // Reap the stale job (its 'failed' transition drops it from the active-job
    // unique index), then the fresh insert succeeds — no 23505.
    handler = (ctx) => (ctx.op === "update" ? { data: [{ id: "stale1" }], error: null } : defaultHandler(ctx));
    await reapStaleRunningJobs(NOW_MS);
    const res = await enqueueBriefJob({ tenantId: "t1", dealId: "d1", userId: "u1" });
    expect(res.reused).toBe(false);
    expect(res.jobId).toBe("newjob");
    expect(res.status).toBe("queued");
  });
});

