/**
 * sf-writer guard tests — verifies the pre-flight filter logic.
 *
 * Note: full integration tests (real SF + audit row write) require a
 * running DB + SF connection. These tests cover the deterministic
 * guards via the exported tier classifier — proving readonly / system-
 * managed fields can never reach the write path.
 */

import { describe, it, expect } from "vitest";
import {
  tierForField,
  SF_SYSTEM_MANAGED_FIELDS,
  SF_FIELD_TIERS,
} from "../adapters/salesforce-mapping";

describe("sf-writer guard layer — fields the writer must reject", () => {
  it("readonly tier: StageName, Amount, CloseDate, ForecastCategory, Probability", () => {
    expect(tierForField("StageName")).toBe("readonly");
    expect(tierForField("Amount")).toBe("readonly");
    expect(tierForField("CloseDate")).toBe("readonly");
    expect(tierForField("ForecastCategory")).toBe("readonly");
    expect(tierForField("Probability")).toBe("readonly"); // also system-managed
  });

  it("system-managed always classifies as readonly (forced via SF_SYSTEM_MANAGED_FIELDS)", () => {
    for (const f of SF_SYSTEM_MANAGED_FIELDS) {
      expect(tierForField(f)).toBe("readonly");
    }
  });

  it("LastActivityDate: not in SF_FIELD_TIERS.readonly but forced via system-managed", () => {
    expect(SF_FIELD_TIERS.readonly).not.toContain("LastActivityDate");
    expect(SF_SYSTEM_MANAGED_FIELDS).toContain("LastActivityDate");
    expect(tierForField("LastActivityDate")).toBe("readonly");
  });

  it("forecast lifecycle fields are readonly", () => {
    expect(tierForField("IsClosed")).toBe("readonly");
    expect(tierForField("IsWon")).toBe("readonly");
    expect(tierForField("Type")).toBe("readonly");
  });
});

describe("sf-writer guard layer — fields the writer should ACCEPT for auto-write", () => {
  it("NextStep: tier=auto, writable", () => {
    expect(tierForField("NextStep")).toBe("auto");
  });

  it("Description: tier=auto, append-only summary", () => {
    expect(tierForField("Description")).toBe("auto");
  });
});

describe("sf-writer guard layer — fields that go through suggest (not auto)", () => {
  it("unclassified custom fields default to suggest, NOT eligible for auto-write", () => {
    // Org-specific custom fields aren't classified in the generic
    // standard-fields mapping, so they fall through to the safe default.
    expect(tierForField("Custom_Field_A__c")).toBe("suggest");
    expect(tierForField("Custom_Field_B__c")).toBe("suggest");
  });
});

describe("sf-writer guard layer — exhaustive matrix", () => {
  // Classify every standard field the engine knows about. The writer's
  // pre-flight filter only lets `auto` through; anything else is
  // rejected with a categorized error.
  const TEST_FIELDS = [
    // Standard — writable
    "NextStep",
    "Description",
    // Standard — forecast-impacting / system-managed
    "Name",
    "StageName",
    "Amount",
    "CloseDate",
    "LastActivityDate",
    "IsClosed",
    "IsWon",
    "Probability",
    "Type",
    // A representative org-specific custom field
    "Custom_Field__c",
  ];

  it("classification snapshot — readonly fields stay readonly, auto stays auto", () => {
    const matrix: Record<string, string> = {};
    for (const f of TEST_FIELDS) {
      matrix[f] = tierForField(f);
    }
    // The auto-write writer accepts these:
    expect(matrix["NextStep"]).toBe("auto");
    expect(matrix["Description"]).toBe("auto");
    // The auto-write writer REFUSES all of these:
    expect(matrix["StageName"]).toBe("readonly");
    expect(matrix["Amount"]).toBe("readonly");
    expect(matrix["CloseDate"]).toBe("readonly");
    expect(matrix["LastActivityDate"]).toBe("readonly");
    expect(matrix["IsClosed"]).toBe("readonly");
    expect(matrix["IsWon"]).toBe("readonly");
    expect(matrix["Probability"]).toBe("readonly");
    expect(matrix["Type"]).toBe("readonly");
    // Unclassified custom fields default to suggest (never auto):
    expect(matrix["Custom_Field__c"]).toBe("suggest");
    // Name is not forecast-impacting → suggest, still not auto:
    expect(matrix["Name"]).toBe("suggest");
  });

  it("an unknown field defaults to suggest (never auto)", () => {
    expect(tierForField("Some_Unknown_Field_That_Doesnt_Exist__c")).toBe(
      "suggest",
    );
    // → not eligible for auto-write
  });
});

// ─────────────────────────────────────────────────────────────────────
// System-attribution tag tests
// ─────────────────────────────────────────────────────────────────────
//
// Pure helpers in ./system-attribution.ts. Tested directly. The
// applyAutoUpdates wiring (this writer calls these helpers) is verified
// at the integration level via the audit row's body column once the
// migration runs.

import {
  wrapWithSystemAttribution,
  stripPriorTag,
} from "./system-attribution";

describe("system-attribution tag — what shows up in SF for the rep", () => {
  it("appends '· RevOps from <source> on <date>' to text values", () => {
    const wrapped = wrapWithSystemAttribution(
      "5/13: pricing call",
      "intro_call_2026-03-06",
      "RevOps",
    );
    expect(wrapped).toMatch(
      /^5\/13: pricing call · RevOps from intro_call_2026-03-06 on \d{4}-\d{2}-\d{2}$/,
    );
  });

  it("falls back to 'auto-logged by RevOps' when no callSource", () => {
    const wrapped = wrapWithSystemAttribution(
      "5/13: pricing call",
      null,
      "RevOps",
    );
    expect(wrapped).toMatch(
      /^5\/13: pricing call · auto-logged by RevOps on \d{4}-\d{2}-\d{2}$/,
    );
  });

  it("uses configured system name (e.g. 'Execute.ai') when set", () => {
    const wrapped = wrapWithSystemAttribution(
      "5/13: pricing call",
      "src",
      "Execute.ai",
    );
    expect(wrapped).toMatch(/· Execute\.ai from src on/);
  });

  it("strips a prior tag before re-wrapping (no nesting)", () => {
    const once = wrapWithSystemAttribution(
      "5/13: pricing call",
      "call_1",
      "RevOps",
    );
    const twice = wrapWithSystemAttribution(once, "call_2", "RevOps");
    // Should only have ONE attribution suffix
    const matches = twice.match(/· RevOps from/g);
    expect(matches).toHaveLength(1);
    expect(twice).toMatch(/from call_2 on/);
    expect(twice).not.toMatch(/from call_1/);
  });

  it("strip handles 'auto-logged by' variant too", () => {
    const once = wrapWithSystemAttribution("5/13: pricing call", null, "RevOps");
    expect(once).toMatch(/· auto-logged by RevOps on/);
    const stripped = stripPriorTag(once, "RevOps");
    expect(stripped).toBe("5/13: pricing call");
  });

  it("strips with custom system name (regex meta-chars in name escaped)", () => {
    const tagged = "Demo set for 5/14 · Execute.ai from gong_call_42 on 2026-05-09";
    const stripped = stripPriorTag(tagged, "Execute.ai");
    expect(stripped).toBe("Demo set for 5/14");
  });

  it("date can be overridden for stable test output", () => {
    const wrapped = wrapWithSystemAttribution(
      "5/13: pricing call",
      "src",
      "RevOps",
      "2026-05-09",
    );
    expect(wrapped).toBe(
      "5/13: pricing call · RevOps from src on 2026-05-09",
    );
  });
});
