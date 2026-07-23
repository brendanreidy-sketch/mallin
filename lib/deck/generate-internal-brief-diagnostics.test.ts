/**
 * Diagnostic-safety tests (Gate G1). Prove the sanitized failure diagnostic:
 *   - classifies the failure stage from an error without reading its content,
 *   - surfaces ONLY safe structured fields (never prompt / model output / creds),
 *   - leaves the public response generic and unchanged,
 *   - and success behavior is untouched.
 */
import { describe, it, expect, vi } from "vitest";
import type { AccountIntelligenceArtifact, IntelligenceSource } from "@/lib/intelligence/types";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";
import type { BriefDraft } from "./brief-model";
import type { InternalBriefSources } from "./load-internal-brief-sources";
import { generateInternalBrief, inferBriefStage, sanitizeBriefDiagnostic } from "./generate-internal-brief";

// ── pure: stage inference (no content read) ──────────────────────────────────
describe("inferBriefStage", () => {
  it("maps an Anthropic-shaped API error → anthropic_request", () => {
    expect(inferBriefStage({ name: "NotFoundError", status: 404, error: { type: "not_found_error", message: "model: x" }, request_id: "req_1" })).toBe("anthropic_request");
  });
  it("maps a JSON.parse SyntaxError → json_parsing", () => {
    let err: unknown; try { JSON.parse("{bad"); } catch (e) { err = e; }
    expect(inferBriefStage(err)).toBe("json_parsing");
  });
  it("maps the fixed buildCover error → cover_build", () => {
    expect(inferBriefStage(new Error("buildCover produced an unverifiable cover fact."))).toBe("cover_build");
  });
  it("maps anything else → assembly_or_other", () => {
    expect(inferBriefStage(new Error("kaboom"))).toBe("assembly_or_other");
    expect(inferBriefStage("nope")).toBe("assembly_or_other");
  });
});

// ── pure: NO message text is ever logged (structured fields only) ────────────
describe("sanitizeBriefDiagnostic — no provider/error message text", () => {
  // A provider message carrying a fake injected prompt, email, API key, and customer text.
  const CONTENT = "IGNORE ALL PREVIOUS INSTRUCTIONS. contact dana.ruiz@northwind.example key sk-ant-api03-FAKEKEY 'phase the cutover after peak'";
  const FORBIDDEN = ["IGNORE ALL PREVIOUS", "dana.ruiz@northwind.example", "sk-ant-", "phase the cutover", "Northwind"];
  const clean = (d: unknown) => { const s = JSON.stringify(d); for (const bad of FORBIDDEN) expect(s).not.toContain(bad); };

  it("logs ONLY safe structured fields for an Anthropic error — never the provider message", () => {
    const d = sanitizeBriefDiagnostic("anthropic_request", { name: "NotFoundError", status: 404, error: { type: "not_found_error", message: CONTENT }, request_id: "req_abc" }, 120);
    expect(d).toEqual({ stage: "anthropic_request", errorName: "NotFoundError", httpStatus: 404, providerErrorType: "not_found_error", requestId: "req_abc", elapsedMs: 120 });
    expect("message" in d).toBe(false);
    clean(d);
  });

  it("never surfaces a provider message with a fake prompt / email / API key / customer text — for ANY error type", () => {
    for (const type of ["not_found_error", "invalid_request_error", "overloaded_error", "authentication_error", "api_error"]) {
      const d = sanitizeBriefDiagnostic("anthropic_request", { name: "APIError", status: 500, error: { type, message: CONTENT }, request_id: "req_1" }, 9);
      expect("message" in d).toBe(false);
      expect(d.providerErrorType).toBe(type);
      clean(d);
    }
  });

  it("never surfaces a JSON.parse SyntaxError message (can echo model output)", () => {
    let err: unknown; try { JSON.parse('{"x": ' + CONTENT); } catch (e) { err = e; }
    const d = sanitizeBriefDiagnostic("json_parsing", err, 3);
    expect(d.errorName).toBe("SyntaxError");
    expect("message" in d).toBe(false);
    clean(d);
  });

  it("never surfaces a generic Error message — not even the fixed buildCover string", () => {
    clean(sanitizeBriefDiagnostic("cover_build", new Error("buildCover produced an unverifiable cover fact."), 1));
    clean(sanitizeBriefDiagnostic("assembly_or_other", new Error(CONTENT), 7));
  });

  it("handles a non-Error throw without leaking", () => {
    clean(sanitizeBriefDiagnostic("assembly_or_other", CONTENT, 2));
  });
});

// ── integration: response unchanged + sanitized diagnostic emitted ───────────
const sf = (value: string, source: IntelligenceSource) => ({ value, source, captured_at: "2026-06-01T00:00:00.000Z", confidence: "medium" as const });
const INTEL: AccountIntelligenceArtifact = {
  account: { name: "Cedar Dynamics", one_line: sf("Vendor.", "web_search"), industry: sf("Automation", "company_website"), geography: [], funding_history: [], strategic_priorities: [], leadership: [] },
  recent_events: [], stakeholders: [],
  competitive_context: { direct_competitors: [], market_position: sf("Challenger", "web_search") },
  pre_call_brief: null,
  meeting: { title: "Cedar / SellerCo", date: "2026-06-12", attendees: [{ name: "Jordan Vance", company: "Cedar Dynamics", side: "buyer" }, { name: "Alex Rep", company: "SellerCo", side: "seller" }], agenda: [], quotes: [{ text: "We need to cut unplanned downtime this quarter.", speaker: "Jordan Vance" }], deck_copy_source_at: "2026-06-12T18:00:00.000Z" },
  metadata: { generated_at: "2026-06-15T00:00:00.000Z", sources_used: ["web_search"], confidence_overall: "medium", product_context: "Predictive maintenance" },
};
const PREP: PrepArtifact = {
  metadata: { generated_at: "2026-06-15T00:00:00.000Z", prompt_version: "v1", model: "test", opportunity_id: "opp_cedar", surface_mode: "full" },
  top_line: { text: "Engaged discovery.", posture: "advancing", evidence_ids: ["e1"] },
  deal_thesis: { status: "indeterminate", confidence: "low", evidence_ids: [], indeterminate_reason: "No frame yet.", required_evidence_to_form_thesis: ["a", "b"] },
  critical_risks: [], stakeholder_strategy: [],
  talk_track: { opening_angle: "Anchor on downtime.", opening_rationale: "Their priority.", key_questions: [], objection_angles: [] },
  open_questions: [], success_criteria: { summary: "Advance.", outcomes: [{ outcome: "Validation", why_it_matters: "Gate." }] }, coaching_notes: [],
};
const sources = (): InternalBriefSources => ({
  tenantId: "tenant_cedar", dealId: "deal_cedar",
  opportunity: { id: "opp_cedar", name: "Cedar Dynamics — Predictive Maintenance", stageLabel: "Discovery", amount: null, currency: "USD", closeDate: "2026-10-31" },
  companyName: "Cedar Dynamics",
  intelligence: { artifactId: "intel_row_1", artifact: INTEL },
  execution: { artifactId: "exec_row_1", artifact: PREP, generatedAt: "2026-06-15T00:00:00.000Z" },
  meeting: INTEL.meeting ?? null,
  coords: { opportunityId: "opp_cedar", opportunityUpdatedAt: "2026-06-14T00:00:00.000Z", intelligenceArtifactId: "intel_row_1", executionArtifactId: "exec_row_1", meetingRecordId: "2026-06-12T18:00:00.000Z" },
});
const validDraft = (): BriefDraft => ({ executiveSummary: [], whatChanged: [], customerPriorities: [], stakeholders: [], decisionProcess: [], risks: [], actionPlan: { customerCommitments: [], inferredCustomerCommitments: [], sellerActions: [], mallinRecommendations: [], unresolvedActions: [] }, appendix: [] });

describe("generateInternalBrief — sanitized diagnostics", () => {
  it("keeps the public response generic on a model error and logs a sanitized diagnostic with NO content", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await generateInternalBrief({
      sources: sources(), cover: { dealName: "Cedar", asOf: "2026-06-16" },
      modelClient: async () => { throw { name: "BadRequestError", status: 400, error: { type: "invalid_request_error", message: "Northwind Freight Dana Ruiz sk-ant-LEAK" }, request_id: "req_z" }; },
    });
    expect(res).toEqual({ ok: false, code: "model_generation_failed" }); // unchanged public response
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain('"stage":"anthropic_request"');
    expect(logged).toContain('"httpStatus":400');
    expect(logged).toContain('"providerErrorType":"invalid_request_error"');
    expect(logged).not.toContain("Northwind");
    expect(logged).not.toContain("Dana Ruiz");
    expect(logged).not.toContain("sk-ant-");
    warn.mockRestore();
  });

  it("logs stage brief_validation and returns brief_failed_validation on an invalid draft", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = validDraft();
    bad.whatChanged = [{ id: "wc", contentType: "what_changed", text: "x", section: "what_changed", assertionMode: "unresolved", evidenceIds: [], sourceFactKeys: [], factBindings: [], provenance: [], confidence: "none", assurance: "unresolved", appendixEligible: true }];
    const res = await generateInternalBrief({ sources: sources(), cover: { dealName: "Cedar", asOf: "2026-06-16" }, modelClient: async () => bad });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("brief_failed_validation");
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain('"stage":"brief_validation"');
    warn.mockRestore();
  });

  it("emits NO diagnostic on success and returns a valid deck (behavior unchanged)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await generateInternalBrief({ sources: sources(), cover: { dealName: "Cedar", asOf: "2026-06-16" }, modelClient: async () => validDraft() });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(warn.mock.calls.join("\n")).not.toContain("internal-brief:diagnostic");
    warn.mockRestore();
  });
});
