import type { DemoDeal } from "./pipeline";

/**
 * The made-up book of business for the demo tenant. See ./pipeline.ts for the
 * shape + the brief() expander. The rep sells Meridian (a financial-planning
 * platform); each entry is a different account evaluating it.
 *
 * Batch 1 covers every surface state: needs-you (at-risk + stalled), on-track,
 * closed-won, closed-lost. More deals append to this array.
 */
export const DEMO_PIPELINE: DemoDeal[] = [
  // ── 1. NEEDS YOU · at risk — single-threaded, exec absent, procurement in ──
  {
    key: "northwind_logistics",
    account: { name: "Northwind Logistics", domain: "northwind-logistics.example", industry: "Freight & logistics" },
    deal: { name: "Northwind Logistics — planning platform evaluation", stageLabel: "Negotiation", stagePosition: 4, totalStages: 5, arr: 142000, closeDate: "2026-08-14", methodology: "MEDDPICC" },
    stakeholders: [
      { name: "Marcus Hale", title: "Director of FP&A", role: "champion", note: "Your champion. Strong through the demo, but went quieter once procurement joined. He's now writing the recommendation for the CFO on his own." },
      { name: "Linda Park", title: "Chief Financial Officer", role: "economic_buyer", note: "The decision-maker. Has been on exactly one call out of five and left it early. Her actual view of the deal is unknown." },
      { name: "Devin Roy", title: "Senior Procurement Manager", role: "procurement", note: "Entered on the last call. Asked for a vendor-terms template and a side-by-side against the incumbent." },
      { name: "Sarah Vega", title: "Controller", role: "user", note: "Day-to-day user. Likes the product but doesn't own the budget." },
    ],
    calls: [
      { id: "call_01", date: "2026-06-03", durationMin: 45, title: "Discovery", attendees: [{ name: "Marcus Hale", airtimeMin: 22 }, { name: "Sarah Vega", airtimeMin: 12 }], summary: "Marcus laid out a messy month-end close: 9 days, lots of spreadsheets, no confidence in the forecast. Clear pain, clear champion.", excerpts: [{ speaker: "Marcus Hale", quote: "We close in nine days and I still don't trust the number we hand Linda." }] },
      { id: "call_02", date: "2026-06-17", durationMin: 60, title: "Demo with CFO", attendees: [{ name: "Marcus Hale", airtimeMin: 20 }, { name: "Linda Park", airtimeMin: 8 }, { name: "Sarah Vega", airtimeMin: 10 }], summary: "Linda (CFO) joined for 35 of 60 minutes, asked two procedural questions, and dropped off. Never came back to the follow-up.", excerpts: [{ speaker: "Linda Park", quote: "Looks fine. Marcus will take it from here." }] },
      { id: "call_04", date: "2026-07-01", durationMin: 40, title: "Technical deep-dive", attendees: [{ name: "Marcus Hale", airtimeMin: 18 }, { name: "Sarah Vega", airtimeMin: 15 }], summary: "Good technical fit confirmed. Still no second conversation with Linda scheduled.", excerpts: [{ speaker: "Marcus Hale", quote: "I think we have what we need on our side." }] },
      { id: "call_05", date: "2026-07-15", durationMin: 40, title: "Commercial + procurement", attendees: [{ name: "Devin Roy", airtimeMin: 22 }, { name: "Marcus Hale", airtimeMin: 4 }], summary: "Procurement drove the call. Marcus said barely a word — his airtime collapsed from ~40% to ~8%. Devin asked for a comparison against the incumbent.", excerpts: [{ speaker: "Devin Roy", quote: "Send us your standard terms and how you stack up against what we already run." }, { speaker: "Marcus Hale", quote: "Linda's expecting a recommendation from me next week." }] },
    ],
    brief: {
      posture: "at_risk",
      topLine: "Northwind shows as Negotiation 75% in the CRM, but it's structurally thin: the CFO has been on one call out of five, your champion went quiet the moment procurement arrived, and he's about to hand the CFO a recommendation with you not in the room.",
      thesis: "This is won or lost on whether you get in front of Linda before Marcus delivers his recommendation. The product fit is solid; the relationship to the actual decision-maker isn't there.",
      decisionFrame: "Champion delivers a solo recommendation to an absent CFO vs. you facilitate a conversation with the CFO present.",
      whyMatters: "Every path that runs through Marcus alone locks in the incumbent's framing. The only move that changes the outcome is getting Linda in a room with you this week.",
      whatChanged: "The last call brought in procurement, surfaced the incumbent as the real competitor, and showed your champion pulling back to write the recommendation on his own.",
      risks: [
        { severity: "blocking", title: "Champion is about to recommend to the CFO without you in the room", description: "Marcus's airtime dropped to ~8% on the last call and he's now preparing a written recommendation for Linda. You have no way to defend or strengthen it.", failureMode: "Marcus hands Linda a flat document, she picks on the procurement comparison, and it closes lost.", posture: "Ask Marcus this week: 'Would it help if I'm in the room when you walk Linda through the comparison?' Frame it as protecting his recommendation, not reopening it." },
        { severity: "high", title: "Economic buyer has been in one call out of five", description: "Linda joined once and left early. Her real view of the deal is unknown, and she's the one signing.", failureMode: "The deal is decided by someone you've barely spoken to, on someone else's terms.", posture: "Get 30 minutes with Linda before the recommendation lands. Lead with her month-end risk, not a product tour." },
      ],
      howYouWin: "You win Northwind by getting the CFO in the room before your champion recommends — and framing the conversation around the month-end close risk she owns, not the feature list.",
      opening: "Marcus — before anything else, I want to be in the room when you take this to Linda. There are two or three places the difference from your current setup isn't obvious on a side-by-side, and I'd hate for her to decide without seeing them. Can we get 30 minutes this week?",
      questions: ["When you sync with Linda, is that already scheduled — and could I join for the comparison?", "What does Linda actually need to see to feel confident signing this?"],
      nextSteps: ["30-minute call with Linda (CFO) before the recommendation", "One-page comparison vs. the incumbent, framed around close-time risk"],
    },
  },

  // ── 2. NEEDS YOU · stalled — champion went dark, no next step on the books ──
  {
    key: "brightline_health",
    account: { name: "Brightline Health", domain: "brightlinehealth.example", industry: "Healthcare" },
    deal: { name: "Brightline Health — planning platform evaluation", stageLabel: "Evaluation", stagePosition: 3, totalStages: 5, arr: 98000, closeDate: "2026-09-30", methodology: "MEDDPICC" },
    stakeholders: [
      { name: "Priya Nair", title: "VP Finance", role: "champion", note: "Enthusiastic early, then went quiet after the pricing call three weeks ago. No reply to the last two emails." },
      { name: "Tom Becker", title: "CFO", role: "economic_buyer", note: "Referenced by Priya but never met. Unknown quantity." },
      { name: "Alicia Gomez", title: "FP&A Manager", role: "user", note: "Would use it daily. Genuinely likes it, but has no budget authority." },
    ],
    calls: [
      { id: "call_01", date: "2026-05-28", durationMin: 45, title: "Discovery", attendees: [{ name: "Priya Nair", airtimeMin: 25 }, { name: "Alicia Gomez", airtimeMin: 12 }], summary: "Strong discovery. Priya described a planning cycle that takes six weeks and a board that keeps asking for scenarios finance can't produce fast enough.", excerpts: [{ speaker: "Priya Nair", quote: "The board wants three scenarios and we can barely produce one on time." }] },
      { id: "call_02", date: "2026-06-11", durationMin: 55, title: "Demo", attendees: [{ name: "Priya Nair", airtimeMin: 20 }, { name: "Alicia Gomez", airtimeMin: 18 }], summary: "Demo landed well. Priya asked for pricing and mentioned needing to 'get Tom comfortable.'", excerpts: [{ speaker: "Priya Nair", quote: "This is the direction we need. Let me figure out the money side with Tom." }] },
      { id: "call_03", date: "2026-06-24", durationMin: 30, title: "Pricing", attendees: [{ name: "Priya Nair", airtimeMin: 14 }], summary: "Walked through pricing. Priya was quieter than usual, said she'd 'take it internal.' No follow-up since. Two emails unanswered.", excerpts: [{ speaker: "Priya Nair", quote: "Let me take this internal and come back to you." }] },
    ],
    brief: {
      posture: "stalled",
      topLine: "Brightline has gone quiet. Priya was your champion, then dropped off the moment pricing became real and the CFO — who you've never met — entered the picture. Three weeks of silence and no next step on the calendar.",
      thesis: "The stall is a stand-in for a conversation Priya can't have without the CFO. Re-engage by making it easy for her to bring Tom in, not by chasing the quote.",
      decisionFrame: "Let the silence harden into a no-decision vs. give Priya a reason to re-open with the CFO attached.",
      whyMatters: "Deals that go quiet after pricing usually died at a budget conversation you weren't in. The move is to re-enter with something Tom (the CFO) cares about, so Priya has cover to bring him.",
      whatChanged: "Priya's tone shifted at the pricing call and she's gone dark since. The CFO's involvement surfaced but never materialized into a conversation.",
      risks: [
        { severity: "blocking", title: "Champion went dark after pricing — deal is drifting to no-decision", description: "Priya hasn't replied in three weeks and there's no scheduled next step. Silence after a pricing call almost always means the budget conversation stalled internally.", failureMode: "The deal quietly ages out. No 'no,' just no motion, and it slips to next year.", posture: "Send Priya a short, low-pressure note with a CFO-facing angle: a one-page 'what this frees up' summary she can forward to Tom. Make re-engaging easy, not awkward." },
        { severity: "high", title: "You've never met the economic buyer", description: "Tom (CFO) controls the money and you have no relationship with him. Everything is second-hand through a champion who's gone quiet.", failureMode: "Tom says no in a hallway and you never even get to make the case.", posture: "Offer Priya a joint 20-minute call with Tom framed around the board-scenario pain she raised — her problem, in his language." },
      ],
      howYouWin: "You win Brightline by giving your champion an easy, CFO-friendly reason to re-open — a forwardable one-pager on what the platform frees up — instead of chasing the quote.",
      opening: "Priya — no pressure at all on timing. I put together a one-page summary of what this would free up for your team ahead of the board cycle, in case it's useful to forward to Tom. Happy to walk you both through it whenever the timing's right.",
      questions: ["Is the hold-up the pricing itself, or getting Tom comfortable with it?", "Would a short joint call with Tom, framed around the board scenarios, help move this?"],
      nextSteps: ["Send the forwardable one-pager for the CFO", "Book a 20-minute joint call with Priya + Tom"],
    },
  },

  // ── 3. ON TRACK · advancing — multi-threaded, exec engaged, plan agreed ──
  {
    key: "vervia_retail",
    account: { name: "Vervia Retail Group", domain: "vervia.example", industry: "Retail" },
    deal: { name: "Vervia Retail Group — planning platform rollout", stageLabel: "Proposal", stagePosition: 4, totalStages: 5, arr: 210000, closeDate: "2026-08-29", methodology: "MEDDPICC" },
    stakeholders: [
      { name: "Grace Okafor", title: "SVP Finance", role: "champion", note: "Strong, senior champion. Actively selling internally and pulled the CFO in herself." },
      { name: "Daniel Wu", title: "Chief Financial Officer", role: "economic_buyer", note: "Engaged and vocal. Sees this as a board-level priority. Asked about rollout timeline, not price." },
      { name: "Rachel Adler", title: "Director of IT", role: "technical", note: "Signed off on security and integration. No blockers." },
    ],
    calls: [
      { id: "call_01", date: "2026-06-05", durationMin: 45, title: "Discovery", attendees: [{ name: "Grace Okafor", airtimeMin: 24 }], summary: "Grace framed a clear board mandate: get planning off spreadsheets before the next fiscal year. Strong urgency, senior sponsorship.", excerpts: [{ speaker: "Grace Okafor", quote: "The board asked for this by name. I need it live before Q1 planning." }] },
      { id: "call_02", date: "2026-06-19", durationMin: 60, title: "Demo with CFO", attendees: [{ name: "Grace Okafor", airtimeMin: 18 }, { name: "Daniel Wu", airtimeMin: 22 }, { name: "Rachel Adler", airtimeMin: 8 }], summary: "CFO stayed the full hour, asked about rollout and change management (not price). IT confirmed the integration path. Everyone bought in.", excerpts: [{ speaker: "Daniel Wu", quote: "I'm less worried about the cost than about getting it live on time. Walk me through rollout." }] },
      { id: "call_03", date: "2026-07-10", durationMin: 45, title: "Mutual plan", attendees: [{ name: "Grace Okafor", airtimeMin: 20 }, { name: "Rachel Adler", airtimeMin: 12 }], summary: "Agreed a written mutual plan with dates through go-live. Security review passed. Proposal requested.", excerpts: [{ speaker: "Grace Okafor", quote: "Send the proposal — I want to bring it to Daniel with the plan attached." }] },
    ],
    brief: {
      posture: "advancing",
      topLine: "Vervia is the clean one: senior champion actively selling, CFO engaged and asking about rollout rather than price, IT cleared, and a written mutual plan with dates. Your job here is not to slow it down.",
      thesis: "This deal is won on execution, not persuasion. Keep the momentum, lock the plan, and don't introduce friction.",
      decisionFrame: "Deliver a clean proposal that matches the agreed plan vs. over-engineer and create a reason to pause.",
      whyMatters: "Well-run deals get lost by sellers who complicate them. The right move is to make signing the obvious next step.",
      whatChanged: "The CFO moved from evaluating to planning the rollout, and the champion asked for the proposal to pair with the mutual plan.",
      risks: [
        { severity: "medium", title: "Timeline risk on go-live before Q1 planning", description: "The board wants this live before Q1 planning. The rollout is achievable but tight — any slip in signing compresses implementation.", failureMode: "Signing drags, go-live misses Q1, and the champion loses credibility she staked on the date.", posture: "Attach a realistic implementation timeline to the proposal so signing-by-date is framed as protecting the go-live." },
      ],
      howYouWin: "You win Vervia by keeping it simple: mirror the agreed mutual plan in the proposal, tie the signing date to the Q1 go-live the CFO cares about, and let a well-run process close itself.",
      opening: "Grace — proposal's attached and it mirrors the plan we agreed, with the implementation timeline built in so the go-live date is protected. Anything you'd want adjusted before you take it to Daniel?",
      questions: ["Is the go-live-before-Q1 date still the one that matters most to Daniel?", "Anything in the mutual plan you'd want firmed up before signing?"],
      nextSteps: ["Send proposal mirroring the mutual plan", "Confirm signing date that protects the Q1 go-live"],
    },
  },

  // ── 4. CLOSED WON — multithreaded to finance early, quantified the savings ──
  {
    key: "cobalt_manufacturing",
    account: { name: "Cobalt Manufacturing", domain: "cobalt-mfg.example", industry: "Manufacturing" },
    deal: { name: "Cobalt Manufacturing — planning platform", stageLabel: "Closed Won", stagePosition: 5, totalStages: 5, arr: 176000, closeDate: "2026-06-20", methodology: "MEDDPICC" },
    stakeholders: [
      { name: "Elena Ruiz", title: "VP Finance", role: "champion", note: "Champion who let you in early and introduced the CFO on call two." },
      { name: "Frank Delgado", title: "Chief Financial Officer", role: "economic_buyer", note: "Bought in once the close-time savings were quantified in his own numbers." },
    ],
    calls: [
      { id: "call_01", date: "2026-04-30", durationMin: 45, title: "Discovery", attendees: [{ name: "Elena Ruiz", airtimeMin: 24 }], summary: "Elena described a 12-day close and a CFO frustrated with slow board reporting. She offered to bring Frank in early.", excerpts: [{ speaker: "Elena Ruiz", quote: "Frank keeps asking why we can't close faster. Let me get him on the next one." }] },
      { id: "call_02", date: "2026-05-14", durationMin: 60, title: "CFO working session", attendees: [{ name: "Elena Ruiz", airtimeMin: 20 }, { name: "Frank Delgado", airtimeMin: 24 }], summary: "Built the savings case live in Frank's numbers: 12-day close to a target of 6, board reporting a week earlier. Frank leaned in.", excerpts: [{ speaker: "Frank Delgado", quote: "If you can get us to a six-day close, that's a number I can take to the board." }] },
      { id: "call_03", date: "2026-06-04", durationMin: 40, title: "Proposal + terms", attendees: [{ name: "Elena Ruiz", airtimeMin: 16 }, { name: "Frank Delgado", airtimeMin: 14 }], summary: "Proposal matched the savings case. Frank approved without a procurement fight — the value was already in his language.", excerpts: [{ speaker: "Frank Delgado", quote: "The case is clear. Let's get the paperwork going." }] },
    ],
    brief: {
      posture: "advancing",
      topLine: "Cobalt closed because you got to the CFO on the second call and built the savings case in his own numbers — a 12-day close down to a target of six. There was no procurement battle because the value was already agreed.",
      thesis: "Won by multithreading to finance early and quantifying the outcome the economic buyer owns.",
      decisionFrame: "Sell through the champion alone vs. get the CFO in early and make the number his.",
      whyMatters: "Reaching the economic buyer early and framing value in his metrics is what removed price as the deciding factor.",
      whatChanged: "The CFO moved from skeptical to sponsor once the close-time savings were quantified in his own reporting.",
      risks: [
        { severity: "high", title: "Could have stayed single-threaded on the champion", description: "The easy path was to keep selling through Elena. Getting Frank in on call two is what actually won it.", failureMode: "Had the CFO stayed absent, this becomes a price comparison and stalls.", posture: "Multithread to the economic buyer by the second call whenever the champion offers the door." },
      ],
      howYouWin: "You win manufacturing-finance deals by getting the CFO in early and building the savings case — faster close, earlier board reporting — in their own numbers, so price stops being the argument.",
      opening: "Frank — here's the close-time case in your numbers: twelve days today, six as the target, board reporting a week earlier. Want to walk through how we get there?",
      questions: ["What close-time number would you be comfortable taking to the board?", "Who else needs to see the savings case before we move?"],
      nextSteps: ["Proposal matching the savings case", "Finance sign-off without a procurement detour"],
    },
    outcome: { outcome: "won", closedAt: "2026-06-20", notes: "Won by getting the CFO into a working session on call two and quantifying the close-time savings (12 days → 6) in his own numbers. Removed price as the deciding factor before procurement could anchor it.", riskMaterialized: false, moveTaken: true },
  },

  // ── 5. CLOSED LOST — single-threaded, never reached the economic buyer ──
  {
    key: "trailhead_software",
    account: { name: "Trailhead Software", domain: "trailhead.example", industry: "Software" },
    deal: { name: "Trailhead Software — planning platform", stageLabel: "Closed Lost", stagePosition: 5, totalStages: 5, arr: 120000, closeDate: "2026-05-30", methodology: "MEDDPICC" },
    stakeholders: [
      { name: "Owen Bright", title: "Finance Manager", role: "champion", note: "Liked the product but was too junior to drive a decision. Never got you to the VP." },
      { name: "Nadia Cross", title: "VP Finance", role: "economic_buyer", note: "The real decision-maker. You never met her. She renewed the incumbent." },
    ],
    calls: [
      { id: "call_01", date: "2026-04-08", durationMin: 45, title: "Discovery", attendees: [{ name: "Owen Bright", airtimeMin: 26 }], summary: "Owen was enthusiastic but described a decision that clearly sat above him with Nadia (VP Finance), whom he was reluctant to involve.", excerpts: [{ speaker: "Owen Bright", quote: "Nadia's slammed — let me get further before I bring her in." }] },
      { id: "call_02", date: "2026-04-29", durationMin: 50, title: "Demo", attendees: [{ name: "Owen Bright", airtimeMin: 28 }], summary: "Good demo, but still just Owen. Every attempt to get time with Nadia was deferred.", excerpts: [{ speaker: "Owen Bright", quote: "I'll walk Nadia through it myself once I've got my head around it." }] },
      { id: "call_03", date: "2026-05-20", durationMin: 25, title: "Check-in", attendees: [{ name: "Owen Bright", airtimeMin: 12 }], summary: "Owen went quiet, then said Nadia had decided to renew the incumbent for another year. You never got a conversation with her.", excerpts: [{ speaker: "Owen Bright", quote: "Nadia decided to stick with what we have for now. Sorry." }] },
    ],
    brief: {
      posture: "at_risk",
      topLine: "Trailhead was lost single-threaded. Owen was a genuine fan but too junior to decide, and every attempt to reach Nadia (VP Finance) was deferred. She renewed the incumbent without ever taking a call.",
      thesis: "Lost because the deal never reached the economic buyer. The champion's enthusiasm masked that he couldn't carry it.",
      decisionFrame: "Keep working the friendly-but-junior champion vs. insist on the economic buyer before investing further.",
      whyMatters: "A champion who won't introduce the decision-maker is a signal, not a delay. Reaching Nadia early was the only path and it never happened.",
      whatChanged: "The VP quietly decided to renew the incumbent, and the deal ended without you ever making the case to her.",
      risks: [
        { severity: "blocking", title: "Never reached the economic buyer — champion too junior to carry it", description: "Owen deferred every attempt to involve Nadia. The whole deal ran through someone who couldn't sign.", failureMode: "The decision-maker renews the incumbent without ever hearing your case.", posture: "Make a conversation with the economic buyer a condition of continuing to invest — kindly, but firmly, early." },
      ],
      howYouWin: "The lesson from Trailhead: when a champion keeps deferring the introduction to the decision-maker, treat it as the risk it is. Insist — warmly — on the economic buyer early, or the incumbent wins by default.",
      opening: "Owen — I want to make sure this is worth your time and mine. Before we go further, could we get 20 minutes with Nadia? Even a short call now saves us both a lot of effort later.",
      questions: ["What would make Nadia willing to take a short call now rather than later?", "Is there a renewal date on the incumbent we should know about?"],
      nextSteps: ["(retro) Should have required EB access before the second demo"],
    },
    outcome: { outcome: "lost", closedAt: "2026-05-30", notes: "Lost single-threaded. The champion (Owen, Finance Manager) was too junior and kept deferring the introduction to the VP Finance. She renewed the incumbent without ever taking a call. Signal missed: a champion who won't introduce the decision-maker is a red flag, not a scheduling problem.", riskMaterialized: true, moveTaken: false },
  },
];
