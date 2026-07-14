/**
 * Ten Five Hospitality — manually compiled Account Intelligence
 * artifact for Jessica Janes (AVP Leasing, National Restaurant Group
 * at Macerich) preparing for an evaluation call with Dan Daley about
 * Ten Five leasing the recently-closed Francine space at Scottsdale
 * Fashion Square.
 *
 * Real public-web research, structured into the stable cognition
 * contract (see lib/intelligence/types.ts).
 *
 * Sources used (all manual web research, May 21 2026):
 *   - Ten Five Hospitality launch coverage (Hotel Business, Hospitality
 *     Net, Hospitality Design, Flaunt)
 *   - Mother Wolf Miami opening (Whitewall)
 *   - Mother Wolf trademark / Relevant Group litigation coverage
 *     (Real Deal LA, Robb Report, Las Vegas Review-Journal)
 *   - Francine closure (Phoenix New Times, Hoodline, Patch)
 *   - Francine origin (VivaPhoenix, Iconic Life, Mouth by Southwest)
 *   - Scottsdale Fashion Square Macerich leasing page + Phoenix New
 *     Times restaurant guide + Iconic Life dining guide
 *   - Macerich SFS redevelopment press releases (Investing Macerich,
 *     Fabulous Arizona)
 *   - LinkedIn (Dan Daley, Laurent Halasz, Jessica Janes)
 *
 * Product context: Jessica is selling restaurant LEASES at a Macerich
 * luxury wing property. The pre-call brief is written through the
 * lens of tenant-fit evaluation — operator stability, brand alignment
 * with the luxury wing, restaurant-mix saturation. NOT through the
 * lens of "do they want the space" (Ten Five wants it). The fight is
 * "should Macerich give it to them."
 *
 * Confidence ratings:
 *   - high: confirmed in ≥2 reputable sources, recent
 *   - medium: confirmed in 1 source OR older
 *   - low: inference / triangulation / single weak source
 */

import type { AccountIntelligenceArtifact } from "../types";

const NOW = "2026-05-21T15:00:00.000Z";

export const MACERICH_TEN_FIVE_INTELLIGENCE: AccountIntelligenceArtifact = {
  account: {
    name: "Ten Five Hospitality",
    domain: "tenfivehospitality.com",
    one_line: {
      value:
        "Integrated hospitality investment + management firm — F&B concept development, hotel operations, marketing/programming. Founded 2021 by Dan Daley (ex-COO of Relevant Group) and Kim Walker. Portfolio is concept-led, celebrity-chef-anchored, hotel-rooftop-heavy. Active in LA, Las Vegas, Miami, NYC, DC. No Arizona footprint yet. Currently in active litigation with Daley's former employer over the flagship Mother Wolf concept.",
      source: "manual",
      source_url: "https://www.tenfivehospitality.com",
      captured_at: NOW,
      confidence: "high",
    },
    industry: {
      value:
        "Hospitality investment + management · multi-concept restaurant operator · hotel F&B operations",
      source: "manual",
      captured_at: NOW,
      confidence: "high",
    },
    geography: [
      {
        value: "Hollywood, CA — HQ + concentrated concept portfolio (Bar Lis, Desert 5 Spot, The Chap, Ka'teen rooftop)",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value: "Las Vegas, NV — Mother Wolf at Fontainebleau (the litigation flashpoint)",
        source: "manual",
        source_url: "https://therealdeal.com/la/2023/08/03/relevant-group-sues-ten-five-hospitality-over-mother-wolf-trademark/",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value: "Miami, FL — Mother Wolf Miami (opened Oct 5, 2024)",
        source: "manual",
        source_url: "https://whitewall.art/lifestyle/ten-five-hospitality-brings-mother-wolf-to-miami/",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value: "New York, NY — concept lease inked, name not yet public",
        source: "manual",
        source_url: "https://whatnow.com/new-york/restaurants/ten-five-hospitality-inks-lease-for-new-concept/",
        captured_at: NOW,
        confidence: "medium",
      },
      {
        value: "Washington, DC — concept presence",
        source: "manual",
        captured_at: NOW,
        confidence: "medium",
      },
      {
        value: "Arizona — NO existing footprint. Scottsdale Fashion Square would be Ten Five's first AZ property.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
    ],
    headcount_range: {
      value: "Private — no public headcount. Portfolio implies ~150-300 FOH + BOH across operated venues; corporate HQ likely <50.",
      source: "manual",
      captured_at: NOW,
      confidence: "low",
      confidence_note:
        "Restaurant operators in this profile typically report concept-level headcount only at unit launches. No corporate disclosure.",
    },
    revenue_estimate: {
      value:
        "Not publicly disclosed. Privately held. Mother Wolf LA + Bar Lis + Ka'teen are reportedly high-volume single-unit operators; Vegas Mother Wolf is in a Fontainebleau anchor position. Order-of-magnitude estimate $50-$100M aggregate top-line is plausible but unverified.",
      source: "manual",
      captured_at: NOW,
      confidence: "low",
    },
    funding_history: [
      {
        round: "Founding / undisclosed",
        amount_usd: 0,
        date: "2021-01-01",
        investors: ["Dan Daley (Co-Founder)", "Kim Walker (Co-Founder)"],
        source: "manual",
        source_url: "https://hotelbusiness.com/ten-five-hospitality-launched/",
        confidence: "medium",
      },
    ],
    strategic_priorities: [
      {
        value:
          "Geographic expansion into Sun Belt luxury markets. Miami opened Oct 2024; NYC lease inked; Scottsdale Fashion Square would extend the Sun Belt thesis (Miami → Scottsdale = luxury winter destinations, similar customer profile). The strategic intent is real and consistent with their portfolio behavior. The question for Macerich is whether their operating bandwidth keeps pace with the geographic spread — five active markets in four years for a hospitality group that's still privately financed is aggressive.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "Concept-led, chef-anchored, hotel-rooftop-adjacent positioning. Bar Lis (French Riviera rooftop), Ka'teen (Yucatán-inspired, Chef Wes Avila), Mother Wolf (Roman, Chef Evan Funke), Desert 5 Spot (Hollywood). These are destination concepts, not category restaurants — Ten Five does not operate mid-market or family-dining brands. For Macerich, this is brand-fit positive: every Ten Five concept is plausibly luxury-wing appropriate. But it also means whichever concept they propose for Francine's space will be a high-amplitude bet — there's no 'safe' Ten Five concept to deploy.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "Active commercial litigation with Daley's former employer (Relevant Group). Filed July 18, 2023 in Nevada District Court. Allegations: Daley, while serving as COO of Relevant, 'stole corporate opportunities' through 'sham' agreements to launch Ten Five; trademark for Mother Wolf is in dispute. The case is operationally complex (employees pulled between entities; spot bonuses paid to retain workers; quit incidents documented). Status as of last public reporting: ongoing. This is the single most important fact in the Macerich-side underwriting — a tenant whose flagship brand is subject to trademark litigation is a different risk profile than a clean operator.",
        source: "manual",
        source_url: "https://therealdeal.com/la/2023/08/03/relevant-group-sues-ten-five-hospitality-over-mother-wolf-trademark/",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "Hotel-F&B operating model. Ten Five does F&B oversight at Thompson Hollywood, tommie Hollywood, Dream Hollywood — all Relevant Group properties pre-split. Public reporting does not clarify whether those operating relationships survived the litigation; if they did, Ten Five's revenue base is partly tied to a counterparty currently suing them, which is a structural fragility. If they didn't, Ten Five lost a non-trivial portion of its operating footprint and the Scottsdale lease is being underwritten by a smaller company than the press releases suggest.",
        source: "manual",
        captured_at: NOW,
        confidence: "medium",
      },
    ],
    leadership: [
      {
        name: "Dan Daley",
        title: "CEO, Co-Founder & Principal",
        status: "current",
        tenure_start: "2021-01-01",
        source: "manual",
        confidence: "high",
      },
      {
        name: "Kim Walker",
        title: "CMO, Co-Founder",
        status: "current",
        tenure_start: "2021-01-01",
        source: "manual",
        confidence: "high",
      },
      {
        name: "Sebastian Puga",
        title: "EVP, Brand Experience · Partner",
        status: "current",
        source: "manual",
        confidence: "medium",
      },
      {
        name: "Giancarlo Pagani",
        title: "Managing Partner, Food & Beverage",
        status: "current",
        source: "manual",
        confidence: "medium",
      },
    ],
  },

  recent_events: [
    {
      date: "2026-05-13",
      headline:
        "Francine restaurant abruptly closes at Scottsdale Fashion Square after 6 years — paper signs on the door, no farewell post, phones unanswered, no official statement from ownership or mall",
      relevance:
        "This is the catalyst for the call. The space is dark RIGHT NOW — a ~5,000 sq ft luxury-wing slot adjacent to Nobu, Ocean 44, and Toca Madera, vacant with zero PR cover. Macerich's incentive to fill it quickly is high (luxury wing vacancy degrades the entire merchandising story; the Palm Court redesign already has the property in transition optics). Ten Five's incentive is also high (premier vacant luxury location, no competitive bidding visible yet). Both sides want this deal — which is exactly when Jessica's underwriting discipline matters most. The fast-deal pull is real; the operator-fit question still needs to land.",
      source: "manual",
      source_url: "https://www.phoenixnewtimes.com/food-drink/popular-scottsdale-restaurant-francine-closes-at-fashion-square-40666566/",
      confidence: "high",
      captured_at: NOW,
    },
    {
      date: "2023-07-18",
      headline:
        "Relevant Group sues Dan Daley and Ten Five Hospitality in Nevada District Court — alleges Daley 'stole corporate opportunities' while serving as COO of Relevant; trademark for flagship Mother Wolf concept is in dispute",
      relevance:
        "Load-bearing for tenant underwriting. The most important fact in the file. A lawsuit alleging the CEO of Ten Five built the company on misappropriated opportunities while at his prior employer is the kind of thing Macerich legal will surface in their own diligence whether Jessica raises it or not. Better to surface it now and ask Dan how he frames it than to let it become an awkward late-stage discovery. Specific operational details from the suit — employees pulled between entities, $200 spot bonuses to retain staff, quit incidents — point to instability in personnel + brand IP during the 2021-2023 period. Jessica should ask: (a) what's the status of the litigation today, (b) does it affect the Mother Wolf brand or only the Vegas location, and (c) which Ten Five concept is being proposed for Scottsdale — because if the answer is 'Mother Wolf,' the trademark question goes from background to operative.",
      source: "manual",
      source_url: "https://therealdeal.com/la/2023/08/03/relevant-group-sues-ten-five-hospitality-over-mother-wolf-trademark/",
      confidence: "high",
    },
    {
      date: "2024-10-05",
      headline:
        "Mother Wolf Miami opens at the Surf Club / South Beach — Ten Five's first East Coast venue and first major opening since the litigation was filed",
      relevance:
        "Operationally meaningful. Successfully opening Mother Wolf Miami while the Vegas trademark case is active suggests either (a) the litigation has been carved off the Mother Wolf brand expansion or (b) Ten Five is opening under exposure they consider manageable. Either reading tells Jessica something. The Miami opening is also the closest proxy for what a Ten Five Scottsdale unit would look like — destination concept, luxury anchor, year-round resort-market customer profile. If Jessica can get the Miami GM's name in the call, that's the operator-fit reference she's looking for.",
      source: "manual",
      source_url: "https://whitewall.art/lifestyle/ten-five-hospitality-brings-mother-wolf-to-miami/",
      confidence: "high",
    },
    {
      date: "2026-01-15",
      headline:
        "Macerich SFS Palm Court redesign underway — Jan to Nov 2026, raised ceilings, refreshed entry. Property continues its luxury repositioning + F&B expansion strategy.",
      relevance:
        "Macerich-side context Jessica already lives inside, but worth surfacing in the brief because it shapes the negotiating frame. The property is publicly committed to luxury repositioning; a marquee F&B announcement at the Francine space helps that narrative. Ten Five knows this too — every press release Macerich puts out about SFS positioning is leverage in Ten Five's favor at the lease-economics table. Jessica's job is to keep the conversation about TENANT FIT, not about how badly Macerich needs the space filled.",
      source: "manual",
      source_url: "https://investing.macerich.com/news-releases/news-release-details/macerichs-current-redevelopment-scottsdale-fashion-square",
      confidence: "high",
    },
    {
      date: "2025-09-01",
      headline:
        "Ten Five Hospitality inks NYC lease for new concept (name not yet public)",
      relevance:
        "Geographic expansion signal. NYC + Scottsdale + Miami in 18 months is a real expansion cadence. The question for Jessica is whether Ten Five's corporate operating team scales with the geographic spread — opening Mother Wolf Miami in Oct 2024, signing NYC in Sep 2025, pursuing Scottsdale in May 2026 means three major openings in less than two years for a hospitality group that doesn't disclose its capital structure. The risk isn't ambition; it's bench depth. Ask Dan how the corporate side staffs against geographic spread — and whether they have a Scottsdale-resident operator lined up or whether the GM is being recruited cold.",
      source: "manual",
      source_url: "https://whatnow.com/new-york/restaurants/ten-five-hospitality-inks-lease-for-new-concept/",
      confidence: "medium",
    },
    {
      date: "2026-04-01",
      headline:
        "Teleferic Barcelona, Din Tai Fung, and Edo Japanese Grill confirmed as new restaurant tenants coming to Scottsdale Fashion Square in 2025-2026",
      relevance:
        "Adjacent supply context. SFS is already adding three significant restaurant tenants — Macerich's restaurant mix is densifying fast. The 'we have a lot of restaurants on the property' instinct Jessica named is correct: Nobu, Ocean 44, Toca Madera, Elephante, Zinque, Catch, Society Suite, Moxies + Teleferic + Din Tai Fung + Edo + (potential) Ten Five. The Francine vacancy isn't a missing restaurant; it's a missing CONCEPT that earns its luxury-wing positioning. The qualifying question to Dan is which specific concept (Mother Wolf, Ka'teen, Bar Lis, or something new) Ten Five is proposing — and how its category differentiates from the existing eight luxury-wing restaurants.",
      source: "manual",
      source_url: "https://scottsdale.com/blog/post/the-latest-enhancements-coming-to-scottsdale-fashion-square/",
      confidence: "medium",
    },
  ],

  stakeholders: [
    {
      name: "Dan Daley",
      title: {
        value: "CEO, Co-Founder & Principal — Ten Five Hospitality",
        source: "web_search",
        source_url: "https://www.linkedin.com/in/dan-daley-81596338/",
        captured_at: NOW,
        confidence: "high",
      },
      role_in_deal: {
        value: "economic_buyer",
        confidence: "high",
        rationale:
          "Co-founder + CEO of a privately held hospitality group. He has signing authority on lease decisions. He's also the named defendant in the Relevant Group litigation, meaning every conversation about Ten Five's stability and brand IP routes through him personally — which is unusual for a tenant evaluation and makes him both the decision-maker AND the person whose answers matter most.",
      },
      background: {
        value:
          "Hospitality operator career path: F&B start at Gerber Group and Tao Group → hotel operations at Dream Hotel Group and PUBLIC Hotels → development → COO of Relevant Group → co-founded Ten Five Hospitality in 2021. Georgetown University, BA International Affairs. The Relevant Group COO tenure is the structurally important part of his bio: it's where the current litigation originates. Relevant alleges that during his time as COO, Daley used 'sham agreements' to launch Ten Five and the Mother Wolf concept — meaning the Ten Five corporate origin story and Daley's personal credibility are entangled with the lawsuit's outcome.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      visible_priorities: [
        {
          value:
            "Geographic expansion + brand portfolio scaling — five active markets in four years, Miami opened 2024, NYC signed 2025, Scottsdale being courted 2026.",
          source: "manual",
          captured_at: NOW,
          confidence: "high",
        },
        {
          value:
            "Resolution of the Relevant Group litigation — quoted publicly defending Ten Five as a 'new type of hospitality company,' suggesting he's actively managing the narrative around the firm's origins.",
          source: "manual",
          captured_at: NOW,
          confidence: "medium",
        },
      ],
      rapport_hooks: [
        {
          value:
            "Hotel-F&B operator background (Dream Hotel Group, PUBLIC Hotels). Macerich's luxury wing is functionally a destination-resort F&B environment — the customer profile is closer to a hotel guest than a mall shopper. He'll respond to operator-language framing of the Francine space, not retail-leasing framing.",
          source: "manual",
          captured_at: NOW,
          confidence: "medium",
        },
        {
          value:
            "Mother Wolf Miami — opened October 2024 at the Surf Club / South Beach. It's the closest operating analogue to what a Scottsdale unit would be: destination luxury market, year-round resort customer, anchor-tenant positioning. Asking about the Miami learnings is both substantive AND a softer way to surface the Mother Wolf brand questions.",
          source: "manual",
          captured_at: NOW,
          confidence: "medium",
        },
      ],
      watch_for: [
        "Which concept he proposes for the Francine space. If 'Mother Wolf' — the trademark litigation is immediately operative; Jessica needs the legal status before any LOI discussion. If 'Ka'teen' or 'Bar Lis' — different brand risk profile, but Ka'teen is Yucatán-coastal which overlaps Toca Madera's Mexican upscale positioning, and Bar Lis is rooftop which Francine's space isn't.",
        "How he describes the Relevant Group litigation if it comes up. 'It's a former-employer dispute, well-managed, doesn't affect operations' is one answer; deflection or 'no comment on legal' is a different signal entirely. Either is informative.",
        "Whether he references a Scottsdale-resident operator by name (GM identified) or talks about 'recruiting' the right person. Identified operator = Ten Five has thought about the unit specifically; recruiting = the deal is concept-first, operator-second.",
        "His framing of Macerich. 'Premier luxury landlord' / 'right market for us' = aligned. 'We've been looking at Scottsdale for a while' = he's been pursuing this specifically. 'Francine left a great space' = he's positioning Ten Five as the natural fit, which he is, but Jessica's job is to make sure 'natural fit' is also 'underwritten fit.'",
        "Capital structure questions. If he volunteers info about lease guaranty, personal vs corporate guaranty, build-out capitalization, that's strong. If he's vague or defers to 'our team,' Jessica should push — restaurant tenant defaults are the #1 cause of luxury-wing vacancy embarrassment, and the Relevant Group litigation makes a corporate guaranty meaningfully riskier than it would be for a clean operator.",
        "Whether he asks about other restaurants on the property by name. If he knows the SFS dining mix cold (Nobu, Ocean 44, Toca Madera, Elephante, Catch, Zinque, the incoming Teleferic/Din Tai Fung/Edo) — he's serious and prepared. If not — he's exploring, which is fine for a first call but signals Jessica should hold pricing/timeline conversations for a second touch.",
      ],
      linkedin_url: "https://www.linkedin.com/in/dan-daley-81596338/",
    },
    {
      name: "Kim Walker",
      title: {
        value: "CMO, Co-Founder — Ten Five Hospitality",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      role_in_deal: {
        value: "unknown",
        confidence: "low",
        rationale:
          "Co-founder + CMO. Likely involved in brand-positioning decisions (which concept goes into the Francine space) but probably not in the lease-economics call. Worth asking Dan whether Kim should be in the next conversation if the discussion gets concept-specific.",
      },
      background: {
        value:
          "Co-founded Ten Five Hospitality with Dan Daley in 2021. CMO. Public profile is thinner than Daley's; LinkedIn search did not return a verified profile with a public URL. Likely background is hospitality marketing / brand development, but unconfirmed.",
        source: "manual",
        captured_at: NOW,
        confidence: "low",
      },
      visible_priorities: [],
      rapport_hooks: [],
      watch_for: [
        "Whether Dan brings her into the conversation when concept selection comes up. If yes, she's the decision-maker on which Ten Five brand goes into Scottsdale. If no, the concept decision is made by Dan alone — informative either way.",
      ],
    },
    {
      name: "Giancarlo Pagani",
      title: {
        value: "Managing Partner, Food & Beverage — Ten Five Hospitality",
        source: "manual",
        captured_at: NOW,
        confidence: "medium",
      },
      role_in_deal: {
        value: "operator",
        confidence: "medium",
        rationale:
          "Managing Partner overseeing F&B operations. Likely the practitioner whose team would actually run the unit. Not in this call unless Dan brings him; would be a natural participant in the second meeting if discussion moves toward unit-level operations and GM identification.",
      },
      background: {
        value:
          "Public profile is thin. Named in Ten Five's launch coverage as a partner with F&B operational responsibility. No verifiable LinkedIn URL surfaced in research.",
        source: "manual",
        captured_at: NOW,
        confidence: "low",
      },
      visible_priorities: [],
      rapport_hooks: [],
      watch_for: [
        "Whether Dan offers to bring him into the next call. 'Giancarlo would walk you through how we'd operate the space' is a strong signal of serious intent.",
      ],
    },
  ],

  competitive_context: {
    direct_competitors: [
      {
        value:
          "Direct competitors for the Francine space are other multi-concept hospitality groups that COULD lease luxury-wing F&B. These include groups like Major Food Group (Carbone, Sadelle's, ZZ's), Catch Hospitality Group (already at SFS via Catch), Tao Group (Nobu-adjacent but Macerich already has Nobu), Mastro's Restaurants (already at SFS via Ocean 44), and Madera Group (already at SFS via Toca Madera). Of the realistic outside groups, Major Food Group is the most plausible alternative bidder — they've been expanding into Sun Belt luxury markets and have an open Scottsdale rumor in trade press over the last 18 months, though nothing confirmed.",
        source: "manual",
        captured_at: NOW,
        confidence: "low",
      },
    ],
    market_position: {
      value:
        "Premium concept-led hospitality operator. Ten Five's brand sits one tier below Major Food Group (less press, smaller portfolio, founder-operator scale) and one tier above category mid-market chains. Their concepts (Mother Wolf, Ka'teen, Bar Lis) are positioned as destination experiences, not category restaurants — which fits Macerich's luxury wing positioning. The unresolved question is operational maturity: are they a polished operator with five years of execution, or are they still in the founder-scale phase where every new unit creates corporate-bandwidth strain.",
      source: "manual",
      captured_at: NOW,
      confidence: "medium",
    },
    internal_competitors: [
      {
        value:
          "The DO-NOTHING competitor — leaving the Francine space vacant for 6+ months while Macerich runs a competitive RFP. This is the safest answer for Macerich-side risk management given the Ten Five litigation, but it has real cost: luxury wing vacancy degrades the Palm Court redesign narrative, and any incoming tenant in 2027 will benchmark their economics against a property that publicly held a marquee space empty.",
        source: "manual",
        captured_at: NOW,
        confidence: "high",
      },
      {
        value:
          "RETAIL conversion of the space — i.e. lease it to a luxury retailer rather than a restaurant. The luxury wing already has heavy retail (Neiman Marcus, Dior, Saint Laurent); converting Francine's space to retail would reduce restaurant density (which Jessica named as a concern) but loses the destination F&B halo the luxury wing has been investing in. Strategically off-thesis for SFS's current direction but worth holding as a fallback option in Jessica's back pocket.",
        source: "manual",
        captured_at: NOW,
        confidence: "medium",
      },
    ],
  },

  pre_call_brief: {
    product_context:
      "Jessica Janes is AVP Leasing, National Restaurant Group at Macerich. She owns restaurant leasing strategy across Macerich's national portfolio. The specific opportunity: the ~5,000 sq ft Francine space at Scottsdale Fashion Square — luxury wing, adjacent to Nobu, Ocean 44, Toca Madera. The space went dark abruptly on May 13, 2026 (eight days ago). Ten Five Hospitality wants the lease. Jessica's product here is the LEASE itself — the question isn't 'do they want it' (they do), it's 'is Ten Five the right operator for this specific slot, given (a) the existing restaurant density at SFS, (b) Ten Five's active commercial litigation, (c) Ten Five's lack of any Arizona footprint, and (d) Macerich's luxury repositioning narrative.'",
    primary_objective:
      "Resolve THREE qualifying questions in this call before any LOI discussion: (1) WHICH Ten Five concept is being proposed for the Francine space (Mother Wolf, Ka'teen, Bar Lis, or something new); (2) WHAT is the current status of the Relevant Group litigation and does it affect the proposed brand; (3) WHO would operate the unit on the ground in Scottsdale — identified GM with relocation, recruited cold, or shared with another property. Everything else — lease economics, build-out, timing — is downstream of those three. The temptation is to talk economics first because both sides want the deal; resist it. Operator-fit underwriting first, economics second.",
    opening_angle:
      "Lead with the space, not the company. Something like: 'Dan — the Francine slot went dark eight days ago, and you've been quick to raise your hand. Before we get to economics, I want to understand the fit. Walk me through which Ten Five concept you'd put in that space, and why that concept earns its luxury-wing positioning at Scottsdale Fashion Square specifically.' This frames Jessica as the underwriter (not the closer), forces Dan to articulate concept-fit on the record before pricing is even on the table, and gives Jessica the input she needs to ask the next two qualifying questions in the natural order.",
    questions_to_qualify: [
      {
        question:
          "Which Ten Five concept are you proposing for the Francine space, and why does that specific concept fit the SFS luxury wing alongside Nobu, Ocean 44, and Toca Madera?",
        rationale:
          "The single most important qualifying question. Macerich already has Japanese (Nobu), seafood/steakhouse (Ocean 44), and modern Mexican upscale (Toca Madera) in the luxury wing — plus Catch, Elephante, Zinque elsewhere on property. Whichever concept Dan names tells Jessica three things: (1) brand-mix overlap or differentiation, (2) Ten Five's read on the SFS customer (is it Hollywood-style scene-dining, resort-style coastal, Roman-Italian, or something else), and (3) whether the concept brings any active litigation risk. If he says 'Mother Wolf,' the trademark question moves to the front of the next conversation. If he says 'a new concept,' Jessica needs to understand what 'new' means — original IP or a Ten Five-developed extension.",
      },
      {
        question:
          "Tell me where you are with the Relevant Group litigation — is it active, has it been resolved, and does the outcome affect the brand you're proposing for Scottsdale?",
        rationale:
          "Macerich legal will surface this in diligence regardless of whether Jessica raises it. Better to ask Dan directly, in his own words, while the call is collaborative. The answer is also self-qualifying — a confident, specific, well-managed response (status, scope, brand impact) tells Jessica Ten Five has the operating maturity to handle public-facing litigation while expanding. A vague or defensive response is itself a signal about operator stability. Ask it gently — Jessica is not the press; she's an underwriter. The tone is 'I need to understand this because my legal team will ask me.'",
      },
      {
        question:
          "Who would operate the unit on the ground in Scottsdale — do you have a GM identified, would they relocate, or are you recruiting cold? And what's the corporate operating model for a market where Ten Five doesn't currently have a property?",
        rationale:
          "This is the bench-depth question. Ten Five has opened Miami in Oct 2024, signed NYC in Sep 2025, and is now pursuing Scottsdale in May 2026 — three major properties in 18 months for a privately held hospitality group with no public capital disclosure. The risk isn't ambition; it's operational bandwidth. An identified GM with relocation is a strong answer; recruiting cold is a normal answer that requires longer ramp; 'shared with another property' would be a yellow flag for an anchor luxury-wing tenant. Ask it directly — Dan should be able to answer this without ambiguity.",
      },
      {
        question:
          "What's the lease structure you'd want — concept-led personal guaranty, corporate guaranty from Ten Five Hospitality, or some hybrid structure? And what does your build-out capitalization look like — equity-funded, debt-funded, mall-funded TI?",
        rationale:
          "Tests the financial seriousness. A serious tenant for a luxury-wing slot at SFS knows their guaranty position and their build-out funding plan before the first call. If Dan defers to 'our team will get back to you,' the deal is earlier-stage than the conversation has suggested. If he answers crisply — 'corporate guaranty on a 10-year primary, build-out is equity-funded with X% TI ask' — Ten Five has done the work. The Relevant Group litigation also makes a corporate guaranty meaningfully riskier than for a clean operator; Jessica should ask Dan how he frames that to landlords.",
      },
      {
        question:
          "How do you think about the Scottsdale market specifically — what's the customer profile you're underwriting against, and how does Ten Five's read of that customer differ from how Toca Madera, Ocean 44, and Nobu are reading them?",
        rationale:
          "Forces Dan to articulate the demand-side thesis in his own words. The answer tells Jessica whether Ten Five has done market work specific to Scottsdale or whether they're treating SFS as 'another luxury Sun Belt destination' interchangeable with Miami. The Scottsdale year-round resort/snowbird customer is real but specific — the difference between Scottsdale and Miami matters operationally (drink pricing, peak season patterns, weeknight covers, banquet/event mix). If Dan can speak to that, he's serious. If he generalizes, he's still developing the market view.",
      },
      {
        question:
          "Who else should be in the next conversation — Giancarlo on operations, Kim on brand, your real estate counsel, anyone from your capital partners?",
        rationale:
          "Surfaces the actual buying-committee on Ten Five's side. If Dan names Giancarlo + Kim, the deal is concept-and-operations serious. If he says 'just me' through multiple calls, that's an asymmetric process — Jessica will have her Macerich team on the next call (leasing legal, possibly market president), and a single-person counterparty for a marquee luxury-wing lease is structurally fragile. Asked collaboratively — 'who else should be in the room' — not interrogatively.",
      },
    ],
    landmines: [
      "Do NOT lead with the Relevant Group litigation. It's the most important question in the file, but opening with it makes Jessica look adversarial and triggers Dan's defensive reflexes before the conversation has built any trust. Surface it second, after he's named the concept — the concept question gives natural cover ('and obviously I want to understand whether the Mother Wolf brand has any active legal questions attached to it').",
      "Do NOT let economics happen in the first call. Both sides want this deal — the Francine vacancy is fresh, the Ten Five expansion thesis is real, and there's a gravitational pull toward 'let's talk lease economics.' Resist it. Concept-fit + litigation status + operator bench depth FIRST. Lease economics can wait until call two.",
      "Do NOT frame Macerich's restaurant density as a problem on the call. Jessica's instinct that 'we have a lot of restaurants on the property' is correct and important — but as an underwriting concern, not as a negotiating position. Saying it out loud to Dan signals weakness ('we're saturated') and gives him a frame to argue against. Keep restaurant density inside Jessica's head as a screening criterion, not on the table as a topic.",
      "Do NOT mention Major Food Group or any other potential alternative tenant by name. Even if Jessica believes MFG is a plausible alternative for the slot, naming a competitor in a first call is unforced error — it tells Dan that Macerich is running a parallel process and changes his negotiating posture in ways that don't help Macerich. The alternative-tenant landscape is a Jessica-side internal fact, not a topic for Dan.",
      "Do NOT commit to a timeline in the first call. The Palm Court redesign timeline (through November 2026) creates pressure to fill the Francine space in parallel — but committing publicly to a 'we'd like to have a tenant signed by [date]' invites Dan to negotiate against that deadline. Hold the timeline internally; let Dan ask 'what's your timing on the space' and answer in ranges, not points.",
      "Do NOT use the word 'risk' when talking about Ten Five's profile. The right word is 'underwriting' — Jessica is doing underwriting, not gating. 'I need to underwrite the brand fit and operator stability' is collaborative; 'we need to assess the risk' is adversarial. Same content, different posture.",
    ],
    evidence_to_bring: [
      "Current SFS dining mix at the luxury wing, with category descriptors — so Jessica can talk about restaurant density and category coverage concretely if the conversation requires it. Knowing this cold is also useful for evaluating whatever concept Dan names against the existing tenants.",
      "Macerich's broader F&B leasing principles or rep framework — if there's an internal underwriting template Macerich uses for restaurant tenants, the relevant fields (operator history, brand portfolio, concept fit, capital structure, GM identification) should be top-of-mind so Jessica can check them off in real time during the call.",
      "Public timeline of the Relevant Group v. Ten Five Hospitality case — the most recent public docket update Jessica or her legal team can find. If the case has been resolved, that changes the conversation materially; if it's still active, knowing the current procedural status helps Jessica frame the question precisely.",
      "Ten Five's existing concept portfolio summary — Mother Wolf, Ka'teen, Bar Lis, Desert 5 Spot, The Chap — with the cities they operate in and the rough customer profile of each. Helps Jessica react quickly when Dan names a concept; she's not Googling under the desk.",
    ],
  },

  metadata: {
    generated_at: NOW,
    sources_used: ["manual", "company_website", "web_search"],
    confidence_overall: "medium",
    product_context:
      "Jessica is selling RESTAURANT LEASES at Macerich's Scottsdale Fashion Square. The specific opportunity is the ~5,000 sq ft Francine space in the luxury wing, vacated abruptly on May 13, 2026. Ten Five Hospitality (a Hollywood-based multi-concept hospitality operator) wants the lease. Every recent_event's relevance is written through the lens of: 'is Ten Five the right operator for this specific slot — given existing restaurant density at SFS, the operator's active commercial litigation, the operator's lack of Arizona footprint, and Macerich's luxury repositioning narrative.' The fight is NOT 'does Ten Five want the space' (they do). The fight is 'should Macerich give it to them, and if so, on what terms.'",
    notes:
      "Account-level intelligence on Ten Five's portfolio, leadership, and the Relevant Group litigation is high confidence (multiple corroborating public sources — Hotel Business launch coverage, Real Deal LA / Robb Report / LV Review-Journal litigation reporting). The Francine closure is high confidence (Phoenix New Times, Hoodline, Patch — closed ~May 12-13 2026). Ten Five's capital structure, GM bench depth, and concept-for-Scottsdale selection are unknown — those are the gaps Jessica's first call should fill. Kim Walker and Giancarlo Pagani profiles are thin (no public LinkedIn surfaced) — pending verification once they appear on the deal.",
    gaps: [
      "Current procedural status of Relevant Group v. Ten Five Hospitality (filed 2023-07-18; no recent public docket update surfaced)",
      "Which specific Ten Five concept is being proposed for the Francine space (Mother Wolf / Ka'teen / Bar Lis / new)",
      "Ten Five's capital structure and corporate guaranty profile",
      "GM identification for a Scottsdale unit (identified-and-relocating vs. recruited-cold)",
      "Whether Ten Five's hotel F&B operating relationships with Relevant Group's Hollywood properties survived the litigation",
      "Lease comparables Macerich is referencing internally for the luxury-wing F&B slot at SFS",
      "Whether any alternative tenant has expressed interest in the Francine space (Major Food Group, others)",
    ],
  },
};
