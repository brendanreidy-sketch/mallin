/**
 * Unit tests for the on-access refresh cost guard (decideRefresh).
 *
 * This is the function that protects COGS: the costed web-search must only
 * run for a real, non-demo, genuinely-stale deal. Every "skip" branch below
 * is a case where we must NOT spend money. Clock is injected (no real time)
 * so the staleness boundary is exact and deterministic.
 */
import { describe, expect, it } from "vitest";

import { decideRefresh } from "./decide";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

// Minimal artifact shaped just enough for the decision (cast — the function
// only reads metadata.generated_at + metadata.product_context).
const artifact = (ageDays: number, productContext: string | undefined = "B2B software") =>
  ({
    metadata: {
      generated_at: new Date(NOW - ageDays * DAY).toISOString(),
      product_context: productContext,
    },
  }) as never;

describe("decideRefresh — the COGS guard", () => {
  it("SKIPS demo tenants (never spend on the demo)", () => {
    const d = decideRefresh(artifact(30), { isDemo: true, now: NOW });
    expect(d).toEqual({ refresh: false, reason: "demo" });
  });

  it("SKIPS when there is no intel artifact for the deal", () => {
    const d = decideRefresh(null, { isDemo: false, now: NOW });
    expect(d).toEqual({ refresh: false, reason: "not_found" });
  });

  it("SKIPS a fresh artifact (<4 days old) — the core cost saving", () => {
    const d = decideRefresh(artifact(2), { isDemo: false, now: NOW });
    expect(d).toEqual({ refresh: false, reason: "fresh" });
  });

  it("SKIPS when the deal has no product_context (nothing to anchor news to)", () => {
    const d = decideRefresh(artifact(30, ""), { isDemo: false, now: NOW });
    expect(d).toEqual({ refresh: false, reason: "no_product_context" });
  });

  it("REFRESHES a genuinely stale, real, non-demo deal (the only paid path)", () => {
    const d = decideRefresh(artifact(5), { isDemo: false, now: NOW });
    expect(d).toEqual({ refresh: true, reason: "stale" });
  });

  it("treats a missing generated_at as infinitely stale → refresh", () => {
    const noDate = { metadata: { product_context: "x" } } as never;
    expect(decideRefresh(noDate, { isDemo: false, now: NOW }).refresh).toBe(true);
  });

  it("boundary: exactly at the 4-day line counts as stale (refresh)", () => {
    // ageMs (4d) < staleDays (4d) is false → not fresh → proceeds to stale.
    const d = decideRefresh(artifact(4), { isDemo: false, now: NOW });
    expect(d.refresh).toBe(true);
  });

  it("boundary: just under 4 days is still fresh (skip)", () => {
    const d = decideRefresh(artifact(3.99), { isDemo: false, now: NOW });
    expect(d.reason).toBe("fresh");
  });

  it("demo flag wins even over a stale artifact (order matters)", () => {
    const d = decideRefresh(artifact(99), { isDemo: true, now: NOW });
    expect(d.reason).toBe("demo");
  });
});
