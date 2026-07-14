/**
 * ============================================================================
 *  Methodology escalation — verification progression, not field presence
 * ============================================================================
 *
 *  Two complementary models:
 *
 *  1. **VerificationFramework** — stage-based, time-aware. Captures
 *     deal progression patterns: identify → map path → get commitment
 *     → confirm readiness. Each stage has its own satisfaction predicate
 *     and alert. This is the right abstraction for things like signer
 *     verification, where having a name in a field doesn't mean the
 *     methodology gate is closed.
 *
 *  2. **MethodologyRule** (legacy) — simple "is field filled?" check
 *     with negative-phrase override. Still useful for binary checks
 *     like compelling-event-identified or champion-named where the
 *     answer is closer to yes/no than progression-shaped.
 *
 *  The detector runs both models and merges the alerts. New rules
 *  should prefer VerificationFramework when the methodology is a
 *  multi-stage process; legacy rules are kept for binary cases and
 *  for backward compatibility.
 *
 *  Hard rule (Brendan's design): no escalation without a missing
 *  verification step. Every alert names the step that's missing.
 *  No abstract "this is risky" — always "you are missing step X."
 *
 *  Voice: 10-yr sales manager on a 1:1. Names. No analyst register.
 *
 *  Pure logic. No I/O. The replay UI calls this with cumulative state
 *  per call + per-call behavioral signals; future Slack/email sinks
 *  consume the same EscalationAlert shape.
 * ============================================================================
 */

export type EscalationSeverity = "warn" | "escalate_to_manager";

// ─── Behavioral signals (per-call, from extractor) ─────────────────────
//
// These are what HAPPENED on the call, not what was extracted into
// fields. The verification framework uses them to check things like
// "did the rep ask about the signer?" / "did the champion commit?"

export interface BehavioralSignals {
  rep_asked_about_signer: boolean | null;
  champion_committed_to_signer_path: "yes" | "no" | "unclear";
  signer_engagement_path_known: "yes" | "partial" | "no";
}

/** Default for calls before the extractor was updated. */
export function emptyBehavioralSignals(): BehavioralSignals {
  return {
    rep_asked_about_signer: null,
    champion_committed_to_signer_path: "unclear",
    signer_engagement_path_known: "no",
  };
}

/** Reduce per-call signals to a cumulative "was this ever true through call N?" */
export function mergeBehavioral(
  perCall: BehavioralSignals[],
): BehavioralSignals {
  const merged: BehavioralSignals = {
    rep_asked_about_signer: null,
    champion_committed_to_signer_path: "unclear",
    signer_engagement_path_known: "no",
  };
  for (const s of perCall) {
    // rep_asked: true sticks (asked at least once)
    if (s.rep_asked_about_signer === true) merged.rep_asked_about_signer = true;
    else if (
      merged.rep_asked_about_signer === null &&
      s.rep_asked_about_signer === false
    )
      merged.rep_asked_about_signer = false;
    // champion_committed: yes sticks; no overrides unclear; unclear never overrides yes/no
    if (s.champion_committed_to_signer_path === "yes")
      merged.champion_committed_to_signer_path = "yes";
    else if (
      s.champion_committed_to_signer_path === "no" &&
      merged.champion_committed_to_signer_path === "unclear"
    )
      merged.champion_committed_to_signer_path = "no";
    // path_known: highest level wins (yes > partial > no)
    if (s.signer_engagement_path_known === "yes")
      merged.signer_engagement_path_known = "yes";
    else if (
      s.signer_engagement_path_known === "partial" &&
      merged.signer_engagement_path_known === "no"
    )
      merged.signer_engagement_path_known = "partial";
  }
  return merged;
}

// ─── Verification Framework — stage-based progression ────────────────────

/**
 * Explicit ask for the rep's next call when this stage is unsatisfied.
 *
 * Brendan's rule: tie-back to the execution agent must produce a CONCRETE
 * question, named target, and a one-line "why." No "explore X" or
 * "validate Y" — verbatim language the rep can use.
 *
 * Templates: {champion}, {signer}, {deal}, {N} are filled at render time.
 */
export interface NextCallAsk {
  /** Who the rep should put the question to. Usually the champion's
   *  name (or "{champion}" placeholder when name is unknown). */
  who: string;
  /** Verbatim question — what the rep literally says. Plain English,
   *  no analyst register. */
  question: string;
  /** One sentence on why this matters. */
  why: string;
}

export interface VerificationStage {
  /** 1-based stage number — used in messages: "missing step N". */
  stage: number;
  /** Stage name — "Identification", "Engagement path", etc. */
  name: string;
  /**
   * Predicate: is this stage satisfied AS OF the given cumulative state?
   * Receives cumulative SF state + cumulative behavioral signals through
   * the call being checked.
   */
  isSatisfied: (
    state: Record<string, string | null>,
    behavioral: BehavioralSignals,
  ) => boolean;
  /** 1-based call index by which the stage SHOULD be satisfied. */
  required_by_call: number;
  /** Severity if stage isn't satisfied by required_by_call. */
  severity: EscalationSeverity;
  /**
   * Rep-facing message. Must follow the rule:
   *   "You are missing step N: <stage name>. <specific action>."
   * No abstract "this is risky" allowed.
   * Templates: {N} = total calls so far, {deal} = deal name, {stage} = stage number, {stage_name} = stage name.
   */
  rep_message: string;
  /** Manager message — only used when severity = escalate_to_manager. */
  manager_message?: string;
  /**
   * The explicit question for the next call. Tied back to the
   * execution agent's "what to find out next" output. The rep should
   * be able to read this and immediately know what to ask.
   */
  next_call_ask: NextCallAsk;
}

export interface VerificationFramework {
  id: string;
  label: string;
  /** Stages in order. Each stage logically requires the previous to be
   *  satisfied (the system enforces nothing — but messages assume order). */
  stages: VerificationStage[];
}

/**
 * Signer verification framework — Brendan's 4-stage model:
 *   1. Identification  — name + title in CRM
 *   2. Engagement path — when/how the signer enters the buying motion
 *   3. Champion commitment — explicit "I'll bring them in" from champion
 *   4. Deal-desk readiness — full name, signature date, vendor-of-choice
 */
export const SIGNER_VERIFICATION: VerificationFramework = {
  id: "signer_verification",
  label: "Signer verification",
  stages: [
    {
      stage: 1,
      name: "Identification",
      isSatisfied: (state) => {
        const eb = state["Who_is_the_Economic_Buyer__c"];
        const signs = state["X15_Who_signs__c"];
        return (
          (eb !== null && eb !== undefined && String(eb).trim() !== "") ||
          (signs !== null && signs !== undefined && String(signs).trim() !== "")
        );
      },
      required_by_call: 2,
      severity: "warn",
      rep_message:
        "{N} calls in and we still don't have a name on who actually signs. Without one, every step after this is a guess.",
      next_call_ask: {
        who: "{champion}",
        question:
          "Who needs to sign the contract on your side? I want to make sure we're keeping the right person in the loop from the start.",
        why: "Without a name, every other step is a guess.",
      },
    },
    {
      stage: 2,
      name: "Engagement path",
      // Path is "known" when the signal explicitly says so OR the EB
      // field text describes a path (timing + briefer + materials).
      isSatisfied: (state, behavioral) => {
        if (behavioral.signer_engagement_path_known === "yes") return true;
        const eb = String(state["Who_is_the_Economic_Buyer__c"] ?? "").toLowerCase();
        // Indicators of a known path:
        //   - "after legal review", "at proposal stage", "at signature"
        //   - "champion will brief", "John briefs", "intro at"
        //   - "signs after X / before Y"
        const pathIndicators = [
          /(at|after|before)\s+(proposal|contract|signature|legal|review|sow|negotiation)/i,
          /(champion|john|gabriela|pedro|ash|rep)\s+(will|to|plans? to)\s+(brief|introduce|intro|bring)/i,
          /(brief|introduce|intro)(s|d|es|ed)?\s+(at|before|after|during)/i,
          /enter(s|ing)?\s+(at|after|before|during)/i,
          /engage(s|d|ment)?\s+(at|after|before|during|via)/i,
        ];
        return pathIndicators.some((p) => p.test(eb));
      },
      required_by_call: 4,
      severity: "warn",
      rep_message:
        "You know who signs, but not when they actually enter the buying motion. Without that, you can't pace the deal or pre-empt their objections.",
      next_call_ask: {
        who: "{champion}",
        question:
          "Walk me through how {signer} typically gets involved in a decision like this. When do you bring them in, and what do they need to see before they sign?",
        why: "We have a name, not a path. Without the path we can't pace the deal or pre-empt their objections.",
      },
    },
    {
      stage: 3,
      name: "Champion commitment",
      isSatisfied: (_state, behavioral) =>
        behavioral.champion_committed_to_signer_path === "yes",
      required_by_call: 5,
      severity: "warn",
      rep_message:
        "The signer path is on paper, but the champion still hasn't said 'I'll bring them in.' Without that commitment, you find out at signature time with no leverage.",
      next_call_ask: {
        who: "{champion}",
        question:
          "Are you comfortable bringing {signer} into our next conversation — or briefing them directly with what we've covered? I want to make sure we're aligned on who owns that step.",
        why: "Path on paper isn't a commitment. We need the champion to own bringing the signer in, or we'll find out at signature when we have no leverage.",
      },
    },
    {
      stage: 4,
      name: "Contract path locked",
      // Before paper goes out we need: full name (no TBD/Unknown),
      // signature date present (CloseDate filled), and explicit
      // vendor-of-choice from the buyer.
      isSatisfied: (state) => {
        const eb = String(state["Who_is_the_Economic_Buyer__c"] ?? "");
        const ebLower = eb.toLowerCase();
        // Full name check: no "TBD", "unknown", "last name unknown"
        const hasFullName =
          eb.trim().length > 0 &&
          !/last name (tbd|unknown|tba|missing|to be)/i.test(eb) &&
          !/\(.*tbd.*\)/i.test(eb);
        const hasCloseDate =
          state["CloseDate"] !== null &&
          state["CloseDate"] !== undefined &&
          String(state["CloseDate"]).trim() !== "";
        // Vendor-of-choice signal: explicit in field or covered elsewhere
        const hasVoc =
          /vendor.of.choice|voc\b|chosen vendor|selected vendor/i.test(eb) ||
          ebLower.includes("vendor of choice");
        // Champion commitment also required
        return hasFullName && hasCloseDate && hasVoc;
      },
      required_by_call: 6,
      severity: "escalate_to_manager",
      rep_message:
        "Before paper goes out, three things have to be locked: {signer}'s full name and title, the signature date they're targeting, and an explicit 'we're going with you.' Without all three, our own contract approval holds the package — the buyer never sees it, cools off, and the deal slips out of quarter.",
      manager_message:
        "{deal}: about to hit our internal contract approval without three things locked from the buyer — {signer}'s full name and title, signature date, and explicit vendor choice. Approval holds the package, buyer cools off, high slip risk.",
      next_call_ask: {
        who: "{champion}",
        question:
          "Before I can send the contract, I need three things confirmed: {signer}'s full name and title, the signature date they're targeting, and an explicit 'we're going with you' from {signer} or you. Can we lock those on this call?",
        why: "Without all three, our internal contract approval blocks the package — the buyer waits while we sit in our own queue, typically a 2-week reset.",
      },
    },
  ],
};

const FRAMEWORKS: VerificationFramework[] = [SIGNER_VERIFICATION];

/** Detect framework gaps. Each stage fires AT MOST ONCE — at the
 *  required_by_call index — when the stage isn't satisfied as of that
 *  call's cumulative state + behavioral signals. */
export function detectFrameworkGaps(
  cumulative_state_after_each_call: Array<Record<string, string | null>>,
  behavioral_per_call: BehavioralSignals[],
  deal_name: string,
  frameworks: VerificationFramework[] = FRAMEWORKS,
): Map<number, EscalationAlert[]> {
  const totalCalls = cumulative_state_after_each_call.length;
  const result = new Map<number, EscalationAlert[]>();

  for (const fw of frameworks) {
    for (const stage of fw.stages) {
      // Not yet due — skip.
      if (totalCalls < stage.required_by_call) continue;
      // Check satisfaction AS OF the required-by call.
      const stateAt =
        cumulative_state_after_each_call[stage.required_by_call - 1] ?? {};
      const behavioralCum = mergeBehavioral(
        behavioral_per_call.slice(0, stage.required_by_call),
      );
      if (stage.isSatisfied(stateAt, behavioralCum)) continue;
      // Stage missed — fire alert at required_by_call.
      const callIndex = stage.required_by_call;
      const repMsg = stage.rep_message
        .replace(/\{N\}/g, String(callIndex))
        .replace(/\{deal\}/g, deal_name)
        .replace(/\{stage\}/g, String(stage.stage))
        .replace(/\{stage_name\}/g, stage.name);
      const mgrMsg = stage.manager_message
        ? stage.manager_message
            .replace(/\{N\}/g, String(callIndex))
            .replace(/\{deal\}/g, deal_name)
            .replace(/\{stage\}/g, String(stage.stage))
            .replace(/\{stage_name\}/g, stage.name)
        : null;
      const alert: EscalationAlert = {
        rule_id: `${fw.id}_stage_${stage.stage}`,
        rule_label: `${fw.label}: ${stage.name}`,
        severity: stage.severity,
        triggered_at_call: callIndex,
        calls_missing: callIndex,
        total_calls: totalCalls,
        rep_message: repMsg,
        manager_message: stage.severity === "escalate_to_manager" ? mgrMsg : null,
        sf_fields: [], // framework-based alerts don't tie to a single field
        next_call_ask: stage.next_call_ask,
      };
      const existing = result.get(callIndex) ?? [];
      existing.push(alert);
      result.set(callIndex, existing);
    }
  }
  return result;
}

/** Combined detector: runs both frameworks AND legacy flat rules,
 *  merges results into a single per-call map. The framework rule for
 *  signer (stage-based) supersedes the legacy "signer_named" flat rule
 *  — we filter the legacy signer rule out to avoid double-firing. */
export function detectAllEscalations(
  cumulative_state_after_each_call: Array<Record<string, string | null>>,
  behavioral_per_call: BehavioralSignals[],
  deal_name: string,
): Map<number, EscalationAlert[]> {
  const fwAlerts = detectFrameworkGaps(
    cumulative_state_after_each_call,
    behavioral_per_call,
    deal_name,
  );
  // Legacy rules MINUS the ones now covered by frameworks.
  const SUPERSEDED_LEGACY_IDS = new Set(["signer_named"]);
  const legacyRules = DEFAULT_RULES.filter(
    (r) => !SUPERSEDED_LEGACY_IDS.has(r.id),
  );
  const legacyAlerts = detectEscalationsByCall(
    cumulative_state_after_each_call,
    deal_name,
    legacyRules,
  );
  // Merge maps.
  const merged = new Map<number, EscalationAlert[]>();
  for (const [k, v] of fwAlerts.entries()) {
    merged.set(k, [...(merged.get(k) ?? []), ...v]);
  }
  for (const [k, v] of legacyAlerts.entries()) {
    merged.set(k, [...(merged.get(k) ?? []), ...v]);
  }
  // Sort each call's alerts by stage/severity for deterministic UI.
  for (const k of merged.keys()) {
    const list = merged.get(k)!;
    list.sort((a, b) => {
      const sevOrder = { warn: 0, escalate_to_manager: 1 };
      const sa = sevOrder[a.severity];
      const sb = sevOrder[b.severity];
      if (sa !== sb) return sa - sb;
      return a.rule_label.localeCompare(b.rule_label);
    });
  }
  return merged;
}

export interface MethodologyRule {
  /** Stable id for the rule (used for de-duping alerts across runs). */
  id: string;
  /** Human-readable label — what this rule is checking. */
  label: string;
  /** SF fields whose presence satisfies the rule. ANY filled → satisfied. */
  sf_fields: string[];
  /** Number of calls at which the rep gets a heads-up. */
  warn_after_calls: number;
  /** Number of calls at which the manager gets pinged. */
  escalate_after_calls: number;
  /** Rep-facing message. {N} = total calls so far, {deal} = deal name. */
  rep_message: string;
  /** Manager-facing message. */
  manager_message: string;
  /** Optional: phrases (case-insensitive) that, if present in the
   *  field value, mean the gap is still real even though a value
   *  exists. Important when the AI documents gaps INSIDE the field
   *  ("Greg, still not on a call") — name is there, but the
   *  methodology requirement (signer engaged) isn't met. */
  not_satisfied_if_value_contains?: string[];
}

export interface EscalationAlert {
  rule_id: string;
  rule_label: string;
  severity: EscalationSeverity;
  /** 1-based call index at which this alert first fires. */
  triggered_at_call: number;
  calls_missing: number;
  /** Total calls in the deal so far (context for the message). */
  total_calls: number;
  /** Resolved message text (templated). */
  rep_message: string;
  /** Resolved manager message — null if severity == "warn". */
  manager_message: string | null;
  /** SF fields that should have been filled. */
  sf_fields: string[];
  /**
   * Explicit ask for the rep's NEXT CALL when this alert is active.
   * Tied back to the execution agent's "what to find out next" output.
   * Templates ({champion}, {signer}, {deal}) are filled at render time.
   *
   * null when the alert source doesn't carry a next-call prescription
   * (legacy flat rules don't yet have these — TODO).
   */
  next_call_ask: NextCallAsk | null;
}

/**
 * Defaults — sensible thresholds for a typical mid-market motion.
 * Easy to override per-tenant later.
 */
export const DEFAULT_RULES: MethodologyRule[] = [
  {
    id: "champion_named",
    label: "Champion identified",
    sf_fields: ["Who_is_the_Champion__c"],
    warn_after_calls: 2,
    escalate_after_calls: 3,
    rep_message:
      "{N} calls in and no champion named. You're talking, but no one inside is selling for you.",
    manager_message:
      "{deal}: {N} calls, no champion. Without one, this is education not buying.",
  },
  {
    id: "signer_named",
    label: "Economic buyer / signer named",
    sf_fields: ["Who_is_the_Economic_Buyer__c", "X15_Who_signs__c"],
    warn_after_calls: 3,
    escalate_after_calls: 4,
    rep_message:
      "{N} calls and the signer still hasn't been on a call. Without them, you're guessing on price and signature date.",
    manager_message:
      "{deal}: {N} calls, signer never named or in the room. Forecast risk — anything past stage 3 is fiction.",
    // Even when a name is present, if the value notes the signer hasn't
    // been on a call yet, the methodology gap is still real.
    // Substrings — match "still not on any call" or "still not on a call".
    not_satisfied_if_value_contains: [
      "still not on", // matches "still not on a call", "still not on any call"
      "still not in",
      "still no-show",
      "no-show after",
      "no show after",
      "never on a call",
      "never been on",
      "haven't met",
      "haven't been on",
      "not yet on a call",
      "not yet engaged",
    ],
  },
  {
    id: "compelling_event",
    label: "Compelling event identified",
    sf_fields: [
      "Compelling_Event_Details__c",
      "X5_Comp_Event_Why_now__c",
    ],
    warn_after_calls: 2,
    escalate_after_calls: 4,
    rep_message:
      "{N} calls and no compelling event. They like the demo. They might never buy.",
    manager_message:
      "{deal}: no compelling event after {N} calls. Disqualify or push back hard.",
  },
  {
    id: "competition_named",
    label: "Competition identified",
    sf_fields: ["Final_Competitor__c", "Shortlisted_Competition__c"],
    warn_after_calls: 3,
    escalate_after_calls: 5,
    rep_message:
      "{N} calls and we don't know who else they're looking at. You can't compete with what you can't see.",
    manager_message:
      "{deal}: competition unknown after {N} calls. Strategy is blind.",
  },
  {
    id: "power_map_complete",
    label: "Power map complete (IT + business)",
    sf_fields: ["X15_Power_Map_both_IT_Business_done__c"],
    warn_after_calls: 4,
    escalate_after_calls: 5,
    rep_message:
      "Power map still half-done at call {N}. We have one side, not the other.",
    manager_message:
      "{deal}: power map incomplete at call {N}. Will land in deal desk blind.",
    not_satisfied_if_value_contains: [
      "no it",
      "no it yet",
      "no signer",
      "no signer yet",
      "still half",
      "half done",
      "half-done",
      "not yet mapped",
    ],
  },
];

/** A field is considered "filled" (i.e. the rule is satisfied) if:
 *    - its value is meaningful (not null/empty/"(unchecked)"/"No"/etc), AND
 *    - the value does NOT contain any phrase from the rule's
 *      `not_satisfied_if_value_contains` list (so the AI documenting
 *      a gap inside the value still counts as "not satisfied"). */
function isFieldFilled(
  value: string | null | undefined,
  negativePhrases?: readonly string[],
): boolean {
  if (value === null || value === undefined) return false;
  const raw = String(value).trim();
  if (raw === "") return false;
  const t = raw.toLowerCase();
  if (t === "(unchecked)") return false;
  if (t === "no") return false;
  if (t === "—") return false;
  if (t === "tbd") return false;
  if (t === "unknown") return false;
  // If the value documents the gap, the rule isn't satisfied.
  if (negativePhrases) {
    for (const phrase of negativePhrases) {
      if (t.includes(phrase.toLowerCase())) return false;
    }
  }
  return true;
}

/** Resolve template placeholders {N} and {deal}. */
function fill(
  tpl: string,
  vars: { N: number; deal: string },
): string {
  return tpl
    .replace(/\{N\}/g, String(vars.N))
    .replace(/\{deal\}/g, vars.deal);
}

/**
 * Detect escalations for a sequence of calls.
 *
 * @param cumulative_state_after_each_call - Array indexed by call (0-based).
 *        Entry [i] is the cumulative SF state after call (i+1) has been
 *        processed (i.e. all writes from call 1..i+1 applied).
 * @param deal_name - Deal name for message templating.
 * @param rules - Rule set; defaults to DEFAULT_RULES.
 *
 * @returns Map keyed by call_index (1-based). Value is the list of
 *          alerts that FIRST fire on that call. Each alert appears
 *          exactly once (at its triggering call), so a UI can show
 *          "this call's banners" without de-duping. To get all
 *          currently-active alerts as of the deal's most recent call,
 *          flatten the map.
 */
export function detectEscalationsByCall(
  cumulative_state_after_each_call: Array<Record<string, string | null>>,
  deal_name: string,
  rules: MethodologyRule[] = DEFAULT_RULES,
): Map<number, EscalationAlert[]> {
  const totalCalls = cumulative_state_after_each_call.length;
  const result = new Map<number, EscalationAlert[]>();

  for (const rule of rules) {
    // Find the first call by which the rule was satisfied (any of its
    // sf_fields became filled).
    let firstSatisfiedAtCall: number | null = null;
    for (let i = 0; i < totalCalls; i++) {
      const state = cumulative_state_after_each_call[i];
      // A rule is satisfied if AT LEAST ONE of its sf_fields is filled
      // AND NO field's value contains a "gap noted" phrase. This
      // matters when the AI logs the gap inside one field's text
      // ("Greg, still not on any call") — even if a sibling field
      // has a clean value, the documented gap means the rule still
      // isn't met.
      const anyClean = rule.sf_fields.some((f) =>
        isFieldFilled(state[f], rule.not_satisfied_if_value_contains),
      );
      const anyDocumentedGap = rule.not_satisfied_if_value_contains
        ? rule.sf_fields.some((f) => {
            const v = state[f];
            if (v == null) return false;
            const t = String(v).toLowerCase();
            return rule.not_satisfied_if_value_contains!.some((p) =>
              t.includes(p.toLowerCase()),
            );
          })
        : false;
      if (anyClean && !anyDocumentedGap) {
        firstSatisfiedAtCall = i + 1;
        break;
      }
    }

    // Decide whether/where to fire alerts.
    const decideThresholds: Array<{
      severity: EscalationSeverity;
      threshold: number;
    }> = [
      { severity: "warn", threshold: rule.warn_after_calls },
      {
        severity: "escalate_to_manager",
        threshold: rule.escalate_after_calls,
      },
    ];

    for (const { severity, threshold } of decideThresholds) {
      // If the rule was satisfied BEFORE the threshold call, no alert fires.
      if (firstSatisfiedAtCall !== null && firstSatisfiedAtCall <= threshold)
        continue;
      // If we haven't reached the threshold call yet, no alert fires.
      if (totalCalls < threshold) continue;
      // Skip if escalate threshold equals warn threshold AND warn already
      // fires (no point doubling). We let both fire if separate calls so
      // the timeline reads naturally.
      // Fire at the threshold call.
      const callIndex = threshold;
      const alert: EscalationAlert = {
        rule_id: rule.id,
        rule_label: rule.label,
        severity,
        triggered_at_call: callIndex,
        calls_missing: callIndex,
        total_calls: totalCalls,
        rep_message: fill(rule.rep_message, { N: callIndex, deal: deal_name }),
        manager_message:
          severity === "escalate_to_manager"
            ? fill(rule.manager_message, { N: callIndex, deal: deal_name })
            : null,
        sf_fields: rule.sf_fields,
        next_call_ask: null, // legacy flat rules don't yet carry a next-call prescription
      };
      const existing = result.get(callIndex) ?? [];
      existing.push(alert);
      result.set(callIndex, existing);
    }
  }

  return result;
}

/** Convenience: flatten the per-call map into a single chronological
 *  list. Useful for "all manager escalations on this deal" summaries. */
export function flattenEscalations(
  byCall: Map<number, EscalationAlert[]>,
): EscalationAlert[] {
  const out: EscalationAlert[] = [];
  const sortedKeys = Array.from(byCall.keys()).sort((a, b) => a - b);
  for (const k of sortedKeys) out.push(...(byCall.get(k) ?? []));
  return out;
}

// ─── Tie-back: alert → explicit next-call ask ────────────────────────

export interface RenderedNextCallAsk {
  /** Rule id this came from. */
  source_rule_id: string;
  /** The missing step label. */
  missing_step: string;
  /** Rendered who/question/why with placeholders filled. */
  who: string;
  question: string;
  why: string;
}

export interface NextCallAskContext {
  champion_name?: string | null;
  signer_name?: string | null;
  deal_name?: string;
}

/** Fill {champion}, {signer}, {deal} placeholders.
 *  Falls back to neutral wording if names aren't known. */
function fillAskPlaceholders(text: string, ctx: NextCallAskContext): string {
  const champion = ctx.champion_name?.trim() || "your champion";
  const signer = ctx.signer_name?.trim() || "the signer";
  const deal = ctx.deal_name?.trim() || "this deal";
  return text
    .replace(/\{champion\}/g, champion)
    .replace(/\{signer\}/g, signer)
    .replace(/\{deal\}/g, deal);
}

/** Convert a list of EscalationAlerts into rendered next-call asks.
 *  Skips alerts that don't carry an ask (legacy flat rules). */
export function renderNextCallAsks(
  alerts: EscalationAlert[],
  ctx: NextCallAskContext,
): RenderedNextCallAsk[] {
  const out: RenderedNextCallAsk[] = [];
  for (const a of alerts) {
    if (!a.next_call_ask) continue;
    out.push({
      source_rule_id: a.rule_id,
      missing_step: a.rule_label,
      who: fillAskPlaceholders(a.next_call_ask.who, ctx),
      question: fillAskPlaceholders(a.next_call_ask.question, ctx),
      why: fillAskPlaceholders(a.next_call_ask.why, ctx),
    });
  }
  return out;
}
