import { describe, it, expect, beforeEach, vi } from "vitest";

// Focused test for the worker's terminal-result mapping: a successful pipeline
// stores the rendered .pptx as base64; a failed one stores the public code only.
const captured: Array<Record<string, unknown>> = [];
const h = vi.hoisted(() => ({ loadInternalBriefSources: vi.fn(), generateInternalBrief: vi.fn(), createSonnetBriefClient: vi.fn(() => ({})) }));

vi.mock("@/lib/db/client", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const k of ["insert", "select", "eq", "in", "order", "limit"]) c[k] = () => c;
    c.update = (payload: Record<string, unknown>) => { captured.push(payload); return c; };
    c.maybeSingle = async () => ({ data: null, error: null });
    (c as { then: unknown }).then = (onF: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(onF);
    return c;
  };
  return { supabaseAdmin: { from: () => chain() } };
});
vi.mock("@/lib/deck/load-internal-brief-sources", () => ({ loadInternalBriefSources: h.loadInternalBriefSources }));
vi.mock("@/lib/deck/generate-internal-brief", () => ({ generateInternalBrief: h.generateInternalBrief, createSonnetBriefClient: h.createSonnetBriefClient }));

import { runClaimedBriefJob, type BriefJob } from "./brief-jobs";

const JOB: BriefJob = { id: "j1", tenant_id: "t1", opportunity_id: "d1", user_id: "u1", status: "running", created_at: "", started_at: null, finished_at: null, filename: null, bundle_version: null, model_id: null, pptx_base64: null, error_code: null, attempts: 1 };

beforeEach(() => {
  captured.length = 0;
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
});
