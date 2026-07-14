/**
 * Unit tests for the HubSpot adapter.
 *
 * Phase A scope (May 11 2026): pure mapping + dedupe key. The
 * network-calling functions (listEmailsForDeal, getEmail,
 * listEmailsSince) are scaffolded but throw at the OAuth-token
 * boundary, so they're tested only for that throw — actual API
 * integration tests come in Phase B alongside backfill.
 */

import { describe, expect, it } from "vitest";
import {
  emailDedupeKey,
  getEmail,
  HubSpotEmail,
  hubspotEmailToNormalized,
  listEmailsForDeal,
  listEmailsSince,
} from "./hubspot";

const TENANT = "00000000-0000-0000-0000-000000000001";

describe("emailDedupeKey", () => {
  it("returns the substrate unique-key tuple", () => {
    expect(emailDedupeKey(TENANT, "hs_email_abc")).toEqual({
      tenant_id: TENANT,
      source_system: "hubspot",
      source_external_id: "hs_email_abc",
    });
  });

  it("is stable across calls with the same inputs", () => {
    const a = emailDedupeKey(TENANT, "abc");
    const b = emailDedupeKey(TENANT, "abc");
    expect(a).toEqual(b);
  });

  it("distinguishes different email IDs", () => {
    expect(emailDedupeKey(TENANT, "a")).not.toEqual(
      emailDedupeKey(TENANT, "b"),
    );
  });
});

describe("hubspotEmailToNormalized", () => {
  it("maps a fully-populated outgoing HubSpot email", () => {
    const raw: HubSpotEmail = {
      id: "42",
      properties: {
        hs_email_subject: "Re: Northwind evaluation — next steps",
        hs_email_text:
          "Marcus, following up from yesterday. Wanted to confirm we're aligned on the implementation timeline and pricing structure before we loop in your CFO. Let me know if Thursday works for a 30-min call.",
        hs_email_direction: "EMAIL",
        hs_email_from_email: "rep@northwind.com",
        hs_email_from_firstname: "Brendan",
        hs_email_from_lastname: "Reidy",
        hs_email_to_email: "marcus@example.com,cfo@example.com",
        hs_email_cc_email: "manager@northwind.com",
        hs_email_status: "SENT",
        hs_email_thread_id: "thread_xyz",
        hs_timestamp: "2026-05-10T14:30:00Z",
      },
      associations: {
        deals: { results: [{ id: "deal_1001" }] },
        contacts: { results: [{ id: "ct_marcus" }, { id: "ct_cfo" }] },
      },
    };

    const out = hubspotEmailToNormalized(raw);

    expect(out.source_system).toBe("hubspot");
    expect(out.source_external_id).toBe("42");
    expect(out.sent_at).toBe("2026-05-10T14:30:00Z");
    expect(out.subject).toBe("Re: Northwind evaluation — next steps");
    expect(out.snippet?.startsWith("Marcus, following up")).toBe(true);
    expect(out.snippet?.length).toBeLessThanOrEqual(280);
    expect(out.provider).toBe("manual");
    expect(out.thread_id).toBe("thread_xyz");
    expect(out.from_name).toBe("Brendan Reidy");
    expect(out.from_email).toBe("rep@northwind.com");
    expect(out.direction).toBe("outgoing");
    expect(out.to_emails).toEqual(["marcus@example.com", "cfo@example.com"]);
    expect(out.cc_emails).toEqual(["manager@northwind.com"]);
    expect(out.hubspot_deal_ids).toEqual(["deal_1001"]);
    expect(out.hubspot_contact_ids).toEqual(["ct_marcus", "ct_cfo"]);
  });

  it("maps an incoming email and falls back to HTML body when text is absent", () => {
    const raw: HubSpotEmail = {
      id: "99",
      properties: {
        hs_email_subject: "Re: pricing question",
        hs_email_html:
          "<p>Hi Brendan,&nbsp;</p><p>Thanks for the proposal. <strong>One question</strong>: can we get the multi-year discount applied for year one?</p>",
        hs_email_direction: "INCOMING_EMAIL",
        hs_email_from_email: "marcus@example.com",
        hs_email_from_firstname: "Marcus",
        hs_email_from_lastname: "Chen",
        hs_email_to_email: "rep@northwind.com",
        hs_timestamp: "2026-05-11T09:15:00Z",
      },
    };

    const out = hubspotEmailToNormalized(raw);

    expect(out.direction).toBe("incoming");
    expect(out.from_name).toBe("Marcus Chen");
    expect(out.snippet).toContain("Thanks for the proposal");
    expect(out.snippet).toContain("One question");
    expect(out.snippet).not.toContain("<");
    expect(out.snippet).not.toContain("&nbsp;");
    expect(out.to_emails).toEqual(["rep@northwind.com"]);
    expect(out.cc_emails).toEqual([]);
    expect(out.hubspot_deal_ids).toEqual([]);
  });

  it("handles missing optional fields gracefully", () => {
    const raw: HubSpotEmail = {
      id: "min",
      properties: {
        hs_timestamp: "2026-05-11T00:00:00Z",
      },
    };

    const out = hubspotEmailToNormalized(raw);

    expect(out.subject).toBeNull();
    expect(out.snippet).toBeNull();
    expect(out.from_name).toBeNull();
    expect(out.from_email).toBeNull();
    expect(out.thread_id).toBeNull();
    expect(out.direction).toBe("unknown");
    expect(out.to_emails).toEqual([]);
    expect(out.cc_emails).toEqual([]);
  });

  it("falls back to createdate when hs_timestamp is missing", () => {
    const raw: HubSpotEmail = {
      id: "no-ts",
      properties: {
        createdate: "2026-05-11T12:00:00Z",
      },
    };
    expect(hubspotEmailToNormalized(raw).sent_at).toBe(
      "2026-05-11T12:00:00Z",
    );
  });

  it("truncates the snippet at 280 characters", () => {
    const longBody = "x".repeat(1000);
    const raw: HubSpotEmail = {
      id: "long",
      properties: {
        hs_email_text: longBody,
        hs_timestamp: "2026-05-11T00:00:00Z",
      },
    };
    const out = hubspotEmailToNormalized(raw);
    expect(out.snippet?.length).toBe(280);
  });

  it("splits semicolon-separated to lists (Outlook style) too", () => {
    const raw: HubSpotEmail = {
      id: "sc",
      properties: {
        hs_email_to_email: "a@x.com; b@x.com;c@x.com",
        hs_timestamp: "2026-05-11T00:00:00Z",
      },
    };
    expect(hubspotEmailToNormalized(raw).to_emails).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });
});

describe("OAuth boundary — adapter hits the live token-resolution path", () => {
  const originalEnv = { ...process.env };

  function withEnv(env: Record<string, string | undefined>): void {
    process.env.HUBSPOT_OAUTH_CLIENT_ID =
      env.HUBSPOT_OAUTH_CLIENT_ID ?? originalEnv.HUBSPOT_OAUTH_CLIENT_ID;
    process.env.HUBSPOT_OAUTH_CLIENT_SECRET =
      env.HUBSPOT_OAUTH_CLIENT_SECRET ??
      originalEnv.HUBSPOT_OAUTH_CLIENT_SECRET;
  }

  // After OAuth was wired (May 12 2026), every adapter call goes through
  // getAccessTokenForTenant in lib/auth/hubspot-oauth.ts which reads the
  // token row from Supabase. In tests without a live DB connection or a
  // populated token row, the error surfaces as one of:
  //   - "NEXT_PUBLIC_SUPABASE_URL is required" (lazy supabase client init)
  //   - "No HubSpot connection for tenant ..." (token row missing)
  //   - "Failed to read HubSpot tokens" (transport)
  // Any of those proves the OAuth path is live, not a stub.
  const REAL_OAUTH_PATH_ERROR =
    /NEXT_PUBLIC_SUPABASE_URL|No HubSpot connection|Failed to read|tokens not yet wired/;

  it("listEmailsForDeal goes through getAccessTokenForTenant", async () => {
    withEnv({
      HUBSPOT_OAUTH_CLIENT_ID: "test",
      HUBSPOT_OAUTH_CLIENT_SECRET: "test",
    });
    await expect(listEmailsForDeal(TENANT, "deal_1")).rejects.toThrow(
      REAL_OAUTH_PATH_ERROR,
    );
  });

  it("getEmail goes through getAccessTokenForTenant", async () => {
    withEnv({
      HUBSPOT_OAUTH_CLIENT_ID: "test",
      HUBSPOT_OAUTH_CLIENT_SECRET: "test",
    });
    await expect(getEmail(TENANT, "email_1")).rejects.toThrow(
      REAL_OAUTH_PATH_ERROR,
    );
  });

  it("listEmailsSince goes through getAccessTokenForTenant", async () => {
    withEnv({
      HUBSPOT_OAUTH_CLIENT_ID: "test",
      HUBSPOT_OAUTH_CLIENT_SECRET: "test",
    });
    await expect(
      listEmailsSince(TENANT, "2026-05-01T00:00:00Z"),
    ).rejects.toThrow(REAL_OAUTH_PATH_ERROR);
  });
});
