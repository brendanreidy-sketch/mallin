/**
 * ============================================================================
 *  sf-diff engine tests
 * ============================================================================
 *
 *  Pure data-in / data-out tests. No SF auth, no DB, no fixtures from
 *  disk — fixtures are inlined for grep-ability and PR-readability.
 *
 *  Coverage focus:
 *    - tier=readonly fields (Stage, Amount, CloseDate) NEVER recommend
 *      a write, even on disagreement (doctrine §11.3 boundary)
 *    - tier=auto fields write only when SF is blank, suggest on conflict
 *    - tier=suggest fields always suggest
 *    - Non-forecast standard fields (Name) surface as suggest
 *    - Numeric tolerance: 125000 === 125000.00
 *    - Empty/whitespace SF strings normalize to null
 *    - actionableItems() drops no-ops
 * ============================================================================
 */

import { describe, it, expect } from "vitest";
import { diffOpportunity, actionableItems } from "./engine";
import type { LoadedSubstrate } from "../db/load-deal";

// Minimal substrate skeleton. Each test fills in only what it needs.
function makeSubstrate(
  overrides: Partial<LoadedSubstrate> = {},
): LoadedSubstrate {
  return {
    opportunity: { name: "Test Deal" },
    stakeholders: [],
    activities: [],
    ...overrides,
  };
}

describe("diffOpportunity — readonly tier (forecast-impacting)", () => {
  it("StageName disagreement → surface_only, never write_now or suggest", () => {
    const sf = {
      Id: "006xxx",
      Name: "Test Deal",
      StageName: "Negotiation/Review",
    };
    const substrate = makeSubstrate({
      opportunity: { name: "Test Deal", stage_label: "Closing" },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const stage = diff.items.find((i) => i.sf_field === "StageName")!;
    expect(stage.tier).toBe("readonly");
    expect(stage.status).toBe("differs");
    expect(stage.action).toBe("surface_only");
  });

  it("Amount disagreement → surface_only", () => {
    const sf = { Id: "006xxx", Name: "Test", Amount: 100000 };
    const substrate = makeSubstrate({
      opportunity: { name: "Test", amount: 250000 },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const amount = diff.items.find((i) => i.sf_field === "Amount")!;
    expect(amount.tier).toBe("readonly");
    expect(amount.action).toBe("surface_only");
  });

  it("CloseDate match → no_op", () => {
    const sf = { Id: "006xxx", Name: "Test", CloseDate: "2026-04-14" };
    const substrate = makeSubstrate({
      opportunity: { name: "Test", close_date: "2026-04-14" },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const cd = diff.items.find((i) => i.sf_field === "CloseDate")!;
    expect(cd.status).toBe("match");
    expect(cd.action).toBe("no_op");
  });
});

describe("diffOpportunity — suggest tier (non-forecast standard field)", () => {
  it("Name differs between SF and substrate → suggest", () => {
    const sf = {
      Id: "006xxx",
      Name: "Old Opportunity Name",
    };
    const substrate = makeSubstrate({
      opportunity: { name: "New Opportunity Name" },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const name = diff.items.find((i) => i.sf_field === "Name")!;
    expect(name.tier).toBe("suggest");
    expect(name.status).toBe("differs");
    expect(name.action).toBe("suggest");
    expect(name.substrate_value).toBe("New Opportunity Name");
  });

  it("Name matches → no_op", () => {
    const sf = { Id: "006xxx", Name: "Same Name" };
    const substrate = makeSubstrate({
      opportunity: { name: "Same Name" },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const name = diff.items.find((i) => i.sf_field === "Name")!;
    expect(name.status).toBe("match");
    expect(name.action).toBe("no_op");
  });
});

describe("diffOpportunity — system-managed SF fields are forced readonly", () => {
  // LastActivityDate is system-computed by Salesforce from the most
  // recent Task/Event on the record. PATCH calls against it are silently
  // ignored, so the engine must classify it as readonly even though
  // it'd otherwise look like an auto-write candidate.
  it("LastActivityDate is tier=readonly + action=surface_only when SF blank", () => {
    const sf = { Id: "006xxx", Name: "Test", LastActivityDate: null };
    const substrate = makeSubstrate({
      activities: [
        { id: "a1", type: "call", occurred_at: "2026-05-01T10:00:00Z" },
        { id: "a2", type: "email", occurred_at: "2026-05-06T15:00:00Z" },
      ],
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const last = diff.items.find((i) => i.sf_field === "LastActivityDate")!;
    expect(last.tier).toBe("readonly");
    expect(last.status).toBe("sf_blank");
    expect(last.action).toBe("surface_only"); // never write_now, ever
    expect(last.substrate_value).toBe("2026-05-06");
  });

  it("LastActivityDate disagreement still surface_only (system-managed)", () => {
    const sf = {
      Id: "006xxx",
      Name: "Test",
      LastActivityDate: "2026-04-01",
    };
    const substrate = makeSubstrate({
      activities: [
        { id: "a1", type: "call", occurred_at: "2026-05-06T15:00:00Z" },
      ],
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const last = diff.items.find((i) => i.sf_field === "LastActivityDate")!;
    expect(last.action).toBe("surface_only");
  });
});

describe("diffOpportunity — value normalization", () => {
  it("amount tolerates trailing zeros: 125000 === 125000.00", () => {
    const sf = { Id: "006xxx", Name: "Test", Amount: 125000 };
    const substrate = makeSubstrate({
      opportunity: { name: "Test", amount: 125000.0 },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const amt = diff.items.find((i) => i.sf_field === "Amount")!;
    expect(amt.status).toBe("match");
    expect(amt.action).toBe("no_op");
  });

  it("whitespace-only SF strings normalize to null (treated as blank)", () => {
    const sf = {
      Id: "006xxx",
      Name: "   ",
    };
    const substrate = makeSubstrate({
      opportunity: { name: "Real Deal Name" },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const name = diff.items.find((i) => i.sf_field === "Name")!;
    expect(name.status).toBe("sf_blank");
    expect(name.action).toBe("suggest");
  });

  it("case-insensitive match: 'Acme Deal' === 'acme deal'", () => {
    const sf = {
      Id: "006xxx",
      Name: "acme deal",
    };
    const substrate = makeSubstrate({
      opportunity: { name: "Acme Deal" },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const name = diff.items.find((i) => i.sf_field === "Name")!;
    expect(name.status).toBe("match");
  });
});

describe("diffOpportunity — rollup + actionable filter", () => {
  it("rollups sum to total", () => {
    const sf = {
      Id: "006xxx",
      Name: "Test",
      StageName: "Closing",
      Amount: 100000,
    };
    const substrate = makeSubstrate();
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const sumStatus =
      diff.by_status.match +
      diff.by_status.sf_blank +
      diff.by_status.substrate_blank +
      diff.by_status.differs;
    const sumAction =
      diff.by_action.write_now +
      diff.by_action.suggest +
      diff.by_action.surface_only +
      diff.by_action.no_op;
    expect(sumStatus).toBe(diff.total);
    expect(sumAction).toBe(diff.total);
  });

  it("actionableItems() drops no_ops, keeps suggest/write/surface", () => {
    const sf = {
      Id: "006xxx",
      Name: "Old Deal Name",
      StageName: "Closing",
    };
    const substrate = makeSubstrate({
      opportunity: {
        name: "New Deal Name",
        stage_label: "Negotiation",
      },
    });
    const diff = diffOpportunity(sf, substrate, "deal-1");
    const actionable = actionableItems(diff);
    expect(actionable.every((i) => i.action !== "no_op")).toBe(true);
    // At minimum we expect Stage (surface_only) and Name (suggest) here.
    const fields = new Set(actionable.map((i) => i.sf_field));
    expect(fields.has("StageName")).toBe(true);
    expect(fields.has("Name")).toBe(true);
  });
});

describe("diffOpportunity — result shape", () => {
  it("preserves sf_id and substrate_deal_id from input", () => {
    const sf = { Id: "006xxxRealId", Name: "Test" };
    const diff = diffOpportunity(sf, makeSubstrate(), "substrate-deal-42");
    expect(diff.sf_id).toBe("006xxxRealId");
    expect(diff.substrate_deal_id).toBe("substrate-deal-42");
    expect(diff.sf_name).toBe("Test");
  });

  it("each item has all required fields populated", () => {
    const diff = diffOpportunity(
      { Id: "x", Name: "Test" },
      makeSubstrate(),
      "deal-1",
    );
    for (const item of diff.items) {
      expect(item.field_label).toBeTruthy();
      expect(item.sf_field).toBeTruthy();
      expect(["auto", "suggest", "readonly"]).toContain(item.tier);
      expect(["match", "sf_blank", "substrate_blank", "differs"]).toContain(
        item.status,
      );
      expect(["write_now", "suggest", "surface_only", "no_op"]).toContain(
        item.action,
      );
      expect(item.reason).toBeTruthy();
    }
  });
});
