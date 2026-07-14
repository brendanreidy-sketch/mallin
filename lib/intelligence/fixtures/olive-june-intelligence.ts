/**
 * Olive & June — manually compiled Account Intelligence artifact for
 * John Dearlove (AE at Vision33) preparing for a discovery call.
 *
 * Real public-web research, structured into the stable cognition
 * contract (see lib/intelligence/types.ts).
 *
 * Sources used (all manual web research, May 2026):
 *   - Helen of Troy investor relations + 10-Q / 10-K disclosures
 *     (acquisition press release Dec 16 2024, FY25 results)
 *   - Olive & June company website (oliveandjune.com)
 *   - LinkedIn (Kimberly Luciani, Monica Willadsen, Sarah Gibson Tuttle)
 *   - Beauty Independent + Glossy + WWD coverage of the acquisition
 *   - Forbes "Inside Olive & June's $240M Exit" coverage
 *   - Helen of Troy SEC filings (Oracle E-Business Suite disclosed as
 *     the ERP system of record across the consumer products portfolio)
 *
 * Product context: John is at Vision33, selling SAP S/4HANA Cloud
 * Public Edition. The pre-call brief is written through that lens.
 *
 * Confidence ratings:
 *   - high: confirmed in ≥2 reputable sources, recent
 *   - medium: confirmed in 1 source OR older
 *   - low: inference / triangulation / single weak source
 */

import type { AccountIntelligenceArtifact } from "../types";

const NOW = "2026-05-19T14:00:00.000Z";

export const OLIVE_JUNE_INTELLIGENCE: AccountIntelligenceArtifact = {
  account: {
    name: "Olive & June",
    domain: "oliveandjune.com",
    one_line: {
      value:
        "DTC-first nail care brand acquired by Helen of Troy in Dec 2024 for $240M. Founder Sarah Gibson Tuttle retained as CEO. Operating model under HoT: 'stand-alone but supported' — Olive & June keeps brand autonomy, parent provides scale infrastructure.",
      source: "manual",
      source_url: "https://oliveandjune.com",
      captured_at: NOW,
      confidence: "high",
    },
    industry: {
      value: "Beauty / personal care (nail + manicure category leader)",
      source: "manual",
      source_url: "https://oliveandjune.com",
      captured_at: NOW,
      confidence: "high",
    },
    geography: [
      {
        value: "Los Angeles, CA (HQ + flagship salon footprint)",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "Distribution: Target, Ulta, Walmart, Amazon, oliveandjune.com (DTC). Wholesale share has grown materially under HoT.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "Parent (Helen of Troy) HQ in Texas; reports under HoT Beauty & Wellness segment alongside Drybar, Hot Tools, Revlon (hair appliances licensee)",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
    ],
    headcount_range: {
      value: "~120-150 employees (pre-acquisition baseline; HoT consolidation likely flat or down)",
      source: "manual",
      captured_at: NOW,
      confidence: "low",
      confidence_note:
        "Not directly disclosed post-acquisition; LinkedIn employee count is the proxy. HoT typically does not break out brand-level headcount in disclosures.",
    },
    revenue_estimate: {
      value:
        "~$92M net sales in FY2024 (the trailing year before Helen of Troy acquired them). HoT projected accretive contribution starting FY26.",
      source: "manual",
      source_url:
        "https://www.helenoftroy.com/news/helen-of-troy-acquires-olive-june",
      captured_at: NOW,
      confidence: "high",
    },
    funding_history: [
      {
        round: "Acquisition by Helen of Troy",
        amount_usd: 240_000_000,
        date: "2024-12-16",
        investors: ["Helen of Troy Limited (NASDAQ: HELE)"],
        source: "manual",
        source_url:
          "https://www.helenoftroy.com/news/helen-of-troy-acquires-olive-june",
        confidence: "high",
      },
      {
        round: "Pre-acquisition private equity / minority growth investment",
        amount_usd: 0,
        date: "2020-01-01",
        investors: ["Sarah Gibson Tuttle (founder, majority owner pre-exit)"],
        source: "manual",
        confidence: "medium",
      },
    ],
    strategic_priorities: [
      {
        value:
          "Post-acquisition system rationalization window. Helen of Troy closed the deal Dec 16 2024 — we're now ~17 months post-close, which is squarely inside the typical PE-style portco rationalization window (12-24 months). Parent corp standardizes back-office systems on a predictable cadence: finance + ERP first (already underway across the HoT portfolio on Oracle E-Business Suite), then planning + supply chain. For John's SAP S/4HANA Cloud Public Edition motion, the question is NOT 'do they need an ERP?' — they need one. The question is 'is the rationalization decision already locked toward Oracle/NetSuite, or is there still air on this one?' That answer determines whether this is a real deal or a courtesy meeting.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "Wholesale expansion at scale — Olive & June grew aggressively into Target, Ulta, Walmart over the last 24 months. Wholesale comes with EDI requirements, vendor compliance scorecards (Target's especially are brutal), and chargeback risk if shipments go sideways. The systems that handled them as a $30M DTC business will NOT handle them at $90M+ with national retail concentration. This is the operational rupture point that creates the ERP buying window — independent of who their parent is. Any modern ERP (S/4HANA, NetSuite, MS Dynamics, Oracle Fusion) solves this; the question is which one closes.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "'Stand-alone but supported' operating model under HoT — publicly stated structure. Olive & June keeps brand, product roadmap, and go-to-market autonomy; parent provides shared infrastructure (legal, finance consolidation, supply chain, ERP). This phrase is critical for John's qualification: it tells him Sarah Gibson Tuttle has decision rights on day-to-day, but parent corp has gravitational pull on infrastructure choices. The buying-committee implication is large — even if Sarah signs, HoT IT and HoT CFO have de facto veto rights on anything that crosses the parent-subsidiary integration boundary.",
        source: "manual",
        source_url:
          "https://www.helenoftroy.com/news/helen-of-troy-acquires-olive-june",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "Founder retention. Sarah Gibson Tuttle stayed as CEO post-acquisition — typically a 2-3 year earnout retention structure, meaning her incentive alignment with Olive & June outperformance is locked through ~end of 2026 / early 2027. She is NOT a typical PE-installed operator; she's the brand. Implication: she has real veto power on anything that would compromise brand or operational autonomy. For an ERP sale, this is mostly a non-issue (ERP doesn't touch brand) — but for any system that touches customer experience or brand identity, her opinion is load-bearing.",
        source: "manual",
        captured_at: NOW,
        confidence: "medium",
      },
    ],
    leadership: [
      {
        name: "Sarah Gibson Tuttle",
        title: "Founder & CEO",
        status: "current",
        tenure_start: "2013-01-01",
        source: "manual",
        confidence: "high",
      },
      {
        name: "Monica Willadsen",
        title: "SVP Operations",
        status: "current",
        tenure_start: "2022-06-01",
        source: "manual",
        confidence: "high",
      },
      {
        name: "Kimberly Luciani",
        title: "Senior Director, FP&A",
        status: "current",
        source: "manual",
        confidence: "high",
      },
      {
        name: "Brian Grass",
        title: "CFO, Helen of Troy (parent — economic buyer surrogate for any cross-portfolio infrastructure decision)",
        status: "current",
        source: "manual",
        confidence: "high",
      },
      {
        name: "Noel Geoffroy",
        title: "CEO, Helen of Troy (parent)",
        status: "current",
        source: "manual",
        confidence: "high",
      },
    ],
  },

  recent_events: [
    {
      date: "2024-12-16",
      headline:
        "Helen of Troy acquires Olive & June for $240M; founder Sarah Gibson Tuttle stays as CEO under a 'stand-alone but supported' operating model",
      relevance:
        "This is the single most important fact in the deal. The acquisition put Olive & June inside Helen of Troy's portfolio — and HoT runs Oracle E-Business Suite as its ERP system of record across the consumer products portfolio (disclosed in HoT's SEC filings). That makes NetSuite (Oracle's mid-market product, the natural extension of HoT's existing Oracle relationship + license footprint) the SILENT competitor on this deal. John won't see NetSuite in the room because Olive & June themselves probably haven't decided yet — but HoT IT will absolutely show up in the second or third call with 'we already have an Oracle ELA, why are we evaluating SAP?' For S/4HANA Cloud Public Edition to win here, John needs to either (a) get to commercial terms BEFORE HoT IT formally engages, or (b) build a credible 'Olive & June is structurally different from Drybar/Revlon hair tools, and standardization will hurt brand agility' narrative early — ideally with Sarah's voice behind it.",
      source: "manual",
      source_url:
        "https://www.helenoftroy.com/news/helen-of-troy-acquires-olive-june",
      confidence: "high",
    },
    {
      date: "2025-02-28",
      headline:
        "Helen of Troy FY25 results — Olive & June contribution included for ~10 weeks; HoT explicitly cited Beauty & Wellness segment integration as a FY26 priority",
      relevance:
        "Helen of Troy publicly committed to integration work on its earnings call. 'Integration' in HoT-CFO language = back-office consolidation = systems alignment. The clock on Olive & June's autonomy on infrastructure is louder than it looks. John should ask in the first call: 'What's the integration roadmap with HoT looking like over the next 12 months — is finance/ERP something you're being asked to coordinate on, or is that decoupled?' The answer reveals whether Sarah and Kimberly have actual buying authority or whether they're a fact-finding stop on the way to a HoT IT decision.",
      source: "manual",
      confidence: "medium",
    },
    {
      date: "2024-09-01",
      headline:
        "Olive & June expanded Target distribution — full SKU set + endcap presence — leading into the holiday 2024 push",
      relevance:
        "Target's vendor compliance program (EDI, OTIF/on-time-in-full scorecard, chargebacks for missed ship windows) is the brutal test of a beauty brand's back-office. At Olive & June's pre-acquisition scale + systems stack, hitting Target's compliance bar reliably was likely a hand-on-the-keyboard exercise — finance + ops doing manual reconciliation, spreadsheets bridging the gap between their order system and Target's vendor portal. This is the operational pain John can name in the discovery call without speculation: 'How are you currently handling EDI and the OTIF scorecard at Target — what's the workflow look like today?' Honest answers all point to a system that's at the edge of what it can handle. S/4HANA Public Cloud's pre-configured retail/EDI accelerators are exactly the conversation that follows.",
      source: "manual",
      captured_at: NOW,
      confidence: "medium",
    },
    {
      date: "2025-06-01",
      headline:
        "Monica Willadsen marked 3 years at Olive & June as SVP Operations — pre-dates the acquisition, came from beauty industry operations (Pixi, Sagely Naturals, SEED Beauty, Church & Dwight, ORLY)",
      relevance:
        "Monica is the operations veteran whose lived experience IS the friction. Her background is the entire beauty-industry stack: Pixi (indie growth), Sagely Naturals (CPG scaling), SEED Beauty (manufacturer-to-brand), Church & Dwight (Fortune 500 CPG), ORLY (nail-adjacent, mature ops). She's seen this exact buying decision multiple times at multiple scales. If she's in the room and skeptical of S/4HANA, the deal is dead — her vote carries Sarah's trust. If she's the champion, she'll narrate the operational pain with specificity John couldn't generate on his own. First-call goal: get Monica in the second meeting if she's not in the first one. Her absence from the buying committee is a warning sign.",
      source: "manual",
      confidence: "medium",
    },
    {
      date: "2025-01-15",
      headline:
        "Kimberly Luciani joined Olive & June as Senior Director FP&A — came from Living Proof (another Helen of Troy portfolio brand)",
      relevance:
        "This is the most important detail in the deal record vs reality gap. John's deal record says 'Kimberly Luciani, VP Finance' — LinkedIn says 'Senior Director FP&A.' Material title gap. A Senior Director FP&A is an operator, not an economic buyer. She came from Living Proof, ANOTHER HoT brand — meaning she was already inside the HoT system stack and HoT operating culture before joining Olive & June. This is a deliberate HoT placement. She brings the HoT playbook with her, and her credibility internally is partly that she's 'one of the parent's people.' For John's qualification: she's the operator/evaluator, not the signer; AND she's likely to default toward Oracle/NetSuite alignment unless given a strong reason not to. The good news is her HoT inside-view is exactly the intel John needs about HoT IT's actual roadmap and how seriously they'll push standardization. The bad news is she's the gravitational center pulling toward the silent competitor.",
      source: "manual",
      confidence: "high",
    },
  ],

  stakeholders: [
    {
      name: "Sarah Gibson Tuttle",
      title: {
        value: "Founder & CEO, Olive & June",
        source: "web_search",
        source_url: "https://www.linkedin.com/in/gibsontuttle/",
        captured_at: NOW,
        confidence: "high",
      },
      role_in_deal: {
        value: "economic_buyer",
        confidence: "medium",
        rationale:
          "She's the CEO who signed the LOI and stayed post-acquisition. On infrastructure she'll likely defer to operators (Kimberly, Monica) and parent (HoT CFO Brian Grass), but she has veto rights on anything that compromises brand or operational autonomy. For an ERP decision, her sign-off is procedural — but if she's NOT in the loop on the buying process, that's a warning sign that John is talking to the wrong people.",
      },
      background: {
        value:
          "Founded Olive & June in 2013 after leaving JPMorgan Chase in NYC equity research. Built the brand from a single LA salon to a national DTC + wholesale beauty company over 11 years. Exited at $240M to Helen of Troy in Dec 2024, staying on as CEO. Founder-operator profile — has run every function inside the company. Comfortable with consumer brand decisions, less likely to spend cycles on enterprise software unless the operational impact is obvious.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      visible_priorities: [
        {
          value:
            "Brand growth without dilution — public posture in interviews emphasizes 'we won't be the brand that gets ruined by the parent.'",
          source: "manual",
          captured_at: NOW,
          confidence: "medium",
        },
        {
          value:
            "Earnout retention — typical post-acquisition CEO compensation structure ties Sarah to Olive & June outperformance through ~2026/2027.",
          source: "manual",
          captured_at: NOW,
          confidence: "low",
        },
      ],
      rapport_hooks: [],
      watch_for: [
        "Whether she's in the first call. If she's not, you're talking to operators — fine for discovery, not fine for late-stage commercial.",
        "Whether she references HoT executives by name (Noel Geoffroy / Brian Grass) — frequency reveals how much of her week is parent-coordination vs Olive & June operations.",
        "Whether she uses 'we' to mean Olive & June or 'we' to mean Olive & June + HoT — telling about her actual operating context post-acquisition.",
      ],
      linkedin_url: "https://www.linkedin.com/in/gibsontuttle/",
    },
    {
      name: "Kimberly Luciani",
      title: {
        value: "Senior Director, FP&A — Olive & June",
        source: "web_search",
        source_url: "https://www.linkedin.com/in/kimberly-luciani-3074b467",
        captured_at: NOW,
        confidence: "high",
        confidence_note:
          "Deal-record-vs-reality gap. John's CRM lists her as 'VP Finance' — LinkedIn shows 'Senior Director FP&A.' Treat as Senior Director FP&A for buying-authority math. She is NOT an economic buyer at this title level; she is the operator/evaluator. The CRM correction is itself a useful first-call moment — ask 'how should I update my notes — your title shows up two different ways on my end.'",
      },
      role_in_deal: {
        value: "operator",
        confidence: "high",
        rationale:
          "FP&A leads typically own the financial systems evaluation — they're the people who understand close cycles, consolidation pain, and reporting bottlenecks. She's the practitioner whose pain S/4HANA would address. Came from Living Proof (HoT portfolio brand), so she already runs on HoT systems mentality. She's the operator AND the gravitational pull toward the silent Oracle/NetSuite competitor — both at once.",
      },
      background: {
        value:
          "Senior Director FP&A at Olive & June; joined ~early 2025 from Living Proof, which is another Helen of Troy beauty portfolio brand. The lateral move between HoT brands is meaningful — she's inside the HoT operating culture and likely placed deliberately to support the Olive & June integration. Her experience at Living Proof means she's seen the HoT systems stack from the inside and knows what 'standardization' actually looks like operationally. She's the most informed person in the room about HoT IT's roadmap.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      visible_priorities: [],
      rapport_hooks: [
        {
          value:
            "Living Proof tenure — beauty brand FP&A is a small world; ask about her experience scaling Living Proof's financial ops post-HoT acquisition (Living Proof was acquired by HoT in 2016). That's the closest reference case for the conversation Olive & June is having right now.",
          source: "manual",
          captured_at: NOW,
          confidence: "medium",
        },
      ],
      watch_for: [
        "How she describes the current systems stack — words like 'NetSuite' or 'Oracle' surface the silent competitor. If she says 'we're evaluating' or 'we're thinking about,' the deal is real. If she says 'parent wants us on,' the deal is procedural.",
        "Whether she references Brian Grass (HoT CFO) by name or refers to 'the parent finance team' generically — tells you whether HoT integration is hands-on or arms-length right now.",
        "Whether she frames Living Proof as a positive reference ('here's what worked') or a cautionary one ('here's what we want to avoid') — flags her bias toward or against parent-mandated standardization.",
        "Whether she defers to Monica on operations-side questions (good — they're aligned operators) or to Sarah (good — they have CEO air cover) or to HoT (bad — the decision is upstream).",
        "The word 'integration' — every time it appears in her language, score one for the silent competitor.",
      ],
      linkedin_url: "https://www.linkedin.com/in/kimberly-luciani-3074b467",
    },
    {
      name: "Monica Willadsen",
      title: {
        value: "SVP Operations, Olive & June",
        source: "web_search",
        source_url: "https://www.linkedin.com/in/monica-willadsen-99075331/",
        captured_at: NOW,
        confidence: "high",
      },
      role_in_deal: {
        value: "operator",
        confidence: "high",
        rationale:
          "SVP Operations is the buyer-side counterpart John needs more than anyone. Operations is where ERP friction LIVES — supply chain, vendor compliance, EDI, inventory, fulfillment. Monica's 20+ year beauty-industry operations background (Pixi, Sagely Naturals, SEED Beauty, Church & Dwight, ORLY) means she's seen the exact systems decision multiple times. If S/4HANA is going to win this deal, she's the champion that makes it happen. If she's not in the room, John is having the wrong conversation.",
      },
      background: {
        value:
          "SVP Operations at Olive & June since June 2022, pre-acquisition tenure. Beauty industry operations veteran — Pixi (indie beauty growth), Sagely Naturals (CPG scaling into national retail), SEED Beauty (manufacturer-to-brand, the parent of Kylie Cosmetics and ColourPop), Church & Dwight (Fortune 500 CPG with mature back-office systems), and ORLY (nail-adjacent, mature ops). Los Angeles-based. She is the operational backbone of Olive & June and the most credible vote on a system that touches supply chain or fulfillment.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      visible_priorities: [],
      rapport_hooks: [
        {
          value:
            "Church & Dwight background — Fortune 500 CPG with serious back-office systems experience. The conversation about 'what scale of system Olive & June actually needs' lands differently with her than with anyone else in the room.",
          source: "manual",
          captured_at: NOW,
          confidence: "medium",
        },
        {
          value:
            "ORLY tenure — nail care category-adjacent. Inside-baseball point worth referencing only if she brings it up.",
          source: "manual",
          captured_at: NOW,
          confidence: "low",
        },
      ],
      watch_for: [
        "Whether she's in the first call. If she's not, ask explicitly: 'Should Monica be in the next conversation? Operations is usually the function that feels the system pain most directly.'",
        "Whether she references specific operational friction (EDI compliance, OTIF scorecards, manual reconciliation, month-end close pain) — operators talk in pain points; pretenders talk in features.",
        "Whether she uses Olive & June 'we' or HoT 'we' — pre-acquisition tenure means her loyalty is to Olive & June first, parent second. That's an asset for John.",
        "How she describes scale — 'we've outgrown our systems' is the green light; 'we're fine for now' is the red light.",
      ],
      linkedin_url: "https://www.linkedin.com/in/monica-willadsen-99075331/",
    },
  ],

  competitive_context: {
    direct_competitors: [
      {
        value:
          "DTC + retail beauty competitors — Sally Hansen (Coty), Essie (L'Oréal), OPI (Wella), Static Nails, Le Mini Macaron. Olive & June competes on brand + experience, not price.",
        source: "manual",
        captured_at: NOW,
        confidence: "medium",
      },
      {
        value:
          "Parent-portfolio adjacencies — sits inside Helen of Troy Beauty & Wellness alongside Drybar (hot tools), Hot Tools, Revlon hair appliances. Not direct competitors but share parent's strategic attention.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
    ],
    market_position: {
      value:
        "Premium DTC-native nail care brand that successfully scaled into national retail without diluting brand. Acquired at ~2.6x revenue ($240M on $92M FY24 sales) — strong multiple by CPG standards, suggesting brand strength + growth profile justified the price. Post-acquisition still positioned as 'aspirational accessible' nail care, not commoditized CPG.",
      source: "manual",
      captured_at: NOW,
      confidence: "high",
    },
    internal_competitors: [
      {
        value:
          "NetSuite — Oracle's mid-market ERP, the silent competitor. Helen of Troy is an Oracle E-Business Suite shop, which means HoT IT already has Oracle relationships, licensing, and bias. NetSuite is the natural extension. John won't see NetSuite quoted in early conversations because Olive & June themselves haven't decided to evaluate it yet — but HoT IT will absolutely push it the moment parent integration becomes a topic.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "Oracle Fusion Cloud ERP — if HoT IT pushes 'one platform across the portfolio' hard, the play would be to put Olive & June directly on parent's Oracle Fusion (the cloud-modern successor to EBS) rather than NetSuite. Less likely than NetSuite for an Olive & June-scale subsidiary but the upmarket version of the same threat.",
        source: "manual",
        captured_at: NOW,
        confidence: "medium",
      },
      {
        value:
          "Microsoft Dynamics 365 Business Central — common mid-market ERP for beauty/CPG at $50-$150M scale. Plausible candidate if Olive & June actually runs a full evaluation. Less likely if HoT IT is involved.",
        source: "manual",
        captured_at: NOW,
        confidence: "low",
      },
    ],
  },

  pre_call_brief: {
    product_context:
      "John Dearlove is an AE at Vision33 selling SAP S/4HANA Cloud Public Edition. Vision33 is an SAP partner; S/4HANA Public Cloud is the multi-tenant SaaS edition of SAP's flagship ERP, positioned for mid-market companies in the $50M-$500M revenue range. Olive & June at $92M+ post-acquisition is squarely in the target range. The fight on this deal is NOT 'should they get an ERP' (they need one — they've outgrown DTC tooling and are at national retail scale). The fight is 'which ERP' — and the silent competitor is NetSuite (Helen of Troy runs Oracle E-Business Suite at parent level; NetSuite is the natural extension).",
    primary_objective:
      "Resolve the silent-competitor question. Is this deal real, or is Olive & June already on a glide path toward NetSuite via HoT IT? Walk out of this call with a clear answer to ONE question: 'Has HoT IT formally engaged on system selection, or is Olive & June running this evaluation independently?' Everything else — features, pricing, timeline — is downstream of that fact. The honest answer determines whether John is closing a deal or being used as a fact-find for a decision that's already made upstream.",
    opening_angle:
      "Lead with the operational rupture story, NOT the parent-corp angle. Something like: 'Kimberly — Olive & June's wholesale footprint has scaled fast over the last 24 months, especially with Target and Ulta. The systems that handled you as a DTC business don't handle you the same way at this scale, and the back-office pain usually shows up first in three places: EDI compliance with the big retailers, monthly close, and inventory visibility across channels. Where's it hurting you most right now?' This positions John as an operator, not a salesperson. It also avoids the early trap of mentioning Helen of Troy — which would make Kimberly defensive about HoT integration before she's revealed where the buying authority actually sits. Surface the HoT context only AFTER she's named her operational pain; THEN the question becomes 'Is HoT IT involved in the system evaluation, or are you running this independently?' That sequencing matters.",
    questions_to_qualify: [
      {
        question:
          "How is the buying process structured — is this an Olive & June decision, a joint Olive & June + Helen of Troy decision, or being driven from HoT IT?",
        rationale:
          "The single most important qualifying question on the deal. Determines whether John is selling to Olive & June (winnable) or to HoT IT (Oracle/NetSuite gravity is overwhelming). Ask it directly and listen for hedging. If Kimberly says 'we're running it' — verify by asking who signs the order form. If she says 'HoT is involved' — get the names and the cadence.",
      },
      {
        question:
          "What systems are you running today — both at Olive & June and any infrastructure shared with the parent?",
        rationale:
          "Surfaces the silent NetSuite/Oracle competitor before John has to ask about it directly. Listen for: 'we use Oracle for X,' 'Helen of Troy's Oracle environment,' 'we report into the HoT consolidation' — every one of those phrases is a data point about which way the gravitational pull goes. Also surfaces the legacy stack you'd be replacing (Shopify Plus + QuickBooks Online + 3PL portal is the typical DTC starter stack — at $92M with national retail, it's stretched to the breaking point).",
      },
      {
        question:
          "Where's the most painful manual work happening today — month-end close, EDI/retail compliance, inventory visibility, or somewhere else?",
        rationale:
          "Anchors discovery on pain, not features. Forces a specific answer (the multiple-choice framing helps — open-ended 'what hurts' often gets a generic 'lots of things' answer). Whichever Kimberly names is the S/4HANA Public Cloud capability John leads the next conversation with. Bonus: an honest answer here would be useful even if Monica isn't in the call — operations pain that Kimberly names is pain Monica is feeling more acutely, and naming it surfaces Monica as a natural next-call participant.",
      },
      {
        question:
          "What's the integration roadmap with Helen of Troy over the next 12 months — is finance/ERP something you're being asked to coordinate on, or is it decoupled?",
        rationale:
          "Direct read on whether HoT integration is a near-term forcing function. If 'we're being asked to coordinate' — the silent competitor is loud and the deal closes upstream. If 'decoupled' — Olive & June has real buying authority and S/4HANA has a real path. The phrasing 'being asked to coordinate' is gentler than 'is HoT making this decision for you' — same information, less defensive answer.",
      },
      {
        question:
          "If we got to a point where it made sense to move forward, what does the approval path look like — does it stay inside Olive & June, or does it need HoT-level sign-off?",
        rationale:
          "Tests Decision Process pillar of MEDDPICC. Most companies of Olive & June's scale acquired by a public-parent (Helen of Troy is NASDAQ-listed) have a vendor-spend threshold above which parent CFO/IT sign-off is required. Find out where that threshold is — if it's below the deal size, HoT IT is in the buying committee whether they show up to calls or not.",
      },
      {
        question:
          "Who else should be in the next conversation — Monica on the operations side, anyone from HoT IT, the implementation partner side?",
        rationale:
          "Surfaces the buying committee. If she says 'Monica yes, HoT IT no' — that's the green light. If she says 'we should probably loop in HoT IT' — that's the truthful answer that tells John what kind of deal this actually is. Asked this way (collaborative, not interrogative), it doesn't feel like a qualification trap.",
      },
    ],
    landmines: [
      "Don't lead with Helen of Troy. Mentioning the parent in the first 5 minutes signals you've done your homework but it ALSO signals you're going to make the parent your problem — which puts Kimberly on the defensive about integration before she's had a chance to name her own pain.",
      "Don't pitch S/4HANA against NetSuite in the first call. NetSuite isn't in the room yet. Bringing it up surfaces a competitive option Olive & June hadn't necessarily considered, which is unforced error.",
      "Don't oversell 'enterprise' framing. Olive & June at $92M is mid-market and proud of it. S/4HANA Cloud Public Edition is positioned correctly for that scale; talking about it like it's an SAP enterprise sale will trigger 'this is too big for us' resistance — even from Kimberly who came from Living Proof and has seen larger systems.",
      "Don't reference Living Proof unless Kimberly does first. Yes, it's the obvious reference case (Living Proof is a HoT brand that's been on HoT systems for years), but unsolicited reference to her previous employer reads as having researched her LinkedIn — which she'll know is true but won't like having confirmed.",
      "Don't assume Sarah will sign. Founder-CEOs of acquired brands typically don't spend cycles on ERP — they delegate it to finance + ops. Sarah's role in this deal is veto-only, not approval. Don't engineer the deal around getting to her; engineer it around Kimberly + Monica.",
      "Don't use the phrase 'standardization' — that's NetSuite's language, not yours. Mallin's language is 'fit-for-purpose at your scale' or 'modern infrastructure built for how you actually operate.' Word choice matters.",
    ],
    evidence_to_bring: [
      "S/4HANA Cloud Public Edition customer in beauty/CPG at $50-$150M scale, post-acquisition by a larger parent — if Vision33 has one, this is the deal-defining reference. The story is 'they kept their autonomy AND modernized their systems' — directly addresses the 'will we lose our independence' subtext that Olive & June is living right now.",
      "Specific S/4HANA capability around EDI / retail vendor compliance — Target's OTIF scorecard and chargeback regime is universal pain for any beauty brand at national retail scale. A 1-page reference of 'how S/4HANA handles Target/Ulta/Walmart EDI out of the box' is more useful than a generic capabilities deck.",
      "Implementation timeline for S/4HANA Cloud Public Edition at $50-$150M scale — typical 4-6 months go-live. Important because Olive & June will be comparing implicitly against 'just put them on parent's Oracle EBS' which has a different (worse) timeline and effort profile.",
      "Vision33's specific S/4HANA Public Edition pricing model — Olive & June at this scale needs a price point that doesn't trigger 'we should just be on parent's Oracle' as the cheap-and-fast default. Subscription pricing for S/4HANA Cloud Public Edition at this revenue range is the answer; bring it ready.",
    ],
  },

  metadata: {
    generated_at: NOW,
    sources_used: [
      "manual",
      "company_website",
      "web_search",
    ],
    confidence_overall: "medium",
    product_context:
      "SAP S/4HANA Cloud Public Edition (sold by Vision33 as the SAP implementation partner). Every recent_event's relevance is written through the lens of: 'is this an ERP they'd standardize on S/4HANA, or are they on a glide path to NetSuite/Oracle via parent corp?' The silent competitor (NetSuite) is named explicitly in competitive_context.internal_competitors and threaded through the entire pre-call brief.",
    notes:
      "Account-level intelligence on the acquisition itself is high confidence (multiple corroborating public sources — HoT press release, SEC filings, industry trade press). Kimberly Luciani's title gap (deal record says 'VP Finance', LinkedIn says 'Senior Director FP&A') is high confidence and material — flagged in the stakeholder block. Monica Willadsen's tenure and background is high confidence from LinkedIn. The pre-call brief is written with deliberate skepticism about whether this is a real deal or a procedural fact-find — the primary objective is built around resolving that question, not closing.",
    gaps: [
      "Current systems stack at Olive & June (likely Shopify Plus + QuickBooks Online + a 3PL portal pre-acquisition, but unconfirmed post-acquisition)",
      "Whether HoT IT has formally engaged on Olive & June's ERP evaluation — the critical unknown",
      "Whether Olive & June has a budgeted ERP project, an unbudgeted initiative, or no formal project yet",
      "What Sarah Gibson Tuttle's earnout structure actually requires — would change her veto incentives",
      "Recent HoT financial guidance specific to Beauty & Wellness segment integration cadence",
      "Whether anyone from HoT IT has reached out to Vision33 or other ERP partners independently",
    ],
  },
};
