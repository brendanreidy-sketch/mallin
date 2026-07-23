import { describe, it, expect } from "vitest";
import { parseBriefDraftStrict, BriefDraftJsonSchema } from "./brief-schema";
import { makeValidDraft } from "./fixtures/brief-mock-drafts";

describe("parseBriefDraftStrict", () => {
  it("accepts a well-formed draft", () => {
    expect(parseBriefDraftStrict(makeValidDraft()).ok).toBe(true);
  });

  it("rejects non-object / malformed JSON shapes", () => {
    expect(parseBriefDraftStrict(null).ok).toBe(false);
    expect(parseBriefDraftStrict("not an object").ok).toBe(false);
    expect(parseBriefDraftStrict({ executiveSummary: [] }).ok).toBe(false); // missing sections
  });

  it("rejects unknown fields (strict)", () => {
    const d = makeValidDraft() as unknown as Record<string, unknown>;
    (d.executiveSummary as unknown[])[0] = { ...(d.executiveSummary as Record<string, unknown>[])[0], surprise: true };
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects a missing required field", () => {
    const d = makeValidDraft() as unknown as Record<string, unknown>;
    const item = { ...(d.executiveSummary as Record<string, unknown>[])[0] };
    delete item.contentType;
    (d.executiveSummary as unknown[])[0] = item;
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects a bad enum value", () => {
    const d = makeValidDraft();
    (d.executiveSummary[0] as unknown as Record<string, unknown>).contentType = "bogus_type";
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects a malformed evidence id / source-fact key format", () => {
    const d = makeValidDraft();
    d.executiveSummary[0].evidenceIds = ["not-an-ev-id"];
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects duplicate content ids", () => {
    const d = makeValidDraft();
    d.executiveSummary[1].id = d.executiveSummary[0].id;
    const r = parseBriefDraftStrict(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /Duplicate content id/.test(e.message))).toBe(true);
  });

  it("rejects an over-large section (structural cap)", () => {
    const d = makeValidDraft();
    d.executiveSummary = Array.from({ length: 41 }, (_, i) => ({ ...makeValidDraft().executiveSummary[0], id: `es_${i}` }));
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects a nested factBinding with an unknown field", () => {
    const d = makeValidDraft();
    (d.executiveSummary[0].factBindings[0] as unknown as Record<string, unknown>).extra = 1;
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });
});

// ── Structured-Outputs schema conforms to Anthropic's strict constraints ──────
describe("BriefDraftJsonSchema — Anthropic strict Structured Outputs constraints", () => {
  const schema = BriefDraftJsonSchema;
  const json = JSON.stringify(schema);

  const objectNodes: Array<Record<string, unknown>> = [];
  (function walk(node: unknown): void {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const n = node as Record<string, unknown>;
      if (n.type === "object" && n.properties) objectNodes.push(n);
      Object.values(n).forEach(walk);
    }
  })(schema);

  it("contains no unsupported JSON-Schema keywords", () => {
    for (const k of ["minLength", "maxLength", "maxItems", "minimum", "maximum", "multipleOf", "exclusiveMinimum", "exclusiveMaximum", "format", "$schema"]) {
      expect(json).not.toContain(`"${k}"`);
    }
  });

  it("sets additionalProperties:false on every object node", () => {
    expect(objectNodes.length).toBeGreaterThan(0);
    for (const n of objectNodes) expect(n.additionalProperties).toBe(false);
  });

  it("stays within complexity limits (≤24 optional params, ≤16 union-typed)", () => {
    let optional = 0;
    let unionTyped = 0;
    (function walk(node: unknown): void {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        const n = node as Record<string, unknown>;
        if (n.type === "object" && n.properties) {
          const req = new Set((n.required as string[]) ?? []);
          for (const key of Object.keys(n.properties as object)) if (!req.has(key)) optional++;
        }
        if (Array.isArray(n.anyOf) || Array.isArray(n.type)) unionTyped++;
        Object.values(n).forEach(walk);
      }
    })(schema);
    expect(optional).toBeLessThanOrEqual(24);
    expect(unionTyped).toBeLessThanOrEqual(16);
  });

  it("root is an object and preserves real enums + id patterns", () => {
    expect((schema as Record<string, unknown>).type).toBe("object");
    expect(json).toMatch(/"enum":\[/);
    expect(json).toContain("^ev:");
    expect(json).toContain("^sf:");
  });
});
