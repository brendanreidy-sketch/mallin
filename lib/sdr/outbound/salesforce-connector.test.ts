/**
 * ============================================================================
 *  Salesforce connector tests — the pure mapping + the mock connector
 * ============================================================================
 *
 * Pure data-in / data-out. No SF auth, no DB, no network — fixtures inlined for
 * grep-ability and PR-readability (same discipline as sf-diff/engine.test.ts).
 * The LIVE connector is a shell (throws until creds exist); we only assert it
 * throws the right error so the inert boundary is guarded.
 *
 * Coverage focus:
 *   - dedupe by account (max amount, latest close, wonDealCount aggregate)
 *   - ranking by total won amount desc, then recency, then name
 *   - empty input → empty output
 *   - missing/blank fields (no amount, no website, no close, opp-name fallback)
 *   - defensive drop of isWon === false rows
 *   - MockSalesforceConnector: limit, minWonAmount, enrichCompany lookup
 *   - LiveSalesforceConnector: throws SalesforceNotConnectedError (inert)
 * ============================================================================
 */

import { describe, it, expect } from "vitest";
import {
  wonOppsToSeeds,
  MockSalesforceConnector,
  LiveSalesforceConnector,
  SalesforceNotConnectedError,
  type RawWonOpp,
  type ConnectorContact,
} from "./salesforce-connector";

describe("wonOppsToSeeds — pure mapping", () => {
  it("empty input → empty output", () => {
    expect(wonOppsToSeeds([])).toEqual([]);
  });

  it("dedupes by account, aggregating max amount + latest close + count", () => {
    const raw: RawWonOpp[] = [
      { id: "1", accountName: "Acme", amount: 40_000, closeDate: "2026-01-10" },
      { id: "2", accountName: "Acme", amount: 90_000, closeDate: "2026-03-05" },
    ];
    const seeds = wonOppsToSeeds(raw);
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({
      company: "Acme",
      wonAmount: 90_000, // max, not sum
      closedAt: "2026-03-05", // latest
      wonDealCount: 2,
    });
  });

  it("normalizes account name for dedupe (case + whitespace)", () => {
    const raw: RawWonOpp[] = [
      { id: "1", accountName: "Globex Corp", amount: 10_000 },
      { id: "2", accountName: "  globex   corp ", amount: 20_000 },
    ];
    const seeds = wonOppsToSeeds(raw);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].wonDealCount).toBe(2);
    expect(seeds[0].wonAmount).toBe(20_000);
    // Display name comes from the first-seen row.
    expect(seeds[0].company).toBe("Globex Corp");
  });

  it("ranks by TOTAL won amount desc (two small wins can outrank one big)", () => {
    const raw: RawWonOpp[] = [
      { id: "big", accountName: "OneBig", amount: 100_000, closeDate: "2026-02-01" },
      { id: "s1", accountName: "TwoMid", amount: 60_000, closeDate: "2026-01-01" },
      { id: "s2", accountName: "TwoMid", amount: 60_000, closeDate: "2026-01-15" },
    ];
    const seeds = wonOppsToSeeds(raw);
    expect(seeds.map((s) => s.company)).toEqual(["TwoMid", "OneBig"]);
  });

  it("breaks ties by most-recent close, then by name", () => {
    const raw: RawWonOpp[] = [
      { id: "a", accountName: "Zeta", amount: 50_000, closeDate: "2026-01-01" },
      { id: "b", accountName: "Beta", amount: 50_000, closeDate: "2026-05-01" },
      { id: "c", accountName: "Alpha", amount: 50_000, closeDate: "2026-05-01" },
    ];
    const seeds = wonOppsToSeeds(raw);
    // Beta + Alpha share the latest close → alphabetical; Zeta last (older).
    expect(seeds.map((s) => s.company)).toEqual(["Alpha", "Beta", "Zeta"]);
  });

  it("handles missing fields: no amount, no website, no close, opp-name fallback", () => {
    const raw: RawWonOpp[] = [
      { id: "1" }, // no name at all → dropped (not identifiable)
      { id: "2", name: "Widget Co — Expansion" }, // falls back to opp name
      { id: "3", accountName: "Nubank", accountWebsite: "" }, // blank website ignored
    ];
    const seeds = wonOppsToSeeds(raw);
    const byCompany = Object.fromEntries(seeds.map((s) => [s.company, s]));
    expect(seeds.some((s) => s.company === "")).toBe(false);
    expect(byCompany["Widget Co — Expansion"]).toBeDefined();
    expect(byCompany["Widget Co — Expansion"].wonAmount).toBeUndefined();
    expect(byCompany["Nubank"].website).toBeUndefined();
    expect(byCompany["Nubank"].closedAt).toBeUndefined();
  });

  it("carries first non-empty website across duplicate rows", () => {
    const raw: RawWonOpp[] = [
      { id: "1", accountName: "Acme", accountWebsite: null },
      { id: "2", accountName: "Acme", accountWebsite: "https://acme.com" },
    ];
    const seeds = wonOppsToSeeds(raw);
    expect(seeds[0].website).toBe("https://acme.com");
  });

  it("defensively drops isWon === false rows", () => {
    const raw: RawWonOpp[] = [
      { id: "1", accountName: "Lost Co", amount: 999_999, isWon: false },
      { id: "2", accountName: "Won Co", amount: 10_000, isWon: true },
    ];
    const seeds = wonOppsToSeeds(raw);
    expect(seeds.map((s) => s.company)).toEqual(["Won Co"]);
  });
});

describe("MockSalesforceConnector", () => {
  const fixture: RawWonOpp[] = [
    { id: "1", accountName: "Acme", amount: 90_000, closeDate: "2026-03-05", accountWebsite: "https://acme.com" },
    { id: "2", accountName: "Beta", amount: 5_000, closeDate: "2026-02-01" },
    { id: "3", accountName: "Gamma", amount: 50_000, closeDate: "2026-04-01" },
  ];

  it("listClosedWonSeeds returns ranked seeds ready for the lookalike agent", async () => {
    const conn = new MockSalesforceConnector(fixture);
    const seeds = await conn.listClosedWonSeeds();
    expect(seeds.map((s) => s.company)).toEqual(["Acme", "Gamma", "Beta"]);
    expect(seeds[0]).toMatchObject({ company: "Acme", website: "https://acme.com" });
  });

  it("respects limit", async () => {
    const conn = new MockSalesforceConnector(fixture);
    const seeds = await conn.listClosedWonSeeds({ limit: 2 });
    expect(seeds.map((s) => s.company)).toEqual(["Acme", "Gamma"]);
  });

  it("respects minWonAmount (filters trivial deals before dedupe)", async () => {
    const conn = new MockSalesforceConnector(fixture);
    const seeds = await conn.listClosedWonSeeds({ minWonAmount: 10_000 });
    expect(seeds.map((s) => s.company)).toEqual(["Acme", "Gamma"]); // Beta @5k dropped
  });

  it("enrichCompany does a case-insensitive fixture lookup", async () => {
    const contacts: Record<string, ConnectorContact[]> = {
      Acme: [{ name: "Jane Doe", title: "VP Sales", email: "jane@acme.com", company: "Acme" }],
    };
    const conn = new MockSalesforceConnector(fixture, contacts);
    expect(await conn.enrichCompany("acme")).toHaveLength(1);
    expect((await conn.enrichCompany("acme"))[0].title).toBe("VP Sales");
    expect(await conn.enrichCompany("Unknown Co")).toEqual([]);
  });
});

describe("LiveSalesforceConnector — inert until credentials exist", () => {
  it("listClosedWonSeeds throws SalesforceNotConnectedError", async () => {
    const conn = new LiveSalesforceConnector();
    await expect(conn.listClosedWonSeeds()).rejects.toBeInstanceOf(
      SalesforceNotConnectedError,
    );
  });

  it("enrichCompany throws SalesforceNotConnectedError even with creds present", async () => {
    const conn = new LiveSalesforceConnector({
      accessToken: "not-a-real-token",
      instanceUrl: "https://example.my.salesforce.com",
    });
    await expect(conn.enrichCompany("Acme")).rejects.toThrow(
      /Salesforce not connected/,
    );
  });
});
