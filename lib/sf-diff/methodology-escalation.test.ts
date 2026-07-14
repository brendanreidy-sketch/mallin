/**
 * methodology-escalation tests — verifies escalation logic on synthetic
 * call timelines.
 */

import { describe, it, expect } from "vitest";
import {
  detectEscalationsByCall,
  flattenEscalations,
  DEFAULT_RULES,
  type MethodologyRule,
} from "./methodology-escalation";

// Helper: build a state array of N calls. State at call i applies all
// fields from filledByCall[i] (1-based key).
function makeTimeline(
  totalCalls: number,
  filledByCall: Record<number, Record<string, string>> = {},
): Array<Record<string, string | null>> {
  const cumulative: Record<string, string | null> = {};
  const out: Array<Record<string, string | null>> = [];
  for (let i = 1; i <= totalCalls; i++) {
    const adds = filledByCall[i] ?? {};
    Object.assign(cumulative, adds);
    out.push({ ...cumulative });
  }
  return out;
}

describe("detectEscalationsByCall — happy paths", () => {
  it("rule satisfied before warn threshold → no alerts", () => {
    const timeline = makeTimeline(6, {
      1: { Who_is_the_Champion__c: "Pedro" }, // satisfied at call 1
      2: { Who_is_the_Economic_Buyer__c: "Marcus" }, // satisfied at call 2
    });
    const r = detectEscalationsByCall(timeline, "Test Deal");
    const allAlerts = flattenEscalations(r);
    const championAlerts = allAlerts.filter((a) => a.rule_id === "champion_named");
    const signerAlerts = allAlerts.filter((a) => a.rule_id === "signer_named");
    expect(championAlerts).toHaveLength(0);
    expect(signerAlerts).toHaveLength(0);
  });

  it("rule never satisfied → both warn AND escalate alerts fire", () => {
    const timeline = makeTimeline(6, {
      1: { Who_is_the_Champion__c: "Pedro" }, // champion fine
      // signer never named
    });
    const r = detectEscalationsByCall(timeline, "Test Deal");
    const signerAlerts = flattenEscalations(r).filter(
      (a) => a.rule_id === "signer_named",
    );
    expect(signerAlerts).toHaveLength(2);
    expect(signerAlerts[0].severity).toBe("warn");
    expect(signerAlerts[0].triggered_at_call).toBe(3);
    expect(signerAlerts[1].severity).toBe("escalate_to_manager");
    expect(signerAlerts[1].triggered_at_call).toBe(4);
  });

  it("rule satisfied AFTER warn but BEFORE escalate → only warn fires", () => {
    const timeline = makeTimeline(6, {
      1: { Who_is_the_Champion__c: "Pedro" },
      4: { Who_is_the_Economic_Buyer__c: "Marcus" }, // satisfied at call 4
    });
    const r = detectEscalationsByCall(timeline, "Test Deal");
    const signerAlerts = flattenEscalations(r).filter(
      (a) => a.rule_id === "signer_named",
    );
    // warn threshold is 3, escalate is 4. Satisfied at 4 means warn fires
    // (3 < 4) but escalate doesn't (satisfied at <=4).
    expect(signerAlerts).toHaveLength(1);
    expect(signerAlerts[0].severity).toBe("warn");
    expect(signerAlerts[0].triggered_at_call).toBe(3);
  });
});

describe("detectEscalationsByCall — Beneba case (the proof)", () => {
  it("Beneba: champion call 1, signer never → escalate at call 4", () => {
    // Mirrors what actually happened: John identified call 1, Greg never
    // named through 6 calls.
    const timeline = makeTimeline(6, {
      1: {
        Who_is_the_Champion__c: "John Franceski (CAO)",
        Compelling_Event_Details__c: "Excel breaking, growth pressure",
        X5_Comp_Event_Why_now__c: "Yes",
      },
      4: { Final_Competitor__c: "TreasurX" },
      // Power map and signer never satisfied
    });
    const byCall = detectEscalationsByCall(timeline, "Beneba Industries");
    const allAlerts = flattenEscalations(byCall);

    // Signer should escalate at call 4
    const signerEscalate = allAlerts.find(
      (a) =>
        a.rule_id === "signer_named" && a.severity === "escalate_to_manager",
    );
    expect(signerEscalate).toBeDefined();
    expect(signerEscalate!.triggered_at_call).toBe(4);
    expect(signerEscalate!.manager_message).toContain("Beneba Industries");
    expect(signerEscalate!.manager_message).toContain("signer");

    // Power map should escalate at call 5
    const powerEscalate = allAlerts.find(
      (a) =>
        a.rule_id === "power_map_complete" &&
        a.severity === "escalate_to_manager",
    );
    expect(powerEscalate).toBeDefined();
    expect(powerEscalate!.triggered_at_call).toBe(5);
  });

  it("Beneba case has no champion alert (filled at call 1)", () => {
    const timeline = makeTimeline(6, {
      1: { Who_is_the_Champion__c: "John Franceski (CAO)" },
    });
    const byCall = detectEscalationsByCall(timeline, "Beneba Industries");
    const championAlerts = flattenEscalations(byCall).filter(
      (a) => a.rule_id === "champion_named",
    );
    expect(championAlerts).toHaveLength(0);
  });
});

describe("detectEscalationsByCall — value filtering", () => {
  it("'(unchecked)' counts as not filled", () => {
    const timeline = makeTimeline(6, {
      1: { Who_is_the_Champion__c: "(unchecked)" },
    });
    const alerts = flattenEscalations(
      detectEscalationsByCall(timeline, "Test"),
    ).filter((a) => a.rule_id === "champion_named");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("empty string + null + 'No' all count as not filled", () => {
    const timeline = makeTimeline(6, {
      1: { Who_is_the_Champion__c: "" },
      2: { Who_is_the_Champion__c: "No" },
    });
    const alerts = flattenEscalations(
      detectEscalationsByCall(timeline, "Test"),
    ).filter((a) => a.rule_id === "champion_named");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("ANY of the rule's sf_fields filled satisfies the rule", () => {
    // signer rule has 2 sf_fields: Who_is_the_Economic_Buyer__c and X15_Who_signs__c
    const timeline = makeTimeline(6, {
      2: { X15_Who_signs__c: "Marcus" }, // only one of the two
    });
    const alerts = flattenEscalations(
      detectEscalationsByCall(timeline, "Test"),
    ).filter((a) => a.rule_id === "signer_named");
    expect(alerts).toHaveLength(0);
  });
});

describe("detectEscalationsByCall — edge cases", () => {
  it("zero calls returns empty alerts", () => {
    const r = detectEscalationsByCall([], "Test");
    expect(r.size).toBe(0);
  });

  it("only 1 call: only champion warn (threshold 2) doesn't fire yet", () => {
    const timeline = makeTimeline(1);
    const all = flattenEscalations(detectEscalationsByCall(timeline, "Test"));
    expect(all).toHaveLength(0);
  });

  it("only 2 calls: champion warn fires (threshold 2)", () => {
    const timeline = makeTimeline(2);
    const all = flattenEscalations(detectEscalationsByCall(timeline, "Test"));
    const champion = all.filter((a) => a.rule_id === "champion_named");
    expect(champion).toHaveLength(1);
    expect(champion[0].severity).toBe("warn");
  });

  it("custom rule overrides defaults", () => {
    const customRule: MethodologyRule = {
      id: "test_rule",
      label: "Test thing",
      sf_fields: ["Some_Field__c"],
      warn_after_calls: 1,
      escalate_after_calls: 2,
      rep_message: "rep msg",
      manager_message: "mgr msg",
    };
    const timeline = makeTimeline(3);
    const all = flattenEscalations(
      detectEscalationsByCall(timeline, "Test", [customRule]),
    );
    expect(all).toHaveLength(2); // warn at 1 + escalate at 2
    expect(all[0].triggered_at_call).toBe(1);
    expect(all[1].triggered_at_call).toBe(2);
  });
});

describe("DEFAULT_RULES — sanity checks", () => {
  it("each rule has warn < escalate (or warn == escalate)", () => {
    for (const r of DEFAULT_RULES) {
      expect(r.warn_after_calls).toBeLessThanOrEqual(r.escalate_after_calls);
    }
  });

  it("each rule's messages reference {N} or {deal}", () => {
    for (const r of DEFAULT_RULES) {
      expect(r.rep_message).toMatch(/\{N\}|\{deal\}/);
      expect(r.manager_message).toMatch(/\{N\}|\{deal\}/);
    }
  });

  it("rule ids are unique", () => {
    const ids = DEFAULT_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
