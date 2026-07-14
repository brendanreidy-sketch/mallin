/**
 * VerificationFramework tests — proves the 4-stage signer progression.
 *
 * The Beneba proof case: signer named at call 3 (no path), no champion
 * commitment, no deal-desk readiness. Expected output:
 *   Call 3: silent (stage 1 satisfied — name in field)
 *   Call 4: rep alert — stage 2 (engagement path) missing
 *   Call 5: rep alert — stage 3 (champion commitment) missing
 *   Call 6: manager alert — stage 4 (deal-desk readiness) missing
 */

import { describe, it, expect } from "vitest";
import {
  detectFrameworkGaps,
  detectAllEscalations,
  emptyBehavioralSignals,
  mergeBehavioral,
  SIGNER_VERIFICATION,
  type BehavioralSignals,
} from "./methodology-escalation";

function bs(over: Partial<BehavioralSignals> = {}): BehavioralSignals {
  return { ...emptyBehavioralSignals(), ...over };
}

// Build cumulative state arrays for N calls. addAtCall is 1-based.
function buildStates(
  totalCalls: number,
  addAtCall: Record<number, Record<string, string>> = {},
) {
  const cumulative: Record<string, string | null> = {};
  const out: Array<Record<string, string | null>> = [];
  for (let i = 1; i <= totalCalls; i++) {
    Object.assign(cumulative, addAtCall[i] ?? {});
    out.push({ ...cumulative });
  }
  return out;
}

describe("SIGNER_VERIFICATION — Stage 1: Identification", () => {
  it("missing name through call 2 → warn fires at call 2", () => {
    const states = buildStates(3);
    const behavioral = [bs(), bs(), bs()];
    const r = detectFrameworkGaps(states, behavioral, "Test Deal");
    const alertsAt2 = r.get(2) ?? [];
    expect(
      alertsAt2.some(
        (a) =>
          a.rule_id === "signer_verification_stage_1" &&
          a.severity === "warn" &&
          // Voice rewrite (May 10): drop "missing step N" process
          // language; assert content discipline instead — the message
          // must reference signing without analyst register.
          /signs|signer|sign this/i.test(a.rep_message),
      ),
    ).toBe(true);
  });

  it("name present at call 1 → no Stage 1 alert at call 2", () => {
    const states = buildStates(3, {
      1: { Who_is_the_Economic_Buyer__c: "Greg" },
    });
    const r = detectFrameworkGaps(states, [bs(), bs(), bs()], "Test");
    const stage1At2 = (r.get(2) ?? []).find((a) =>
      a.rule_id.endsWith("stage_1"),
    );
    expect(stage1At2).toBeUndefined();
  });
});

describe("SIGNER_VERIFICATION — Stage 2: Engagement path", () => {
  it("name only (no path) by call 4 → stage 2 warn fires", () => {
    const states = buildStates(4, {
      3: { Who_is_the_Economic_Buyer__c: "Greg, signer" },
    });
    const r = detectFrameworkGaps(
      states,
      [bs(), bs(), bs(), bs()],
      "Test",
    );
    const stage2 = (r.get(4) ?? []).find((a) =>
      a.rule_id.endsWith("stage_2"),
    );
    expect(stage2).toBeDefined();
    expect(stage2!.severity).toBe("warn");
    // Voice rewrite (May 10): assert content (buying motion / pace)
    // instead of process labels ("step 2 / engagement path").
    expect(stage2!.rep_message).toMatch(/buying motion|pace the deal|enter|objections/i);
  });

  it("path satisfied via behavioral signal → no stage 2 alert", () => {
    const states = buildStates(4, {
      3: { Who_is_the_Economic_Buyer__c: "Greg, signer" },
    });
    const behavioral = [bs(), bs(), bs(), bs({ signer_engagement_path_known: "yes" })];
    const r = detectFrameworkGaps(states, behavioral, "Test");
    const stage2 = (r.get(4) ?? []).find((a) =>
      a.rule_id.endsWith("stage_2"),
    );
    expect(stage2).toBeUndefined();
  });

  it("path satisfied via field text ('signs after legal review') → no alert", () => {
    const states = buildStates(4, {
      3: {
        Who_is_the_Economic_Buyer__c:
          "Greg — signs after legal review, John briefs at proposal stage",
      },
    });
    const r = detectFrameworkGaps(
      states,
      [bs(), bs(), bs(), bs()],
      "Test",
    );
    const stage2 = (r.get(4) ?? []).find((a) =>
      a.rule_id.endsWith("stage_2"),
    );
    expect(stage2).toBeUndefined();
  });
});

describe("SIGNER_VERIFICATION — Stage 3: Champion commitment", () => {
  it("path known but no champion commitment by call 5 → stage 3 warn", () => {
    const states = buildStates(5, {
      3: { Who_is_the_Economic_Buyer__c: "Greg" },
    });
    const behavioral = [
      bs(),
      bs(),
      bs(),
      bs({ signer_engagement_path_known: "yes" }), // satisfies stage 2
      bs(),
    ];
    const r = detectFrameworkGaps(states, behavioral, "Test");
    const stage3 = (r.get(5) ?? []).find((a) =>
      a.rule_id.endsWith("stage_3"),
    );
    expect(stage3).toBeDefined();
    expect(stage3!.severity).toBe("warn");
    // Voice rewrite (May 10): assert content (commitment / leverage /
    // signature time) instead of process label "step 3 / explicit
    // commitment".
    expect(stage3!.rep_message).toMatch(/commitment|leverage|signature time/i);
  });

  it("champion commitment recorded → no stage 3 alert", () => {
    const states = buildStates(5, {
      3: { Who_is_the_Economic_Buyer__c: "Greg, signs after review" },
    });
    const behavioral = [
      bs(),
      bs(),
      bs(),
      bs(),
      bs({ champion_committed_to_signer_path: "yes" }),
    ];
    const r = detectFrameworkGaps(states, behavioral, "Test");
    const stage3 = (r.get(5) ?? []).find((a) =>
      a.rule_id.endsWith("stage_3"),
    );
    expect(stage3).toBeUndefined();
  });
});

describe("SIGNER_VERIFICATION — Stage 4: Deal-desk readiness", () => {
  it("missing vendor-of-choice by call 6 → manager escalation", () => {
    const states = buildStates(6, {
      3: { Who_is_the_Economic_Buyer__c: "Greg, signs after review" },
      6: { CloseDate: "2026-12-31" }, // close date present
    });
    const behavioral = Array(6)
      .fill(0)
      .map(() => bs({ champion_committed_to_signer_path: "yes" }));
    const r = detectFrameworkGaps(states, behavioral, "Beneba");
    const stage4 = (r.get(6) ?? []).find((a) =>
      a.rule_id.endsWith("stage_4"),
    );
    expect(stage4).toBeDefined();
    expect(stage4!.severity).toBe("escalate_to_manager");
    expect(stage4!.manager_message).toContain("Beneba");
    // Voice discipline (revised May 10): rep_message must NAME the three
    // prereqs the buyer hasn't locked. Replaces the older
    // "missing step 4 / deal desk" assertion that baked in process-y
    // sales-ops jargon.
    expect(stage4!.rep_message).toMatch(/full name/i);
    expect(stage4!.rep_message).toMatch(/signature date/i);
    expect(stage4!.rep_message).toMatch(/choosing|vendor choice|going with/i);
  });

  it("'last name TBD' value blocks stage 4 satisfaction", () => {
    const states = buildStates(6, {
      6: {
        Who_is_the_Economic_Buyer__c:
          "Greg, last name TBD, vendor of choice confirmed",
        CloseDate: "2026-12-31",
      },
    });
    const r = detectFrameworkGaps(
      states,
      Array(6).fill(bs({ champion_committed_to_signer_path: "yes" })),
      "Test",
    );
    const stage4 = (r.get(6) ?? []).find((a) =>
      a.rule_id.endsWith("stage_4"),
    );
    expect(stage4).toBeDefined();
  });

  it("all four pieces present → no stage 4 alert", () => {
    const states = buildStates(6, {
      6: {
        Who_is_the_Economic_Buyer__c:
          "Greg Smith, CFO. Signs after legal review. Vendor of choice declared.",
        CloseDate: "2026-12-31",
      },
    });
    const r = detectFrameworkGaps(
      states,
      Array(6).fill(bs({ champion_committed_to_signer_path: "yes" })),
      "Test",
    );
    const stage4 = (r.get(6) ?? []).find((a) =>
      a.rule_id.endsWith("stage_4"),
    );
    expect(stage4).toBeUndefined();
  });
});

describe("SIGNER_VERIFICATION — the Beneba progression", () => {
  // Reproduces what we expect to see for Beneba AFTER re-running the
  // extractor with behavioral signals. Until that runs, this asserts
  // the framework's behavior on the canonical scenario.
  it("identification by call 3, no path/commitment/readiness → calls 4/5/6 each fire", () => {
    const states = buildStates(6, {
      // Champion at call 1
      1: { Who_is_the_Champion__c: "John (CAO)" },
      // Signer named at call 3 — but no path text in the value
      3: { Who_is_the_Economic_Buyer__c: "Greg" },
    });
    // Through call 6: champion never committed, path never confirmed.
    const behavioral = Array(6).fill(bs());
    const r = detectFrameworkGaps(states, behavioral, "Beneba Industries");

    // Call 3: stage 1 satisfied (name present). No alert.
    const call2Alerts = r.get(2) ?? [];
    const call2Stage1 = call2Alerts.find((a) => a.rule_id.endsWith("stage_1"));
    // Stage 1 fires at call 2 because name only arrives at call 3
    expect(call2Stage1).toBeDefined();

    // Call 4: stage 2 fires (engagement path missing).
    const call4 = r.get(4) ?? [];
    expect(
      call4.find((a) => a.rule_id.endsWith("stage_2")),
    ).toBeDefined();

    // Call 5: stage 3 fires (champion commitment missing).
    const call5 = r.get(5) ?? [];
    expect(
      call5.find((a) => a.rule_id.endsWith("stage_3")),
    ).toBeDefined();

    // Call 6: stage 4 fires as MANAGER escalation.
    const call6 = r.get(6) ?? [];
    const stage4 = call6.find((a) => a.rule_id.endsWith("stage_4"));
    expect(stage4).toBeDefined();
    expect(stage4!.severity).toBe("escalate_to_manager");
  });

  it("happy path: name at 1, path at 2, commitment at 3 → no alerts past stage 1", () => {
    const states = buildStates(6, {
      1: { Who_is_the_Champion__c: "John (CAO)" },
      2: {
        Who_is_the_Economic_Buyer__c:
          "Greg — signs after legal review, John briefs at proposal stage",
        CloseDate: "2026-12-31",
      },
      6: {
        Who_is_the_Economic_Buyer__c:
          "Greg Smith, CFO. Signs after legal review. Vendor of choice confirmed.",
        CloseDate: "2026-12-31",
      },
    });
    const behavioral = Array(6).fill(0).map((_, i) =>
      i >= 2
        ? bs({
            champion_committed_to_signer_path: "yes",
            signer_engagement_path_known: "yes",
          })
        : bs(),
    );
    const r = detectFrameworkGaps(states, behavioral, "Test");
    // No alerts in calls 4-6 from the framework.
    for (const c of [4, 5, 6]) {
      const fwAlerts = (r.get(c) ?? []).filter((a) =>
        a.rule_id.startsWith("signer_verification"),
      );
      expect(fwAlerts).toHaveLength(0);
    }
  });
});

describe("detectAllEscalations — combined detector", () => {
  it("framework-based signer rule supersedes legacy signer_named", () => {
    const states = buildStates(6, {
      3: { Who_is_the_Economic_Buyer__c: "Greg" },
    });
    const r = detectAllEscalations(states, Array(6).fill(bs()), "Test");
    const allAlerts = Array.from(r.values()).flat();
    // Should have signer_verification stages, NOT legacy signer_named
    const legacy = allAlerts.find((a) => a.rule_id === "signer_named");
    expect(legacy).toBeUndefined();
    const fw = allAlerts.find((a) => a.rule_id.startsWith("signer_verification"));
    expect(fw).toBeDefined();
  });

  it("legacy rules still fire for non-superseded checks (e.g. champion)", () => {
    const states = buildStates(4); // empty timeline, no champion named
    const r = detectAllEscalations(states, Array(4).fill(bs()), "Test");
    const allAlerts = Array.from(r.values()).flat();
    const championWarn = allAlerts.find((a) => a.rule_id === "champion_named");
    expect(championWarn).toBeDefined();
  });
});

describe("mergeBehavioral cumulative logic", () => {
  it("'yes' for champion sticks across the timeline", () => {
    const merged = mergeBehavioral([
      bs(),
      bs({ champion_committed_to_signer_path: "yes" }),
      bs({ champion_committed_to_signer_path: "unclear" }),
    ]);
    expect(merged.champion_committed_to_signer_path).toBe("yes");
  });

  it("path_known: yes wins over partial wins over no", () => {
    expect(
      mergeBehavioral([bs(), bs({ signer_engagement_path_known: "partial" })])
        .signer_engagement_path_known,
    ).toBe("partial");
    expect(
      mergeBehavioral([
        bs({ signer_engagement_path_known: "partial" }),
        bs({ signer_engagement_path_known: "yes" }),
      ]).signer_engagement_path_known,
    ).toBe("yes");
  });

  it("rep_asked: true sticks; null can be replaced by false", () => {
    expect(
      mergeBehavioral([bs(), bs({ rep_asked_about_signer: true }), bs()])
        .rep_asked_about_signer,
    ).toBe(true);
    expect(
      mergeBehavioral([bs(), bs({ rep_asked_about_signer: false })])
        .rep_asked_about_signer,
    ).toBe(false);
  });
});

describe("rule discipline: every alert is substantive and rep-voiced", () => {
  // Voice discipline (revised May 10): replaced the older "every
  // alert starts with 'You are missing step N'" assertion. That
  // pattern enforced process language ("step N") and analyst
  // register that violates the voice rule ("would a rep say this
  // on the phone?"). New assertions check for content discipline
  // without baking in a specific opening phrase — message must be
  // substantive, NOT pure process language.
  it("every rep_message is substantive (>=60 chars)", () => {
    for (const stage of SIGNER_VERIFICATION.stages) {
      expect(stage.rep_message.length).toBeGreaterThanOrEqual(60);
    }
  });
  it("no rep_message uses the banned process phrase 'missing step N'", () => {
    // All four stages rewritten May 10 to drop "missing step N"
    // process language. New voice rule: lead with the diagnosis
    // in plain words, no analyst register.
    for (const stage of SIGNER_VERIFICATION.stages) {
      expect(stage.rep_message).not.toMatch(/missing step \d/i);
    }
  });
});
