/**
 * Hooli Holdings — fictional deal substrate for the /demo walkthrough.
 *
 * Why this deal exists, not generic demo data:
 *   The structural shape (single-thread to economic buyer, CFO invisible
 *   after one touchpoint, late commercial frame, procurement entering at
 *   the 5th call, champion airtime collapsing, competitor anchoring price)
 *   is taken from the closed-lost retrospective in our deal corpus. The
 *   names + industry are fictional. The operational beats are real.
 *
 *   That's the credibility frame: this is what a sophisticated operator
 *   will recognize on first read as a real enterprise deal in trouble —
 *   not happy-path demo dialogue.
 *
 * Voice rules carried through every transcript snippet:
 *   - Ambiguous, partial commitments ("I think", "we're working through")
 *   - Hesitant + contradictory signals (champion in same call says
 *     both "we're moving" and "I'll get back to you")
 *   - Procurement language is procedural, not adversarial
 *   - CFO appears briefly, asks generic questions, leaves
 *   - No villain. Just the shape.
 *
 * The deal posture: in-flight, last activity = today (call 5). Mallin's
 * job at this moment is to surface the three risks the rep is about to
 * miss and draft the next move before the deal closes lost.
 */

export type DemoDealStage = "discovery" | "demo" | "evaluation" | "negotiation";
export type DemoRiskSeverity = "high" | "medium" | "low";
export type DemoOutcome = "in_flight";

export interface DemoStakeholder {
  name: string;
  title: string;
  role: "champion" | "economic_buyer" | "user" | "procurement" | "technical";
  engagement: "strong" | "moderate" | "thin" | "absent";
  /** What the rep would put in their CRM about this person. */
  note: string;
}

export interface DemoCall {
  id: string;
  date: string;
  durationMin: number;
  title: string;
  /** Who was on the call, plus their airtime in minutes. The airtime
   *  numbers matter — they drive the "champion thinning" pattern Mallin
   *  observes at call 5. */
  attendees: { name: string; airtimeMin: number; dropped?: boolean }[];
  summary: string;
  /** Short, ambiguous quotes — the kind that sophisticated operators
   *  read as load-bearing. Not happy-path dialogue. */
  excerpts: { speaker: string; quote: string; momentMin?: number }[];
}

export interface DemoRisk {
  id: string;
  severity: DemoRiskSeverity;
  title: string;
  /** One-sentence headline a manager would understand on first read. */
  headline: string;
  /** The evidence trail Mallin used to form this risk. */
  evidence: { callId: string; quote: string; observation: string }[];
  /** The pattern this matches in the corpus, surfaced to the rep without
   *  naming real customer deals. */
  patternNote: string;
}

export interface DemoSuggestedUpdate {
  id: string;
  field: string;
  fromValue: string;
  toValue: string;
  rationale: string;
  /** Is this one of the four never-auto fields (Stage, Amount, Close
   *  Date, Forecast Category)? Mallin marks these as suggest-only forever. */
  protected: boolean;
}

export interface DemoEmailDraft {
  to: string;
  subject: string;
  body: string;
  /** What about the rep's actual sent-folder voice this draft was
   *  conditioned on. Surfaces in the demo as a callout. */
  voiceNote: string;
}

export interface DemoManagerDm {
  channel: string;
  /** Compact format — deal name + severity + 2 named gaps + 1 next move.
   *  Not a paragraph. The manager reads this in five seconds, says yes
   *  or no, the conversation moves. Paragraphs invite delay. */
  lines: {
    deal: string;
    severity: string;
    gaps: string[];
    nextMove: string;
  };
  /** Severity at which the manager gets looped in. */
  triggerReason: string;
}

/** The causal chain — how Mallin connected the three risks. This is
 *  the load-bearing element of step 2 in the walkthrough. The demo
 *  shouldn't just show three separate alerts; it should show how one
 *  shift cascaded into the next, until the rep ended up reacting. */
export interface DemoCausalChain {
  /** Ordered events. Each one is a stand-alone observable behavior;
   *  read top-to-bottom, they tell the story of how the deal slipped. */
  steps: {
    actor: string;
    /** What changed. One sentence. */
    move: string;
    /** Why this matters for the next step. One sentence. */
    consequence: string;
    /** Which call this was observed on. */
    callId: string;
  }[];
  /** The summary sentence that ties the chain together — the line a
   *  rep should be able to repeat back after seeing the demo. */
  summary: string;
}

export interface DemoActionQueueItem {
  id: string;
  type: "send_email" | "post_slack_dm" | "crm_field_update_bundle";
  title: string;
  preview: string;
  /** What the audit ledger row will look like after approval. */
  ledgerPreview: {
    actionId: string;
    provider: string;
    externalObject: string;
    proposedBy: string;
    status: string;
  };
}

export interface DemoPillarCoverage {
  pillar: string;
  score: "strong" | "moderate" | "weak" | "risk";
  /** Why the score is where it is. One sentence. */
  observation: string;
}

export interface DemoSubstrate {
  /** Top-level deal metadata as the rep's CRM has it today. */
  deal: {
    name: string;
    accountIndustry: string;
    arr: number;
    stage: DemoDealStage;
    crmStageLabel: string;
    closeDateTarget: string;
    methodology: "MEDDPICC";
    /** What the CRM stage says vs. what Mallin reads the deal as. The
     *  delta is the demo's central point. */
    mallinStageRead: {
      stage: DemoDealStage;
      label: string;
      delta: string;
    };
    outcome: DemoOutcome;
  };
  stakeholders: DemoStakeholder[];
  calls: DemoCall[];
  pillarCoverage: DemoPillarCoverage[];
  /** Three risks Mallin fires at the end of call 5. The walkthrough
   *  surfaces one prominently (champion decay) and the other two
   *  populate the risk queue. */
  risks: DemoRisk[];
  causalChain: DemoCausalChain;
  suggestedUpdates: DemoSuggestedUpdate[];
  emailDraft: DemoEmailDraft;
  managerDm: DemoManagerDm;
  actionQueue: DemoActionQueueItem[];
}

export const HOOLI_HOLDINGS: DemoSubstrate = {
  deal: {
    name: "Hooli Holdings",
    accountIndustry: "Industrial holding company · 9 subsidiaries · ~$1.4B revenue",
    arr: 185000,
    stage: "negotiation",
    crmStageLabel: "Negotiation · 75% probability",
    closeDateTarget: "2026-06-30",
    methodology: "MEDDPICC",
    mallinStageRead: {
      stage: "evaluation",
      label: "Evaluation · structurally thin",
      delta:
        "CRM reads Negotiation at 75%. Mallin reads Evaluation: the buying committee hasn't validated criteria, the EB has been in one call, and procurement just entered. The 75% is a stage report, not a deal read.",
    },
    outcome: "in_flight",
  },

  stakeholders: [
    {
      name: "Marcus Hale",
      title: "Finance Manager, Hooli Holdings",
      role: "champion",
      engagement: "thin",
      note: "Champion through call 4. Airtime dropped from ~40% to ~8% at call 5. Language shifted from 'we're moving' to 'I think we have what we need.' Preparing a recommendation to Linda without the rep in the room.",
    },
    {
      name: "Linda Park",
      title: "Chief Financial Officer, Hooli Holdings",
      role: "economic_buyer",
      engagement: "absent",
      note: "Economic buyer. Attended 1 of 5 calls (call 2, demo). Dropped at 35 min of 60. Has not appeared since. Last touch: 6 weeks ago. Referenced by Marcus twice in the last two calls but never re-engaged.",
    },
    {
      name: "Devin Roy",
      title: "Senior Procurement Manager, Hooli Holdings",
      role: "procurement",
      engagement: "moderate",
      note: "Entered at call 5. Asked for win-rate-vs-Vantage + a vendor template. Drove 70% of the dialogue on a call where the champion was scheduled to lead. Procurement-entry-at-call-5 is a closing-out signal, not a buying signal.",
    },
    {
      name: "Sarah Vega",
      title: "Controller, Hooli Holdings",
      role: "technical",
      engagement: "absent",
      note: "Strong engagement on call 1 (discovery). Brought up hedge accounting requirements. Has not returned. The technical/accounting voice has been silent in the buying committee since February.",
    },
  ],

  calls: [
    {
      id: "call_01",
      date: "2026-02-12",
      durationMin: 45,
      title: "Discovery — cash visibility + reconciliation pain",
      attendees: [
        { name: "Marcus Hale", airtimeMin: 22 },
        { name: "Sarah Vega", airtimeMin: 11 },
        { name: "Rep", airtimeMin: 12 },
      ],
      summary:
        "Marcus walked through the reconciliation burden: 9 subsidiaries, 14 banks, week-end close taking 2 days. Sarah surfaced hedge accounting requirements (commodity swaps on the industrial side) and asked about audit-trail support.",
      excerpts: [
        {
          speaker: "Marcus Hale",
          quote:
            "Honestly the bigger issue isn't the reporting itself, it's that we don't trust the numbers until Wednesday. Friday close is theoretical.",
          momentMin: 14,
        },
        {
          speaker: "Sarah Vega",
          quote:
            "We've got six active commodity swaps on the industrial side. The hedge accounting workflow is part of why we're looking. If your platform doesn't handle it cleanly we'll need to layer something.",
          momentMin: 28,
        },
      ],
    },
    {
      id: "call_02",
      date: "2026-02-26",
      durationMin: 60,
      title: "Demo — Linda Park (CFO) attends",
      attendees: [
        { name: "Marcus Hale", airtimeMin: 24 },
        { name: "Linda Park", airtimeMin: 6, dropped: true },
        { name: "Sarah Vega", airtimeMin: 8, dropped: true },
        { name: "Rep", airtimeMin: 18 },
        { name: "SE", airtimeMin: 4 },
      ],
      summary:
        "First and only call with Linda Park (CFO). She joined 15 min late, asked two procedural questions, dropped at 35 min mark. Sarah dropped at 20 min. After both left, Marcus drove the remainder of the call solo.",
      excerpts: [
        {
          speaker: "Linda Park",
          quote:
            "I'm going to have to hop in a minute. Quick — what's the implementation timeline look like for something this size, and what's the typical contract structure?",
          momentMin: 22,
        },
        {
          speaker: "Linda Park",
          quote: "OK, thanks. I'll let you all keep going.",
          momentMin: 33,
        },
        {
          speaker: "Marcus Hale",
          quote:
            "She'll loop back in once we've narrowed it down. She prefers to come in at the recommendation stage.",
          momentMin: 38,
        },
      ],
    },
    {
      id: "call_03",
      date: "2026-03-12",
      durationMin: 50,
      title: "Technical deep-dive — bank connectivity + roll-ups",
      attendees: [
        { name: "Marcus Hale", airtimeMin: 18 },
        { name: "SE", airtimeMin: 28 },
        { name: "Rep", airtimeMin: 4 },
      ],
      summary:
        "SE walked Marcus through the bank connectivity matrix and the subsidiary roll-up workflow. Marcus engaged on cash-positioning specifics — solid technical session. At the end, Marcus flagged he'd be bringing procurement in 'soon.'",
      excerpts: [
        {
          speaker: "Marcus Hale",
          quote:
            "This looks good. I want to bring our procurement team in for a session — heads up, they'll be heavy on terms. Devin runs it and he'll be thorough.",
          momentMin: 47,
        },
      ],
    },
    {
      id: "call_04",
      date: "2026-03-26",
      durationMin: 35,
      title: "Proposal walkthrough — first pricing + competitive surface",
      attendees: [
        { name: "Marcus Hale", airtimeMin: 14 },
        { name: "Rep", airtimeMin: 21 },
      ],
      summary:
        "Rep presented list pricing without an incentive structure ($185K ARR, 3-year term, Net 30, 3% annual escalator). Marcus's tone was measured. First mention of competitor (Vantage) and first explicit 'I'll get back to you.'",
      excerpts: [
        {
          speaker: "Marcus Hale",
          quote:
            "OK, I'll bring this to Linda and get back to you. We also have a competitive proposal from Vantage we're working through — they came in slightly under on the year-one number.",
          momentMin: 29,
        },
        {
          speaker: "Marcus Hale",
          quote: "I think we have most of what we need from your side at this point.",
          momentMin: 33,
        },
      ],
    },
    {
      id: "call_05",
      date: "2026-04-09",
      durationMin: 40,
      title: "Procurement intro — Devin Roy enters",
      attendees: [
        { name: "Marcus Hale", airtimeMin: 3 },
        { name: "Devin Roy", airtimeMin: 28 },
        { name: "Rep", airtimeMin: 9 },
      ],
      summary:
        "Devin Roy (Senior Procurement Manager) opened the call and drove the dialogue. Asked the rep for win-rate-vs-Vantage, requested a vendor template, named end-of-Q2 as the decision target. Marcus said less than 3 minutes. Closed with Marcus saying 'Linda's expecting a recommendation.'",
      excerpts: [
        {
          speaker: "Devin Roy",
          quote:
            "I'm Devin, Senior Procurement Manager. Marcus brought me in to evaluate vendor terms. Can you walk me through your standard contract structure, payment terms, and SLA? We have a vendor template we'd like you to populate as well.",
          momentMin: 1,
        },
        {
          speaker: "Devin Roy",
          quote:
            "We're going to want to see a competitive comparison. What's your win rate against Vantage on deals this size, and where do you typically end up on commercial structure versus them?",
          momentMin: 14,
        },
        {
          speaker: "Devin Roy",
          quote:
            "We're aiming for a decision by end of Q2. I'll send the vendor template tomorrow.",
          momentMin: 36,
        },
        {
          speaker: "Marcus Hale",
          quote:
            "Yeah, I think we have what we need. Linda's expecting a recommendation.",
          momentMin: 38,
        },
      ],
    },
  ],

  pillarCoverage: [
    {
      pillar: "Metrics",
      score: "strong",
      observation:
        "Reconciliation pain quantified (2-day week-end close, 9 subsidiaries, 14 banks). Hedge-accounting requirement surfaced. Pain is real and named.",
    },
    {
      pillar: "Economic Buyer",
      score: "risk",
      observation:
        "Linda Park identified. Engagement is one call, dropped early, no follow-up across the next three calls. Champion saying 'Linda's expecting a recommendation' implies the recommendation is being prepared without the rep present.",
    },
    {
      pillar: "Decision Criteria",
      score: "weak",
      observation:
        "Buyer-named criteria: 'implementation timeline' (Linda, call 2), 'contract structure' (Linda, call 2), 'terms + SLA + vendor template' (Devin, call 5). None of these have been defined with the buyer. The criteria are open and the rep hasn't shaped them.",
    },
    {
      pillar: "Decision Process",
      score: "moderate",
      observation:
        "Stated path: Marcus → Linda → finance committee. Has not been validated. Devin's entry at call 5 suggests a parallel procurement process the rep didn't see coming.",
    },
    {
      pillar: "Identify Pain",
      score: "strong",
      observation: "Documented across calls 1 and 3. Not the issue.",
    },
    {
      pillar: "Champion",
      score: "risk",
      observation:
        "Marcus was the champion through call 4. At call 5: airtime collapse (40% → 8%), language shift ('we're moving' → 'I think we have what we need'), procurement allowed to drive an introductory call without rep coaching first. The relationship still exists; the championing has thinned.",
    },
    {
      pillar: "Competition",
      score: "weak",
      observation:
        "Vantage surfaced at call 4 (rep's first awareness). Rep showed list price without incentive at the same call. Vantage has anchored the commercial frame. Every concession from this point forward is reactive, not proactive.",
    },
  ],

  risks: [
    {
      id: "risk_champion_thinning",
      severity: "high",
      title: "Champion commitment weakened after procurement call",
      headline:
        "Marcus's airtime dropped from ~40% to ~8% at call 5. He's preparing a recommendation to Linda without you in the room.",
      evidence: [
        {
          callId: "call_04",
          quote:
            "OK, I'll bring this to Linda and get back to you. We also have a competitive proposal from Vantage we're working through.",
          observation:
            "First 'I'll get back to you' across 4 calls. First mention of competitor.",
        },
        {
          callId: "call_05",
          quote:
            "Yeah, I think we have what we need. Linda's expecting a recommendation.",
          observation:
            "'I think we have what we need' is the language of someone preparing a position, not exploring options. 'Expecting a recommendation' implies he's writing the case to Linda solo.",
        },
        {
          callId: "call_05",
          quote: "[Marcus, total airtime ~3 minutes of 40-minute call]",
          observation:
            "He let procurement drive a call he was scheduled to lead. He didn't prep you for Devin's specific questions ('win rate vs. Vantage', vendor template). Champion-behavior cost is observable.",
        },
      ],
      patternNote:
        "Champions who let procurement drive a 5th-call introduction without preparing the rep first usually have already decided the question. The 5th call isn't a buying signal — it's a closing-out signal.",
    },
    {
      id: "risk_eb_invisible",
      severity: "high",
      title: "Economic buyer (Linda Park) unengaged for 6 weeks",
      headline:
        "Linda has had 35 minutes with you across 5 months. The person who decides this hasn't been in the room since February.",
      evidence: [
        {
          callId: "call_02",
          quote:
            "I'm going to have to hop in a minute. Quick — what's the implementation timeline look like for something this size, and what's the typical contract structure?",
          observation:
            "Her only two questions. Both procedural. Both un-defined. Neither was followed up on by the rep.",
        },
        {
          callId: "call_05",
          quote: "Linda's expecting a recommendation.",
          observation:
            "Second-hand reference to the EB at the call where procurement enters. The rep has no direct line to Linda.",
        },
      ],
      patternNote:
        "EB invisible after a single touchpoint + decision criteria named-but-undefined + late-entering procurement is a structural shape associated with reactive commercial cycles and lost deals.",
    },
    {
      id: "risk_competitor_anchor",
      severity: "medium",
      title: "Competition disclosed late — Vantage anchored first",
      headline:
        "You showed list price at call 4. Vantage surfaced at the same call. Their structure is the anchor now.",
      evidence: [
        {
          callId: "call_04",
          quote:
            "...we also have a competitive proposal from Vantage we're working through — they came in slightly under on the year-one number.",
          observation:
            "Competitor named only after rep presented commercial. The frame is now relative-to-them.",
        },
        {
          callId: "call_05",
          quote:
            "What's your win rate against Vantage on deals this size, and where do you typically end up on commercial structure versus them?",
          observation:
            "Procurement is explicitly running a comparative exercise. The rep is responding, not framing.",
        },
      ],
      patternNote:
        "Commercial anchored by a competitor at proposal stage rarely recovers without an executive-level reframe. The rep needs to change the conversation off price-relative-to-Vantage before responding to the vendor template.",
    },
  ],

  causalChain: {
    steps: [
      {
        actor: "Linda Park (CFO)",
        move: "Attended call 2 demo for 18 minutes, asked two procedural questions, dropped early — and has not returned across the next three calls.",
        consequence:
          "The economic buyer is now evaluating this deal without ever defining what 'good' looks like to her. Decision criteria are open.",
        callId: "call_02",
      },
      {
        actor: "Marcus Hale (Champion)",
        move: "Started compensating — by call 4 he said 'I'll bring this to Linda' rather than scheduling Linda directly. Began acting as Linda's translator.",
        consequence:
          "Marcus is now writing the recommendation himself. He's no longer asking the rep how to position; he's deciding the position alone.",
        callId: "call_04",
      },
      {
        actor: "Devin Roy (Procurement)",
        move: "Entered at call 5 and immediately reframed the conversation around vendor terms + comparative win-rate-vs-Vantage.",
        consequence:
          "The criteria are now procurement criteria, not buyer criteria. The deal's center of gravity moved from value to commercials.",
        callId: "call_05",
      },
      {
        actor: "The rep",
        move: "Responded to Devin's prompts at call 5 — answered the win-rate question, agreed to populate the vendor template, didn't reframe.",
        consequence:
          "Rep is now reacting, not controlling. Every concession from here onward is reactive. The deal is being run by the buyer's process, not the rep's.",
        callId: "call_05",
      },
    ],
    summary:
      "Linda went quiet → Marcus started speaking for her → Devin reframed around procurement → the rep is now reacting. Three risks, one cascade. The moment to interrupt the cascade was before procurement entered. The next-best moment is now — before Marcus delivers the recommendation.",
  },

  suggestedUpdates: [
    {
      id: "su_champion",
      field: "Champion strength",
      fromValue: "Strong",
      toValue: "Cautious",
      rationale:
        "Airtime collapse (~40% → ~8%) at call 5. Language shift from 'we're moving' to 'I think we have what we need.' Procurement allowed to drive without prep. This is a thinning relationship, not yet a lost one — but the CRM record should reflect the shift so manager review can catch it.",
      protected: false,
    },
    {
      id: "su_competition",
      field: "Competition",
      fromValue: "(empty)",
      toValue: "Vantage (anchor-set at call 4)",
      rationale:
        "Vantage surfaced at call 4 + reinforced at call 5 ('win rate vs. Vantage' explicitly asked). Commercial anchor is theirs. The CRM should record this so future updates are framed against the right competitor.",
      protected: false,
    },
    {
      id: "su_risk_reason",
      field: "Risk reason",
      fromValue: "(empty)",
      toValue:
        "Champion preparing recommendation to EB without rep involvement; procurement entered at call 5",
      rationale:
        "Without naming the risk explicitly, manager review can't intervene. This field is what shows up in the deal-review dashboard.",
      protected: false,
    },
  ],

  emailDraft: {
    to: "marcus.hale@hooli-holdings.example",
    subject: "Before you sync with Linda",
    body: [
      "Marcus,",
      "",
      "Quick flag before you walk Linda through the comparison. The Vantage side-by-side undersells the structural difference in two or three places, and the implementation-risk angle she'll care about — our 6-week stand-up vs. their unspecified timeline — is easier to walk through together than to write up.",
      "",
      "30 minutes Thursday or Friday?",
      "",
      "— Sarah",
    ].join("\n"),
    voiceNote:
      "Drafted in your voice — based on your sent folder over the last 90 days. Three-paragraph follow-ups, opens with the operational flag not pleasantries, anchors on a specific structural angle not generic value language, one concrete ask, first-name signoff.",
  },

  managerDm: {
    channel: "#deals-hooli-holdings",
    lines: {
      deal: "Hooli Holdings · $185K ARR · CRM stage Negotiation · 75%",
      severity: "2 HIGH risks fired on call 5",
      gaps: [
        "Linda Park (CFO) — 1 of 5 calls, 6 weeks since last touch",
        "Champion airtime collapsed (~40% → ~8%); Marcus prepping recommendation solo",
      ],
      nextMove:
        "Request a 30 with Marcus + Linda before he sends the recommendation. Need your read.",
    },
    triggerReason:
      "Two HIGH-severity risks fired on the same call (champion thinning + EB invisible). Escalation policy loops in the manager when ≥2 HIGH risks compound on a single deal.",
  },

  actionQueue: [
    {
      id: "act_demo_email",
      type: "send_email",
      title: "Email draft — Marcus Hale (pre-Linda sync)",
      preview:
        "Before you sync with Linda — quick flag on the Vantage comparison...",
      ledgerPreview: {
        actionId: "act_demo_email_0019",
        provider: "Gmail",
        externalObject: "draft_id_pending",
        proposedBy: "Mallin Execution Agent",
        status: "DRAFT · awaiting approval",
      },
    },
    {
      id: "act_demo_dm",
      type: "post_slack_dm",
      title: "Slack DM — loop manager into deal thread",
      preview:
        "Heads up on Hooli Holdings — two flags from today's call. Procurement entered + champion airtime collapsed...",
      ledgerPreview: {
        actionId: "act_demo_dm_0020",
        provider: "Slack",
        externalObject: "#deals-hooli-holdings",
        proposedBy: "Mallin Orchestration Agent",
        status: "DRAFT · awaiting approval",
      },
    },
    {
      id: "act_demo_crm",
      type: "crm_field_update_bundle",
      title: "CRM update bundle — 3 fields (Stage 1 Suggest)",
      preview:
        "Champion: Strong → Cautious · Competition: (empty) → Vantage · Risk reason: new entry",
      ledgerPreview: {
        actionId: "act_demo_crm_0021",
        provider: "HubSpot",
        externalObject: "deal_hooli_holdings_DEMO",
        proposedBy: "Mallin Qualification Agent",
        status: "PENDING · Stage 1 Suggest gate",
      },
    },
  ],
};
