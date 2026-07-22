import { describe, it, expect } from "vitest";
import {
  buildEvidencePacket,
  evidenceId,
  intelSourceToProvenance,
  transcriptSideToProvenance,
  oppOriginToProvenance,
  normalizeConfidence,
  type EvidenceCoordinates,
} from "./brief-evidence";
import { currentSnapshot, previousSnapshot } from "./fixtures/brief-test-deal";

describe("provenance mapping", () => {
  it("never lets an intelligence source alone earn customer_stated", () => {
    // customer_input is NOT an identified speaker → conservative.
    expect(intelSourceToProvenance("customer_input")).toBe("system_recorded");
    expect(intelSourceToProvenance("manual")).toBe("seller_provided");
    expect(intelSourceToProvenance("apollo")).toBe("system_recorded");
    expect(intelSourceToProvenance("web_search")).toBe("system_recorded");
    expect(intelSourceToProvenance("calendar_invite")).toBe("system_recorded");
  });

  it("earns customer_stated only from an explicit buyer-side speaker", () => {
    expect(transcriptSideToProvenance("buyer")).toBe("customer_stated");
    expect(transcriptSideToProvenance("seller")).toBe("seller_provided");
    expect(transcriptSideToProvenance("unknown")).toBe("system_recorded");
    expect(transcriptSideToProvenance(undefined)).toBe("system_recorded");
  });

  it("classifies opportunity fields as seller/system, never customer_stated", () => {
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

  it("attaches tenant/deal identifiers, a stable id, and a typed payload to every item", () => {
    expect(packet.items.length).toBeGreaterThan(0);
    for (const item of packet.items) {
      expect(item.tenantId).toBe(currentSnapshot.tenantId);
      expect(item.dealId).toBe(currentSnapshot.dealId);
      expect(item.id).toMatch(/^ev:/);
      expect(item.status).toBe("current");
      expect(item.payload.kind).toBeTruthy();
    }
  });

  it("classifies the opportunity stage as seller_provided, never customer_stated", () => {
    expect(packet.items.find((i) => i.logicalKey === "opp:stage")?.provenance).toBe("seller_provided");
  });

  it("turns an unsupported opportunity amount into a Not-confirmed open_question", () => {
    const amount = packet.items.find((i) => i.logicalKey === "opp:amount");
    expect(amount?.provenance).toBe("open_question");
    expect(amount?.payload.kind).toBe("open_question");
    expect(amount?.claim).toMatch(/Not confirmed/i);
    expect(packet.gaps).toContain(amount?.claim);
  });

  it("marks a buyer transcript statement as customer_stated — the only customer_stated source", () => {
    const buyerItem = packet.items.find((i) => i.sourceType === "transcript");
    expect(buyerItem?.provenance).toBe("customer_stated");
    expect(buyerItem?.payload).toMatchObject({ kind: "transcript_statement", side: "buyer" });
    const customerStated = packet.items.filter((i) => i.provenance === "customer_stated");
    expect(customerStated.every((i) => i.sourceType === "transcript")).toBe(true);
  });

  it("keeps customer_input conservative while preserving its confidence", () => {
    const priority = packet.items.find((i) => i.logicalKey === "intel:priority:peak-season-reliability");
    expect(priority?.provenance).toBe("system_recorded"); // NOT customer_stated
    expect(priority?.confidence).toBe("high"); // preserved, not raised
    const legacy = packet.items.find((i) => i.logicalKey === "intel:context:legacy-system");
    expect(legacy?.provenance).toBe("system_recorded"); // web_search
    expect(legacy?.confidence).toBe("medium");
  });

  it("classifies Mallín-derived prep fields as mallin_inference", () => {
    expect(packet.items.find((i) => i.logicalKey === "deal:posture")?.provenance).toBe("mallin_inference");
    expect(packet.items.find((i) => i.logicalKey === "risk:r_champion_exit")?.provenance).toBe("mallin_inference");
    expect(packet.items.find((i) => i.logicalKey === "stk:sh_dana:disposition")?.provenance).toBe("mallin_inference");
  });

  it("records snapshot version metadata", () => {
    expect(packet.snapshotId).toBe("snap_nw_v2");
    expect(packet.sequence).toBe(2);
    expect(packet.version.intelligenceVersionId).toBe("intel_nw_v2");
    expect(packet.version.prepVersionId).toBe("prep_nw_v2");
    expect(packet.version.latestTranscriptId).toBe("call_nw_2");
  });

  it("keeps the previous snapshot's amount as a real seller_provided value", () => {
    const amount = buildEvidencePacket(previousSnapshot).items.find((i) => i.logicalKey === "opp:amount");
    expect(amount?.provenance).toBe("seller_provided");
    expect(amount?.claim).toMatch(/180,000/);
  });
});

describe("stable evidence ids", () => {
  it("evidenceId depends only on coordinates", () => {
    const base: EvidenceCoordinates = {
      tenantId: "t", dealId: "d", snapshotId: "s",
      sourceType: "opportunity", sourceRecordId: "o", fieldPath: "stage",
    };
    expect(evidenceId(base)).toBe(evidenceId({ ...base })); // pure
    expect(evidenceId(base)).not.toBe(evidenceId({ ...base, fieldPath: "amount" }));
    expect(evidenceId(base)).not.toBe(evidenceId({ ...base, sourceRecordId: "o2" }));
  });

  it("reordering source facts does not change any id", () => {
    const reversed = {
      ...currentSnapshot,
      intelligence: { ...currentSnapshot.intelligence!, facts: [...currentSnapshot.intelligence!.facts].reverse() },
      transcripts: [...currentSnapshot.transcripts].reverse(),
    };
    const idsA = buildEvidencePacket(currentSnapshot).items.map((i) => i.id).sort();
    const idsB = buildEvidencePacket(reversed).items.map((i) => i.id).sort();
    expect(idsB).toEqual(idsA);
  });

  it("presentation-text changes do not change ids", () => {
    const prep = currentSnapshot.prep!;
    const relabeled = {
      ...currentSnapshot,
      prep: {
        ...prep,
        topLine: "COMPLETELY DIFFERENT DISPLAY COPY",
        stakeholderStates: prep.stakeholderStates.map((s, i) =>
          i === 0 ? { ...s, dispositionRationale: "entirely different rationale prose" } : s,
        ),
      },
    };
    const idOf = (snap: typeof currentSnapshot, key: string) =>
      buildEvidencePacket(snap).items.find((i) => i.logicalKey === key)!.id;
    expect(idOf(relabeled, "stk:sh_dana:disposition")).toBe(idOf(currentSnapshot, "stk:sh_dana:disposition"));
    expect(idOf(relabeled, "deal:posture")).toBe(idOf(currentSnapshot, "deal:posture"));
  });

  it("different source facts never receive the same id", () => {
    const ids = buildEvidencePacket(currentSnapshot).items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
