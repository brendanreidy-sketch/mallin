import { describe, it, expect } from "vitest";
import { buildEvidencePacket, type DealSnapshot } from "./brief-evidence";
import { detectChanges } from "./brief-change-detection";
import { deriveAssurance, deriveProvenanceUnion, type BriefDraft, type CoverMetadata } from "./brief-model";
import { validateBriefDraft } from "./brief-validator";

/**
 * MeetingBlock provenance rule (Commit 4A). A MeetingBlock quote is extracted
 * into a GENERATED intelligence artifact and carries NO immutable transcript /
 * segment reference (DeckQuote has only text/speaker). So it can never be
 * independently customer_stated — it is system_recorded regardless of speaker.
 * Only a directly-traceable transcript_segment (buyer side) earns customer_stated.
 */

function snap(sourceKind: "transcript_segment" | "meeting_quote", side: "buyer" | "seller" | "unknown"): DealSnapshot {
  return {
    tenantId: "t", dealId: "d", snapshotId: "s", capturedAt: "2026-06-15T00:00:00.000Z",
    opportunity: { recordId: "o", name: "Deal", origin: "crm_import" },
    transcripts: [{ transcriptId: "m1", segmentId: "q1", callDate: "2026-06-12", speaker: "Dana Ruiz", speakerSide: side, sourceKind, text: "We will provide the data." }],
  };
}
const provOf = (s: DealSnapshot) => buildEvidencePacket(s).items.find((i) => i.sourceType === "transcript")!.provenance;

describe("MeetingBlock quote provenance", () => {
  it("a buyer NAME alone is insufficient — a meeting quote stays system_recorded", () => {
    expect(provOf(snap("meeting_quote", "buyer"))).toBe("system_recorded");
  });

  it("an attendee-side MATCH alone is insufficient for a generated meeting quote", () => {
    // Even with an explicit buyer speakerSide, a meeting_quote is not customer_stated.
    expect(provOf(snap("meeting_quote", "buyer"))).not.toBe("customer_stated");
  });

  it("generated MeetingBlock text without a source segment cannot be confirmed customer evidence", () => {
    expect(provOf(snap("meeting_quote", "unknown"))).toBe("system_recorded");
  });

  it("a fully traceable transcript segment (buyer side) retains customer_stated", () => {
    expect(provOf(snap("transcript_segment", "buyer"))).toBe("customer_stated");
    expect(provOf(snap("transcript_segment", "unknown"))).toBe("system_recorded"); // ambiguous side stays conservative
  });
});

describe("ambiguous meeting evidence cannot qualify a customer commitment", () => {
  it("rejects a customer_commitment whose only supporting evidence is a system_recorded meeting quote", () => {
    const s: DealSnapshot = {
      tenantId: "t", dealId: "d", snapshotId: "s", capturedAt: "2026-06-15T00:00:00.000Z",
      opportunity: { recordId: "o", name: "Deal", origin: "crm_import" },
      transcripts: [{ transcriptId: "m1", segmentId: "q1", callDate: "2026-06-12", speaker: "Dana Ruiz", speakerSide: "buyer", sourceKind: "meeting_quote", text: "We will provide the data." }],
      prep: {
        versionId: "p1", generatedAt: "2026-06-15T00:00:00.000Z", criticalRisks: [], stakeholderStates: [],
        commitments: [{ id: "c1", label: "Provide the data", state: "open", party: "customer", owner: "Dana", supportingRefs: [{ transcriptId: "m1", segmentId: "q1" }] }],
      },
    };
    const packet = buildEvidencePacket(s);
    const commit = packet.items.find((i) => i.logicalKey === "commit:c1")!;
    const quote = packet.items.find((i) => i.sourceType === "transcript")!;
    // The commitment's supporting chain resolves to the meeting quote, which is system_recorded.
    expect(quote.provenance).toBe("system_recorded");

    const cited = [commit, quote];
    const draft: BriefDraft = {
      executiveSummary: [], whatChanged: [], customerPriorities: [], stakeholders: [], decisionProcess: [], risks: [],
      actionPlan: {
        customerCommitments: [{
          id: "cc", contentType: "customer_commitment", section: "action_plan", assertionMode: "sourced_fact",
          text: "The customer committed to provide the data.",
          evidenceIds: cited.map((c) => c.evidenceId), sourceFactKeys: [...new Set(cited.map((c) => c.sourceFactKey))],
          factBindings: [{ evidenceId: commit.evidenceId, sourceFactKey: commit.sourceFactKey, payloadKind: "commitment", fieldPath: "party", value: "customer" }],
          provenance: deriveProvenanceUnion(cited), confidence: "none", assurance: deriveAssurance(cited), appendixEligible: true,
        }],
        inferredCustomerCommitments: [], sellerActions: [], mallinRecommendations: [], unresolvedActions: [],
      },
      appendix: [],
    };
    const cover: CoverMetadata = { dealName: "Deal", classification: "INTERNAL & CONFIDENTIAL", tenantId: "t", dealId: "d", snapshotId: "s", asOf: "2026-06-16" };
    const result = validateBriefDraft(draft, { packet, changeSet: detectChanges(packet, null), cover });
    expect(result.errors.map((e) => e.code)).toContain("customer_commitment_unsupported");
  });
});
