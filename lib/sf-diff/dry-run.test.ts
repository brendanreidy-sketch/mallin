/**
 * Dry-run preview tests — verifies what WOULD be sent if writes were
 * enabled, never tests sending anything.
 *
 * Coverage:
 *   - readonly tier items NEVER appear in would_auto_write or would_suggest
 *   - tier=auto + status=sf_blank → goes to would_auto_write
 *   - tier=suggest items → go to would_suggest_to_rep, never auto
 *   - PATCH body has correct shape (flat field→value)
 *   - numeric fields coerce to numbers, others stay strings
 *   - cURL preview never includes a real bearer token
 *   - dry_run flag is always true
 *   - empty diff → empty payload, no errors
 */

import { describe, it, expect } from "vitest";
import { buildDryRunPreview } from "./dry-run";
import type { DiffResult, DiffItem } from "./types";

function makeDiffItem(over: Partial<DiffItem>): DiffItem {
  return {
    field_label: "Field",
    sf_field: "Field__c",
    tier: "suggest",
    sf_current: null,
    substrate_value: "value",
    status: "sf_blank",
    action: "suggest",
    reason: "test",
    ...over,
  };
}

function makeDiff(items: DiffItem[]): DiffResult {
  return {
    sf_id: "006xxxTestId12345",
    sf_name: "Test Opp",
    substrate_deal_id: "deal-1",
    total: items.length,
    by_status: { match: 0, sf_blank: 0, substrate_blank: 0, differs: 0 },
    by_action: { write_now: 0, suggest: 0, surface_only: 0, no_op: 0 },
    items,
  };
}

describe("buildDryRunPreview — readonly hard-locked out of all payloads", () => {
  it("readonly + differs (surface_only) → goes to excluded_readonly, NOT to auto/suggest", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "StageName",
        tier: "readonly",
        action: "surface_only",
        status: "differs",
        sf_current: "Negotiation",
        substrate_value: "Closing",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.would_auto_write.items).toHaveLength(0);
    expect(r.would_suggest_to_rep.items).toHaveLength(0);
    expect(r.excluded_readonly.items).toHaveLength(1);
    expect(r.would_auto_write.body).toEqual({}); // empty body
  });

  it("readonly + match (no_op) → still goes to excluded_readonly for audit", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "Amount",
        tier: "readonly",
        action: "no_op",
        status: "match",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.excluded_readonly.items).toHaveLength(1);
    expect(r.would_auto_write.items).toHaveLength(0);
    expect(r.would_suggest_to_rep.items).toHaveLength(0);
  });

  it("multiple readonly fields all stay out of payload", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "StageName",
        tier: "readonly",
        action: "surface_only",
      }),
      makeDiffItem({
        sf_field: "Amount",
        tier: "readonly",
        action: "surface_only",
      }),
      makeDiffItem({
        sf_field: "CloseDate",
        tier: "readonly",
        action: "surface_only",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.excluded_readonly.items).toHaveLength(3);
    expect(Object.keys(r.would_auto_write.body)).toHaveLength(0);
  });
});

describe("buildDryRunPreview — auto-write payload shape", () => {
  it("tier=auto + write_now → in body", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "LastActivityDate",
        tier: "auto",
        action: "write_now",
        status: "sf_blank",
        substrate_value: "2026-04-03",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.would_auto_write.items).toHaveLength(1);
    expect(r.would_auto_write.body).toEqual({
      LastActivityDate: "2026-04-03",
    });
  });

  it("PATCH method + correct REST URL", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "LastActivityDate",
        tier: "auto",
        action: "write_now",
        substrate_value: "2026-04-03",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.would_auto_write.method).toBe("PATCH");
    expect(r.would_auto_write.rest_url).toBe(
      "/services/data/v62.0/sobjects/Opportunity/006xxxTestId12345",
    );
  });

  it("cURL preview redacts bearer token", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "LastActivityDate",
        tier: "auto",
        action: "write_now",
        substrate_value: "2026-04-03",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.would_auto_write.curl_preview).toMatch(/REDACTED/);
    expect(r.would_auto_write.curl_preview).not.toMatch(/Bearer [A-Za-z0-9]/);
  });

  it("no auto items → cURL preview says nothing to send", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "Foo__c",
        tier: "suggest",
        action: "suggest",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.would_auto_write.curl_preview).toMatch(/no auto-write/i);
    expect(r.would_auto_write.body).toEqual({});
  });
});

describe("buildDryRunPreview — value coercion", () => {
  it("Amount-shaped fields coerce to number in body", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "Net_Product_ARR_Year_1__c",
        tier: "auto",
        action: "write_now",
        substrate_value: "75000",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(typeof r.would_auto_write.body["Net_Product_ARR_Year_1__c"]).toBe(
      "number",
    );
    expect(r.would_auto_write.body["Net_Product_ARR_Year_1__c"]).toBe(
      75000,
    );
  });

  it("'true' / 'false' strings coerce to booleans", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "Some_Flag__c",
        tier: "auto",
        action: "write_now",
        substrate_value: "true",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.would_auto_write.body["Some_Flag__c"]).toBe(true);
  });

  it("non-numeric strings stay as strings", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "Description",
        tier: "auto",
        action: "write_now",
        substrate_value: "Pricing call w/ Priya+Marcus",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.would_auto_write.body["Description"]).toBe(
      "Pricing call w/ Priya+Marcus",
    );
  });

  it("null substrate_value → null in body (clears field)", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "NextStep",
        tier: "auto",
        action: "write_now",
        substrate_value: null,
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.would_auto_write.body["NextStep"]).toBeNull();
  });
});

describe("buildDryRunPreview — invariants", () => {
  it("dry_run is always true", () => {
    expect(buildDryRunPreview(makeDiff([])).dry_run).toBe(true);
  });

  it("empty diff → empty body, all summary counts 0", () => {
    const r = buildDryRunPreview(makeDiff([]));
    expect(r.would_auto_write.body).toEqual({});
    expect(r.summary.auto_count).toBe(0);
    expect(r.summary.suggest_count).toBe(0);
    expect(r.summary.excluded_readonly_count).toBe(0);
  });

  it("payload_size_bytes matches body JSON length", () => {
    const diff = makeDiff([
      makeDiffItem({
        sf_field: "LastActivityDate",
        tier: "auto",
        action: "write_now",
        substrate_value: "2026-04-03",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.summary.payload_size_bytes).toBe(
      JSON.stringify(r.would_auto_write.body).length,
    );
  });

  it("realistic mixed diff: stages routed correctly", () => {
    const diff = makeDiff([
      // readonly differs → excluded
      makeDiffItem({
        sf_field: "StageName",
        tier: "readonly",
        action: "surface_only",
        status: "differs",
      }),
      // auto blank → write_now
      makeDiffItem({
        sf_field: "LastActivityDate",
        tier: "auto",
        action: "write_now",
        status: "sf_blank",
        substrate_value: "2026-04-03",
      }),
      // suggest → suggest
      makeDiffItem({
        sf_field: "Who_is_the_Economic_Buyer__c",
        tier: "suggest",
        action: "suggest",
        substrate_value: "Priya Anand (VP Finance)",
      }),
      // suggest match → no_op, dropped
      makeDiffItem({
        sf_field: "Name",
        tier: "suggest",
        action: "no_op",
        status: "match",
      }),
    ]);
    const r = buildDryRunPreview(diff);
    expect(r.summary.auto_count).toBe(1);
    expect(r.summary.suggest_count).toBe(1);
    expect(r.summary.excluded_readonly_count).toBe(1);
    expect(r.would_auto_write.body).toEqual({
      LastActivityDate: "2026-04-03",
    });
    expect(r.would_suggest_to_rep.items[0].sf_field).toBe(
      "Who_is_the_Economic_Buyer__c",
    );
  });
});
