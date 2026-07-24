import { describe, it, expect } from "vitest";
import {
  buildEvidencePacket,
  evidenceId,
  sourceFactKey,
  intelSourceToProvenance,
  transcriptSideToProvenance,
  oppOriginToProvenance,
  normalizeConfidence,
  type EvidenceCoordinates,
} from "./brief-evidence";
import { currentSnapshot, previousSnapshot } from "./fixtures/brief-test-deal";

describe("provenance mapping", () => {
  it("never lets an intelligence source alone earn customer_stated", () => {
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

  it("attaches tenant/deal ids, both identifiers, and a typed payload to every item", () => {
    expect(packet.items.length).toBeGreaterThan(0);
    for (const item of packet.items) {
      expect(item.tenantId).toBe(currentSnapshot.tenantId);
      expect(item.dealId).toBe(currentSnapshot.dealId);
      expect(item.evidenceId).toMatch(/^ev:/);
      expect(item.sourceFactKey).toMatch(/^sf:/);
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

  it("marks a buyer transcript statement as the only customer_stated source", () => {
    const buyerItem = packet.items.find((i) => i.sourceType === "transcript");
    expect(buyerItem?.provenance).toBe("customer_stated");
    expect(buyerItem?.payload).toMatchObject({ kind: "transcript_statement", side: "buyer" });
    expect(packet.items.filter((i) => i.provenance === "customer_stated").every((i) => i.sourceType === "transcript")).toBe(true);
  });

  it("keeps customer_input conservative while preserving its confidence", () => {
    const priority = packet.items.find((i) => i.logicalKey === "intel:priority:peak-season-reliability");
    expect(priority?.provenance).toBe("system_recorded");
    expect(priority?.confidence).toBe("high");
  });

  it("classifies Mallín-derived prep fields as mallin_inference", () => {
    expect(packet.items.find((i) => i.logicalKey === "deal:posture")?.provenance).toBe("mallin_inference");
    expect(packet.items.find((i) => i.logicalKey === "risk:r_champion_exit")?.provenance).toBe("mallin_inference");
  });
});

describe("next-action synthesis", () => {
  it("emits a Not-confirmed open_question when no explicit next-action source exists", () => {
    const noNext = {
      ...currentSnapshot,
      opportunity: { ...currentSnapshot.opportunity, nextStep: null },
      prep: { ...currentSnapshot.prep!, nextAction: undefined },
    };
    const item = buildEvidencePacket(noNext).items.find((i) => i.logicalKey === "deal:nextAction")!;
    expect(item.provenance).toBe("open_question");
    expect(item.claim).toMatch(/Not confirmed/i);
  });
});

describe("dual identifiers — evidenceId vs sourceFactKey", () => {
  it("keeps sourceFactKey stable across snapshots while evidenceId changes per occurrence", () => {
    const prevStage = buildEvidencePacket(previousSnapshot).items.find((i) => i.logicalKey === "opp:stage")!;
    const curStage = buildEvidencePacket(currentSnapshot).items.find((i) => i.logicalKey === "opp:stage")!;
    expect(curStage.sourceFactKey).toBe(prevStage.sourceFactKey); // same logical fact
    expect(curStage.evidenceId).not.toBe(prevStage.evidenceId); // different occurrence
  });

  it("keeps a prep fact's sourceFactKey stable across artifact versions", () => {
    const prevRisk = buildEvidencePacket(previousSnapshot).items.find((i) => i.logicalKey === "risk:r_integration")!;
    const curRisk = buildEvidencePacket(currentSnapshot).items.find((i) => i.logicalKey === "risk:r_integration")!;
    expect(curRisk.sourceFactKey).toBe(prevRisk.sourceFactKey);
    expect(curRisk.evidenceId).not.toBe(prevRisk.evidenceId);
  });

  it("reordering input changes neither identifier", () => {
    const reversed = {
      ...currentSnapshot,
      intelligence: { ...currentSnapshot.intelligence!, facts: [...currentSnapshot.intelligence!.facts].reverse() },
      transcripts: [...currentSnapshot.transcripts].reverse(),
    };
    const evA = buildEvidencePacket(currentSnapshot).items.map((i) => i.evidenceId).sort();
    const evB = buildEvidencePacket(reversed).items.map((i) => i.evidenceId).sort();
    const sfA = buildEvidencePacket(currentSnapshot).items.map((i) => i.sourceFactKey).sort();
    const sfB = buildEvidencePacket(reversed).items.map((i) => i.sourceFactKey).sort();
    expect(evB).toEqual(evA);
    expect(sfB).toEqual(sfA);
  });

  it("presentation-text changes do not change either identifier", () => {
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
    const pick = (snap: typeof currentSnapshot, key: string) =>
      buildEvidencePacket(snap).items.find((i) => i.logicalKey === key)!;
    const a = pick(currentSnapshot, "stk:sh_dana:disposition");
    const b = pick(relabeled, "stk:sh_dana:disposition");
    expect(b.evidenceId).toBe(a.evidenceId);
    expect(b.sourceFactKey).toBe(a.sourceFactKey);
  });

  it("unrelated facts never share either identifier", () => {
    const items = buildEvidencePacket(currentSnapshot).items;
    const evIds = items.map((i) => i.evidenceId);
    const sfKeys = items.map((i) => i.sourceFactKey);
    expect(new Set(evIds).size).toBe(evIds.length);
    expect(new Set(sfKeys).size).toBe(sfKeys.length);
  });
});

describe("collision-resistant identifier encoding", () => {
  const base: EvidenceCoordinates = {
    tenantId: "t", dealId: "d", snapshotId: "s",
    sourceType: "opportunity", sourceRecordId: "r", fieldPath: "f",
  };

  it("is pure and coordinate-dependent", () => {
    expect(evidenceId(base)).toBe(evidenceId({ ...base }));
    expect(evidenceId(base)).not.toBe(evidenceId({ ...base, fieldPath: "f2" }));
  });

  it("delimiter characters inside values cannot forge a collision", () => {
    // Naive "|".join would map both of these to "...|a|b|c"; length-prefix does not.
    const a = evidenceId({ ...base, sourceRecordId: "a|b", fieldPath: "c" });
    const b = evidenceId({ ...base, sourceRecordId: "a", fieldPath: "b|c" });
    expect(a).not.toBe(b);
    const sfa = sourceFactKey({ tenantId: "t", dealId: "d", sourceType: "opportunity", factRecordId: "a:b", fieldPath: "c" });
    const sfb = sourceFactKey({ tenantId: "t", dealId: "d", sourceType: "opportunity", factRecordId: "a", fieldPath: "b:c" });
    expect(sfa).not.toBe(sfb);
  });
});
