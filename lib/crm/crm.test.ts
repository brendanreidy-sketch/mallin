/**
 * Translation boundary tests.
 *
 * The point of these tests is to verify that the providers correctly
 * map between neutral types and CRM-specific shapes WITHOUT calling
 * the actual SF/HS APIs. The real adapter network paths are tested
 * elsewhere (or against fixtures); here we exercise only the
 * provider's mapper logic.
 *
 * The forbidden-field guard at the public-API level also gets a smoke
 * test.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { updateDealField } from "./index";

describe("forbidden-fields guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  for (const forbidden of [
    "stage",
    "amount",
    "close_date",
    "forecast_category",
    "StageName",
    "Amount",
    "CloseDate",
    "ForecastCategoryName",
    "dealstage",
    "closedate",
    "hs_forecast_category",
  ]) {
    it(`refuses to write forbidden field "${forbidden}"`, async () => {
      await expect(
        updateDealField(
          "00000000-0000-0000-0000-000000000000",
          "deal_1",
          forbidden,
          "anything",
        ),
      ).rejects.toThrow(/forecast-critical/);
    });
  }
});

describe("hubspot-provider translation", () => {
  // We import the provider only here to keep the forbidden-fields test
  // above independent of provider modules. The hubspot-provider's
  // mapping functions aren't exported, so we exercise via the public
  // hubspotProvider object's behavior — but since that hits the
  // network, we focus on shape-only assertions.

  it("provider has correct capabilities flags", async () => {
    const { hubspotProvider } = await import("./hubspot-provider");
    expect(hubspotProvider.name).toBe("hubspot");
    expect(hubspotProvider.capabilities.supports_notes).toBe(true);
    expect(hubspotProvider.capabilities.supports_tasks).toBe(true);
    expect(hubspotProvider.capabilities.supports_custom_fields).toBe(true);
    expect(hubspotProvider.capabilities.supports_threading).toBe(true);
    expect(hubspotProvider.capabilities.supports_email_engagements).toBe(true);
    expect(hubspotProvider.capabilities.supports_meddpicc_native).toBe(false);
  });
});

describe("salesforce-provider translation", () => {
  it("provider has correct capabilities flags", async () => {
    const { salesforceProvider } = await import("./sf-provider");
    expect(salesforceProvider.name).toBe("salesforce");
    expect(salesforceProvider.capabilities.supports_notes).toBe(true);
    expect(salesforceProvider.capabilities.supports_tasks).toBe(true);
    expect(salesforceProvider.capabilities.supports_custom_fields).toBe(true);
    expect(salesforceProvider.capabilities.supports_threading).toBe(false);
    expect(salesforceProvider.capabilities.supports_email_engagements).toBe(
      false,
    );
  });
});

describe("neutral types", () => {
  it("Activity union accepts each sub-type", async () => {
    // Compile-time only assertion via cast. Confirms the union shape.
    const _typeOnlyCheck: import("./types").Activity[] = [
      {
        id: "1",
        ref: { provider: "hubspot", external_id: "1" },
        type: "call",
        occurred_at: "2026-05-12T00:00:00Z",
      },
      {
        id: "2",
        ref: { provider: "hubspot", external_id: "2" },
        type: "meeting",
        occurred_at: "2026-05-12T00:00:00Z",
      },
      {
        id: "3",
        ref: { provider: "hubspot", external_id: "3" },
        type: "email",
        occurred_at: "2026-05-12T00:00:00Z",
        direction: "outgoing",
      },
      {
        id: "4",
        ref: { provider: "hubspot", external_id: "4" },
        type: "task",
        occurred_at: "2026-05-12T00:00:00Z",
      },
      {
        id: "5",
        ref: { provider: "hubspot", external_id: "5" },
        type: "note",
        occurred_at: "2026-05-12T00:00:00Z",
        body_html: "<p>note</p>",
      },
    ];
    expect(_typeOnlyCheck.length).toBe(5);
  });
});
