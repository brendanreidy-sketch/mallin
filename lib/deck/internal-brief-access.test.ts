import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The helper imports "server-only", which throws under plain node/vitest (no
// react-server condition). Stub it — the guard is a build-time concern, not a
// runtime one.
vi.mock("server-only", () => ({}));

import { isInternalBriefEnabledForTenant } from "./internal-brief-access";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENV = "INTERNAL_BRIEF_TENANT_ALLOWLIST";

let saved: string | undefined;
beforeEach(() => {
  saved = process.env[ENV];
  delete process.env[ENV];
});
afterEach(() => {
  if (saved === undefined) delete process.env[ENV];
  else process.env[ENV] = saved;
});

describe("isInternalBriefEnabledForTenant — fail-closed allowlist", () => {
  it("missing env → disabled for everyone", () => {
    expect(isInternalBriefEnabledForTenant(A)).toBe(false);
  });

  it("blank env → disabled", () => {
    process.env[ENV] = "";
    expect(isInternalBriefEnabledForTenant(A)).toBe(false);
  });

  it("whitespace-only env → disabled", () => {
    process.env[ENV] = "   ";
    expect(isInternalBriefEnabledForTenant(A)).toBe(false);
  });

  it("exact allowlisted tenant → enabled", () => {
    process.env[ENV] = A;
    expect(isInternalBriefEnabledForTenant(A)).toBe(true);
  });

  it("a different tenant remains disabled", () => {
    process.env[ENV] = A;
    expect(isInternalBriefEnabledForTenant(B)).toBe(false);
  });

  it("malformed-only entries enable no one", () => {
    process.env[ENV] = "not-a-uuid, 12345, *, aaaa";
    expect(isInternalBriefEnabledForTenant(A)).toBe(false);
  });

  it("malformed entries mixed with one valid UUID enable ONLY the valid one", () => {
    process.env[ENV] = `garbage, ${A}, also-garbage`;
    expect(isInternalBriefEnabledForTenant(A)).toBe(true);
    expect(isInternalBriefEnabledForTenant(B)).toBe(false);
  });

  it("multiple valid UUIDs each match exactly", () => {
    process.env[ENV] = `${A},${B}`;
    expect(isInternalBriefEnabledForTenant(A)).toBe(true);
    expect(isInternalBriefEnabledForTenant(B)).toBe(true);
  });

  it("null / undefined / non-UUID caller → disabled (no substring or partial match)", () => {
    process.env[ENV] = A;
    expect(isInternalBriefEnabledForTenant(null)).toBe(false);
    expect(isInternalBriefEnabledForTenant(undefined)).toBe(false);
    expect(isInternalBriefEnabledForTenant("")).toBe(false);
    expect(isInternalBriefEnabledForTenant(A.slice(0, 8))).toBe(false); // partial id
    expect(isInternalBriefEnabledForTenant(`x${A}`)).toBe(false);
  });

  it("matches case-insensitively (Postgres stores lowercase UUIDs)", () => {
    process.env[ENV] = A.toUpperCase();
    expect(isInternalBriefEnabledForTenant(A)).toBe(true);
  });

  it("never logs the configured allowlist", () => {
    const spies = [
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    process.env[ENV] = `${A},${B}`;
    isInternalBriefEnabledForTenant(A);
    for (const s of spies) {
      for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain(A);
      s.mockRestore();
    }
  });
});

// The helper tests prove the DECISION; they cannot prove /prep actually wires
// the decision into both render sites (the page is a Server Component that loads
// Clerk + the DB and cannot be rendered in this Vitest setup without substantial
// new infrastructure). Per the design, this is a focused STATIC wiring assertion
// — the live non-render is additionally covered by the mandatory staging browser
// test recorded in the implementation report.
describe("prep/page.tsx — static gate wiring", () => {
  const src = readFileSync(resolve(__dirname, "../../app/prep/page.tsx"), "utf8");

  it("gates BOTH InternalBrief placements behind internalBriefEnabled", () => {
    expect(src).toContain("{internalBriefEnabled && <InternalBriefButton dealId={safeDealId} />}");
    expect(src).toContain("{internalBriefEnabled && <InternalBriefButton dealId={coachDealId} />}");
    // No ungated InternalBriefButton render survives.
    const total = (src.match(/<InternalBriefButton /g) ?? []).length;
    const gated = (src.match(/internalBriefEnabled && <InternalBriefButton /g) ?? []).length;
    expect(total).toBe(2);
    expect(gated).toBe(2);
  });

  it("evaluates the gate exactly once per request", () => {
    expect((src.match(/isInternalBriefEnabledForTenant\(/g) ?? []).length).toBe(1);
  });

  it("leaves the customer-facing deck control ungated by this flag", () => {
    expect(src).toContain("<GenerateDeckButton");
    expect(src).not.toContain("internalBriefEnabled && <GenerateDeckButton");
  });
});
