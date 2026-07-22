import { describe, it, expect } from "vitest";
import {
  buildEvidencePacket,
  intelSourceToProvenance,
  transcriptSideToProvenance,
  oppOriginToProvenance,
  normalizeConfidence,
} from "./brief-evidence";
import { currentSnapshot, previousSnapshot } from "./fixtures/brief-test-deal";

describe("provenance mapping", () => {
  it("only customer_input earns customer_stated among intelligence sources", () => {
    expect(intelSourceToProvenance("customer_input")).toBe("customer_stated");
    expect(intelSourceToProvenance("manual")).toBe("seller_provided");
    expect(intelSourceToProvenance("apollo")).toBe("system_recorded");
    expect(intelSourceToProvenance("web_search")).toBe("system_recorded");
    expect(intelSourceToProvenance("calendar_invite")).toBe("system_recorded");
  });

  it("only a buyer-side speaker earns customer_stated in transcripts", () => {
    expect(transcriptSideToProvenance("buyer")).toBe("customer_stated");
    expect(transcriptSideToProvenance("seller")).toBe("seller_provided");
    expect(transcriptSideToProvenance("unknown")).toBe("system_recorded");
    expect(transcriptSideToProvenance(undefined)).toBe("system_recorded");
  });

  it("opportunity fields are never customer_stated", () => {
    expect(oppOriginToProvenance("seller_entered")).toBe("seller_provided");
    expect(oppOriginToProvenance("crm_import")).toBe("seller_provided");
    expect(oppOriginToProvenance("unknown")).toBe("system_recorded");
    expect(oppOriginToProvenance(undefined)).toBe("system_recorded");
  });

  it("never raises confidence; unknown degrades to none", () => {
    expect(normalizeConfidence("high")).toBe("high");
    expect(normalizeConfidence("medium")).toBe("medium");
    expect(normalizeConfidence("low")).toBe("low");
    expect(normalizeConfidence(undefined)).toBe("none");
    expect(normalizeConfidence(null)).toBe("none");
  });
});

describe("buildEvidencePacket", () => {
  const packet = buildEvidencePacket(currentSnapshot);

  it("is deterministic — same input yields deeply-equal output", () => {
    expect(buildEvidencePacket(currentSnapshot)).toEqual(packet);
  });

  it("attaches tenant and deal identifiers to every item", () => {
    expect(packet.items.length).toBeGreaterThan(0);
    for (const item of packet.items) {
      expect(item.tenantId).toBe(currentSnapshot.tenantId);
      expect(item.dealId).toBe(currentSnapshot.dealId);
      expect(item.id).toBeTruthy();
      expect(item.status).toBe("current");
    }
  });

  it("classifies the opportunity stage as seller_provided, never customer_stated", () => {
    const stage = packet.items.find((i) => i.logicalKey === "opp:stage");
    expect(stage?.provenance).toBe("seller_provided");
  });

  it("turns an unsupported opportunity amount into a Not-confirmed open_question", () => {
    const amount = packet.items.find((i) => i.logicalKey === "opp:amount");
    expect(amount?.provenance).toBe("open_question");
    expect(amount?.claim).toMatch(/Not confirmed/i);
    expect(packet.gaps).toContain(amount?.claim);
  });

  it("marks a buyer transcript statement as customer_stated", () => {
    const buyerItem = packet.items.find((i) => i.sourceType === "transcript");
    expect(buyerItem?.provenance).toBe("customer_stated");
  });

  it("preserves original confidence on intelligence facts without raising it", () => {
    const priority = packet.items.find((i) => i.logicalKey === "intel:priority:peak-season-reliability");
    expect(priority?.provenance).toBe("customer_stated"); // customer_input
    expect(priority?.confidence).toBe("high");
    const legacy = packet.items.find((i) => i.logicalKey === "intel:context:legacy-system");
    expect(legacy?.provenance).toBe("system_recorded"); // web_search
    expect(legacy?.confidence).toBe("medium");
  });

  it("classifies Mallín-derived prep fields as mallin_inference", () => {
    expect(packet.items.find((i) => i.logicalKey === "deal:posture")?.provenance).toBe("mallin_inference");
    expect(packet.items.find((i) => i.logicalKey === "risk:r_champion_exit")?.provenance).toBe("mallin_inference");
    expect(packet.items.find((i) => i.logicalKey === "stk:sh_dana:disposition")?.provenance).toBe("mallin_inference");
  });

  it("records the snapshot version metadata", () => {
    expect(packet.version.intelligenceVersionId).toBe("intel_nw_v2");
    expect(packet.version.prepVersionId).toBe("prep_nw_v2");
    expect(packet.version.latestTranscriptId).toBe("call_nw_2");
    expect(packet.capturedAt).toBe(currentSnapshot.capturedAt);
  });

  it("keeps the previous snapshot's amount as a real seller_provided value", () => {
    const prevPacket = buildEvidencePacket(previousSnapshot);
    const amount = prevPacket.items.find((i) => i.logicalKey === "opp:amount");
    expect(amount?.provenance).toBe("seller_provided");
    expect(amount?.claim).toMatch(/180,000/);
  });
});
