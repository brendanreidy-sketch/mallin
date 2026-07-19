# SaaS demo book — v1 narrative specification

**Status:** APPROVED narrative · **ON HOLD — no design-partner demo scheduled** · NOT implemented,
NOT seeded · **Ready to implement when a demo is booked** (then follow the pre-seed gate in
[saas-demo-book-v1-seed-plan.md](saas-demo-book-v1-seed-plan.md)).
**Scope:** v1 = the four-deal *minimum credible* SaaS book. The remaining three deals
(Ardent Fintech · stalled, Brightloom · at-risk #2, Junip HR · early) are **v2**, to be
added only after feedback from a real design-partner demonstration.
**Governing rule:** demo lives beside the real path; nothing here touches real tenants.
See [demo-industry-instances.md](../demo-industry-instances.md).

This document is the source of truth for the deal *narratives*. The implementation + seed
plan (records, placeholder handling, preflight, backup, validation, rollback) is produced
**after** these narratives are approved — it is not in this file.

---

## 0. The book — one coherent seller, one coherent world

**The seller.** A single Account Executive selling **Meridian**, an embedded product-analytics
platform. SaaS companies buy Meridian to put customer-facing dashboards *inside their own
product* instead of building and maintaining that analytics layer themselves. So every deal is
a software company weighing **Meridian vs building it in-house** (and, where a vendor is already
in place, vs the incumbent **Chartwell**).

The four deals are deliberately one book owned by one rep:

| Dimension | The consistent choice across all four deals |
|---|---|
| **ICP** | Mid-market B2B SaaS, Series B–D, ~250–800 employees, whose *own customers* are asking for in-product analytics. Buying committee is always: a product/data leader (**champion**), a finance/ops exec (**economic buyer**), and a staff/platform engineer (**technical**, the build-vs-buy gatekeeper). |
| **ACV** | $90k–$180k ARR. Nothing outside that band. |
| **Methodology** | **MEDDPICC** on every deal — the same qualification language (Metrics, Economic Buyer, Decision Criteria/Process, Paper Process, Identified Pain, Champion, Competition). |
| **Sales-cycle timing** | 3.5–5 month cycles. Deals opened Feb–May 2026; "today" in the demo is **2026-07-18**. Won/lost deals closed May–Jun; live deals close Aug. |
| **Competition & commercial language** | Always **build-in-house** (the perennial no-decision) and **Chartwell** (the incumbent embedded-analytics vendor). Shared vocabulary: renewal risk, compelling event, single-/multithreaded, mutual action plan, paper process, SOC 2. |

**Where Mallín's differentiation is visible in every deal** (not claimed — shown):

1. **Institutional knowledge** — Mallín carries memory *across* deals: the live at-risk deal is
   explicitly matched to the deal the rep already lost; the won deal's play is filed to coach the
   next one.
2. **Evidence-backed** — every risk and recommendation cites a specific call quote (an
   `evidence_id`), never a vibe.
3. **Guided execution, not a dashboard** — Mallín names the *one move* and drafts the artifact
   (the email, the one-pager, the mutual action plan). It does not hand you charts to interpret.
4. **Learning from wins, losses, and seller actions** — the ledger labels each closed deal with
   *did the flagged risk materialize?* and *did the rep run the recommended move?* — so wins and
   losses become training data.
5. **Facts vs assumptions vs recommended moves** — each brief keeps the three visibly separate:
   what the calls prove, what Mallín is inferring (flagged as unverified), and what it recommends.

---

## Deal 1 — Cloudpeak · **Closed WON** · $140k ARR

### 1. Company overview and business problem
Cloudpeak is a DevOps incident-management / on-call SaaS (Series C, ~600 employees). Their
enterprise customers keep asking for richer in-product analytics on incident trends and MTTR, and
Cloudpeak's thin in-house charts are becoming a renewal liability. Internally there's a build-vs-buy
debate: the platform team believes they could build it; product leadership doesn't want to spend a
quarter of roadmap on it.

### 2. Seller's deal thesis
Cloudpeak has to ship customer-facing analytics before its Q3 enterprise renewals or risk churn on
named accounts. Buying Meridian is faster than building. The deal is won by tying Meridian directly
to the **renewal-risk dollar figure** and getting the economic buyer to own that number.

### 3. Stage, amount, close date, methodology
Closed Won · **$140,000 ARR** · MEDDPICC · opened 2026-02-10, **closed 2026-06-12** (~4-month cycle).

### 4. Stakeholders, roles, influence, relationships
- **Dana Okafor** — VP Product · **champion** · high influence (owns the roadmap). Drove the deal.
- **Marcus Feld** — CFO · **economic buyer** · high influence (signs). Trusts Dana, but needed the
  renewal number before committing.
- **Priya Rao** — Staff Data Engineer · **technical** · medium influence. The build-in-house
  advocate; had to be converted, not defeated. Dana recruited her buy-in.

### 5. Timeline of calls and meaningful events
- **2026-02-10 · Discovery** (Dana): pain established — enterprise customers naming analytics.
- **2026-03-04 · Technical deep-dive** (Dana + Priya): Priya argues "we can build this in a quarter."
- **2026-03-25 · Business case** (Dana): Dana quantifies the exposure — enterprise ARR up for
  renewal that named analytics.
- **2026-04-20 · Economic-buyer call** (Dana + **Marcus**): the multithread — rep brings Marcus in
  on the renewal number.
- **2026-05-15 · Redline & close plan.**
- **2026-06-12 · Closed Won.**

### 6. Evidence supporting every risk and recommendation
- *Single-threaded risk:* only Dana attended calls 1–3 (no other external attendee logged).
- *Build-in-house threat:* Priya, call 2 — "we could build this in a quarter."
- *Compelling event / the winning metric:* Dana, call 3 — "$2.1M of enterprise ARR renews in Q3 and
  three of those accounts named analytics as a gap."

### 7. What Mallín identifies
- **Fact:** the deal is single-threaded on Dana through call 3.
- **Fact:** a credible build-in-house alternative exists (Priya, call 2).
- **Fact:** there is a real compelling event — Q3 renewals worth $2.1M (Dana, call 3).
- **Institutional read:** single-threaded deals are how this rep's team loses — get to the economic
  buyer before the build-vs-buy decision hardens.

### 8. What Mallín recommends the seller do
- **Move:** multithread to Marcus (economic buyer) **now**, anchored on the $2.1M renewal figure,
  before Priya's build case sets.
- **Guided execution:** Mallín drafts the one-page business case for Dana to forward to Marcus
  (renewal exposure → Meridian timeline → build cost in engineer-quarters).

### 9. Expected outcome
Won. In the ledger: `outcome: won`, **`risk_materialized: false`** (build-in-house did not win),
**`move_taken: true`** (the rep multithreaded). The clean "the advice worked" case.

### 10. Capabilities demonstrated
- **Ledger:** a labeled win with its reason and the risk/move outcome flags.
- **Knowledge:** the extracted **winning play** — *"multithread to the economic buyer on a renewal
  metric before build-vs-buy hardens."*
- **Cockpit / Prep:** the historical brief reads as a formed thesis with the decisive move recorded.

### 11. Demo talk track (first person)
> "Start with a deal I *won*, in June. Watch what Mallín kept in front of me. For the first three
> calls I was single-threaded on Dana, my champion — and Mallín flagged that, because it knows
> single-threaded is how my team loses deals. It pointed me at the renewal number Dana gave me and
> said: get the CFO in the room on *that* number before the build-in-house camp wins. It even drafted
> the business case. I did it, we won — and now Mallín has filed this as a labeled win: the risk it
> caught, and the move that beat it. That's institutional memory I can hand to the next rep."

---

## Deal 2 — Tanager Commerce · **Closed LOST** · $90k ARR

### 1. Company overview and business problem
Tanager Commerce is a headless-commerce SaaS (Series B, ~250 employees). Their merchants want
reporting dashboards, and Tanager's small data team is stretched. Real pain existed — but no
executive felt urgency about it.

### 2. Seller's deal thesis (as it stood at the time)
Land with the analytics lead who feels the pain, then expand. **The thesis was thin**: it rested on
one enthusiastic user and never engaged anyone who owned budget — a weakness Mallín named early.

### 3. Stage, amount, close date, methodology
Closed Lost · **$90,000 ARR** · MEDDPICC · opened 2026-02-18, **lost 2026-05-28**
(no-decision → build-in-house stopgap).

### 4. Stakeholders, roles, influence, relationships
- **Sam Ellis** — Analytics Lead · **user / would-be champion** · medium influence, **no budget
  authority**. Genuinely enthusiastic.
- **Rachel Voss** — VP Engineering · **economic buyer** · high influence — but **never engaged**
  (named on call 3, never in a meeting).

### 5. Timeline of calls and meaningful events
- **2026-02-18 · Discovery** (Sam): strong pain, high enthusiasm.
- **2026-03-10 · Demo** (Sam + two analysts).
- **2026-04-02 · Follow-up** (Sam): "I'll take this to Rachel" — the rep did **not** force the intro.
- **2026-04 → 05 · silence** (no economic-buyer meeting ever booked).
- **2026-05-28 · Closed Lost** — Tanager built an in-house stopgap.

### 6. Evidence supporting every risk and recommendation
- *Single-threaded-on-a-user risk:* Sam attended every call; zero calls logged with any
  budget owner.
- *Economic buyer never reached:* Sam, call 3 — "I'll take this to Rachel" (no Rachel meeting ever
  follows).
- *Momentum death:* 56 days with no activity before the deal was marked lost.

### 7. What Mallín identifies
- **Fact:** single-threaded on Sam, who has no budget authority.
- **Fact:** the economic buyer (Rachel) was never in a single call.
- **Institutional read (the pattern):** this is the shape of deals that die by no-decision — a user
  with no budget, no economic-buyer access. Mallín pattern-matched it while the deal was still open.

### 8. What Mallín recommended the seller do (at the time)
- **Move:** do not advance to proposal until Rachel is in a call; make Sam earn the intro by
  co-authoring the business case; if there is no economic-buyer access within two weeks, qualify out.
- **What actually happened:** the rep got busy and didn't force it — the move was **not taken**.

### 9. Expected outcome
Lost. In the ledger: `outcome: lost`, **`risk_materialized: true`** (it died exactly as flagged),
**`move_taken: false`** (the rep didn't act). The counterfactual teacher.

### 10. Capabilities demonstrated
- **Ledger:** a labeled *loss* with the reason and the "flagged, not acted on, materialized" flags —
  the deal-save ledger proving Mallín is not a cheerleader.
- **Knowledge:** the extracted **trap** — *"single-threaded on a user with no budget authority →
  no-decision / build-in-house."*
- **Cross-deal setup:** this loss is the memory Mallín will invoke on Deal 3 (Vela).

### 11. Demo talk track (first person)
> "Now a deal I *lost* — because this is where Mallín earns its keep. Back in April it told me this
> one was single-threaded on Sam, an analytics lead with no budget, and it had seen that exact shape
> die before. It said plainly: don't send a proposal until you're in a room with the economic buyer.
> I got busy. I didn't. Tanager built a stopgap in-house and the deal died — for the precise reason
> Mallín named. It's in my ledger now as a labeled loss. So Mallín remembers what kills my deals, not
> just what wins them — and in a second I'll show you it use *this* loss to save a live one."

---

## Deal 3 — Vela Supply · **NEEDS ATTENTION (at risk)** · $160k ARR

### 1. Company overview and business problem
Vela Supply is a freight-visibility / supply-chain SaaS (Series C, ~700 employees). Their enterprise
prospects are asking for embedded analytics *in RFPs*, and Vela is losing deals without it. The pain
is competitive and real.

### 2. Seller's deal thesis
Vela needs Meridian to win its *own* enterprise deals — a strong strategic fit. But the deal's spine
just broke: the champion left the company, and it's now single-threaded on a junior owner.

### 3. Stage, amount, close date, methodology
Evaluation / Technical Validation (stage 3 of 5) · **$160,000 ARR** · MEDDPICC · opened 2026-04-08,
close target **2026-08-15** — **currently at risk**.

### 4. Stakeholders, roles, influence, relationships
- **Jordan Wells** — *ex-*VP Product · was the **champion** · **departed Vela 2026-07-03**.
- **Erin Blake** — Senior PM · **user** · inherited the evaluation; engaged but junior, no exec air
  cover, unsure who now owns budget.
- **Hal Munoz** — COO · **economic buyer** · met once early (call 2), **cold since Jordan left**.

### 5. Timeline of calls and meaningful events
- **2026-04-08 · Discovery** (Jordan + Erin).
- **2026-05-06 · Exec alignment** (Jordan + Hal): Hal warm-ish, deferred to Jordan.
- **2026-06-10 · Technical validation** (Jordan + Erin).
- **2026-07-03 · Jordan departs Vela** (enrichment/CRM signal).
- **2026-07-06 · Check-in** (Erin only): tone cooled; Erin unsure who's driving.
- **2026-07-18 (today):** 12 days since last contact; the 2026-08-15 close is slipping.

### 6. Evidence supporting every risk and recommendation
- *Champion loss:* Jordan-departure signal (2026-07-03) + Jordan absent from call 4.
- *Single-threaded on a junior owner:* Erin, call 4 — "with Jordan gone I'm not sure who's driving
  this."
- *Economic buyer gone cold:* no Hal call since 2026-05-06.

### 7. What Mallín identifies
- **Fact:** the champion (Jordan) has left; the deal is single-threaded on Erin, a PM with no budget.
- **Fact:** the economic buyer (Hal) has been cold for ~10 weeks.
- **Assumption (flagged unverified):** the budget line may be frozen pending Jordan's backfill —
  Mallín marks this as an inference, not a known fact, and tells the rep to confirm it.
- **Institutional knowledge (the differentiator moment):** *"This is the Tanager shape —
  single-threaded, no economic buyer engaged. That is the deal you lost in May."* Mallín invokes the
  labeled loss from Deal 2.

### 8. What Mallín recommends the seller do
- **Move 1:** convert Erin into an internal champion — give her a one-pager she can forward upward.
- **Move 2:** re-engage Hal on the enterprise RFPs Vela is losing (his business problem, not ours).
- **Move 3:** re-confirm the compelling event (a specific Vela enterprise RFP deadline).
- **Guardrail:** do **not** send pricing until Hal re-engages — repeating Tanager would kill it.
- **Guided execution:** Mallín drafts the Erin champion-enablement email and the Hal one-pager.

### 9. Expected outcome
**Open — at risk.** The demo shows Mallín *steering the deal back*, not a foregone result. This is
the deal the rep would lose without it.

### 10. Capabilities demonstrated
- **Cockpit:** appears under **Needs you**.
- **Prep:** stakeholder strategy (champion-loss → remap), evidence-cited critical risks, the
  recommended moves, and drafted artifacts.
- **Institutional knowledge:** the explicit link to the Tanager loss (Deal 2).
- **Facts / assumptions / moves:** all three visibly separated (departure = fact; budget freeze =
  flagged assumption; multithread now = move).

### 11. Demo talk track (first person)
> "Here's a *live* deal — the one I'd lose without Mallín. Two weeks ago my champion Jordan left Vela.
> Mallín caught the departure from the data, flagged that I'm now single-threaded on Erin, a PM with
> no budget — and then it did the thing no dashboard does: it said 'this is the same shape as
> Tanager, the deal you lost in May.' It *remembered* my loss and used it to warn me. Then it gave
> me the moves — turn Erin into a champion with this one-pager, use it to get the COO back — and it
> drafted both. And look how careful it is: Jordan leaving is a fact from the data; the budget freeze
> is an assumption it flags as unverified and tells me to check; multithreading now is its
> recommended move. Facts, assumptions, moves — never blurred together."

---

## Deal 4 — Keelstone Data · **ON TRACK** · $180k ARR

### 1. Company overview and business problem
Keelstone Data is a reverse-ETL / data-pipeline SaaS (Series C, ~800 employees). They're building a
usage-analytics feature for *their* customers and would rather buy that layer than divert their
platform team from the core pipeline product. Strong strategic fit, executive-sponsored.

### 2. Seller's deal thesis
Keelstone is multithreaded, exec-sponsored, and on a clear timeline tied to their own product launch.
Meridian is the clean buy-vs-build winner. The job here isn't to rescue the deal — it's to keep it
clean, confirm the mutual action plan, and not let procurement become the thing that slips the close.

### 3. Stage, amount, close date, methodology
Proposal / Mutual Plan (stage 4 of 5) · **$180,000 ARR** · MEDDPICC · opened 2026-05-05, close
target **2026-08-05** — **on track**.

### 4. Stakeholders, roles, influence, relationships
- **Gabe Ruiz** — VP Data · **champion** · high influence, exec sponsor.
- **Ivy Chen** — CFO · **economic buyer** · high influence; has seen and endorsed the business case.
- **Leo Park** — Platform Lead · **technical** · medium influence; validated the integration, cleared
  security. Gabe and Ivy are aligned; Leo has signed off — a genuinely multithreaded deal.

### 5. Timeline of calls and meaningful events
- **2026-05-05 · Discovery** (Gabe).
- **2026-05-22 · Technical** (Gabe + Leo).
- **2026-06-09 · Business case** (Gabe + Ivy).
- **2026-06-30 · Security review** (Leo): SOC 2 cleared.
- **2026-07-14 · Pricing & mutual plan** (Gabe + Ivy).
- **Next · 2026-07-24 · close-plan confirmation.**

### 6. Evidence supporting every risk and recommendation
- *Multithreaded (health signal):* champion, economic buyer, and technical each attended calls.
- *Real compelling event:* Ivy, call 3 — "if this ships before our launch, the ROI is clear."
- *Buying intent:* Gabe, call 5 — "send the mutual plan, we'll countersign."
- *The one real risk:* no paper-process / procurement step is logged yet.

### 7. What Mallín identifies
- **Fact:** multithreaded, economic buyer engaged, security cleared, thesis formed.
- **Fact:** a genuine compelling event exists (Keelstone's own product launch).
- **Assumption (flagged):** procurement will take ~2–3 weeks — Mallín marks this as an estimate to
  verify, not a known lead time.
- **The honest, non-alarmist read:** the deal is healthy; the *only* exposure is that the paper
  process hasn't started.

### 8. What Mallín recommends the seller do
- **Move:** confirm the mutual action plan on the 2026-07-24 call and **kick off the paper process
  now**, so procurement doesn't slip the August close.
- **Guardrail:** don't over-discount a deal that's already won on value.
- **Guided execution:** Mallín drafts the mutual action plan for the next call.

### 9. Expected outcome
On track to close **2026-08-05**. Demonstrates that Mallín reads a *healthy* deal accurately instead
of manufacturing risk to look useful.

### 10. Capabilities demonstrated
- **Cockpit:** appears under **On track**.
- **Prep:** a formed-thesis, clean-next-step brief — the contrast case proving Mallín is not just an
  alarm system.
- **Guided execution:** the single highest-leverage next move (mutual plan + paper process), not a
  wall of green metrics.

### 11. Demo talk track (first person)
> "Last one, and deliberately a *healthy* deal — so you see Mallín isn't just an alarm. Keelstone is
> multithreaded: my champion Gabe, the CFO Ivy, and Leo on the technical side, all engaged, security
> cleared. Mallín confirms the thesis is formed and there's a real compelling event — their own
> product launch. It's not inventing risk to justify itself; the *only* thing it flags is that the
> paper process hasn't started, and it tells me to kick that off now so procurement doesn't slip an
> August close. And it drafted the mutual action plan for my next call. That's the difference between
> guided execution and a dashboard full of green checkmarks."

---

## The book as one demo arc

Played in order, the four deals tell one story about Mallín:

1. **Cloudpeak (won)** — "here's a win, and the play Mallín filed from it."
2. **Tanager (lost)** — "here's a loss it flagged and I ignored — it remembers what kills my deals."
3. **Vela (at risk)** — "here's it using that exact loss to save a live deal, with the moves drafted."
4. **Keelstone (on track)** — "and here it is on a healthy deal, honest that there's little to do."

Wins and losses feed the **ledger** and **Knowledge**; the live deals show **guided execution**; and
across all four, Mallín keeps **facts, assumptions, and recommended moves** visibly separate.

---

## Schema-mapping note (for the later implementation plan, not for approval)

Each deal above maps to one `DemoDeal` in `lib/demo/pipeline.ts`
(`account`, `deal`, `stakeholders[]`, `calls[]`, `brief` spec, optional `outcome`). The
`brief()` expander turns the spec into the `execution_artifact` the cockpit and `/prep` read —
synchronously, no LLM. The deal states map to `brief.posture` (`advancing` / `at_risk`), and the
closed deals carry `outcome` (`won` / `lost`) with `risk_materialized` + `move_taken`. The exact
records, placeholder handling, preflight, backup, validation, and rollback come in the
**implementation + seed plan after these narratives are approved.**

---

## Appendix A — Consistency matrix

One row per deal. (Wide table — scroll horizontally.)

| Company | State | Amount | Stage | Close date | Champion | Economic buyer | Technical stakeholder | Primary risk | Evidence for the risk | Recommended move | Competitor | Expected outcome | Mallín capability |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Cloudpeak** | Won | $140k | Closed Won (5/5) | 2026-06-12 | Dana Okafor · VP Product | Marcus Feld · CFO | Priya Rao · Staff Data Eng | Single-threaded on champion + build-in-house threat | Only Dana on calls 1-3; Priya call 2: "build in a quarter" | Multithread to the CFO on the $2.1M Q3 renewal metric | Build-in-house | Won - risk NOT materialized, move taken | Ledger win + Knowledge winning play |
| **Tanager Commerce** | Lost | $90k | Closed Lost | 2026-05-28 | Sam Ellis · Analytics Lead (no budget) | Rachel Voss · VP Eng - never engaged | none engaged | Single-threaded on a user with no budget; EB never reached | Sam call 3: "I'll take it to Rachel"; 0 EB calls; 56 days idle | Don't advance until the EB is in a call; qualify out if no access in 2 weeks | Build-in-house | Lost - risk materialized, move NOT taken | Ledger loss + Knowledge trap |
| **Vela Supply** | Needs attention (at risk) | $160k | Evaluation / Tech Validation (3/5) | 2026-08-15 | Jordan Wells · ex-VP Product - departed 07-03 | Hal Munoz · COO - cold | none engaged since champion left | Champion loss -> single-threaded on a junior PM; EB cold | Jordan-departure signal 07-03; Erin call 4: "not sure who's driving"; no EB call since 05-06 | Convert Erin to champion (one-pager); re-engage Hal on lost RFPs; hold pricing | Build-in-house (RFP-driven) | Open / at risk - Mallin steers it back | Cockpit needs-you + Prep + institutional knowledge (invokes Tanager) |
| **Keelstone Data** | On track | $180k | Proposal / Mutual Plan (4/5) | 2026-08-05 | Gabe Ruiz · VP Data | Ivy Chen · CFO | Leo Park · Platform Lead | Paper process not started -> procurement could slip the close | No paper-process step logged; Gabe call 5: "send the mutual plan, we'll countersign" | Confirm the mutual action plan; kick off the paper process now | Build-in-house | On track to close 2026-08-05 | Cockpit on-track + Prep healthy read + guided execution |

All company names validated clear of known-sample / real-brand collisions (Appendix C, check 6).

---

## Appendix B — Ten-minute demo sequence

Order: **Cloudpeak -> Tanager -> Vela -> Keelstone.** The arc is *win (acted) -> loss (didn't act) ->
live at-risk deal saved by that memory -> healthy deal read honestly.*

**0:00-1:00 · Frame.** Open the **Cockpit (deals home)**.
- *Say:* "This is my book - a mix of what needs me and what's on track, plus what I've already closed.
  I'll walk four deals and show how Mallin thinks about each."
- *Prospect understands:* Mallin is the rep's operating surface across a whole pipeline, not a
  single-deal toy.
- *Transition:* "Start with one I won."

**1:00-3:00 · Cloudpeak (won).** Show the **Ledger** entry, then the **Knowledge** winning play.
- *Say:* "I won Cloudpeak in June. For the first three calls I was single-threaded on my champion,
  Dana. Mallin flagged that - it knows single-threaded is how my team loses - and told me to get the
  CFO in on the renewal number Dana gave me. I did; we won. Mallin filed it as a labeled win: the risk
  it caught and the move that beat it."
- *Screen:* Ledger row (won, reasons, risk_materialized:false / move_taken:true) -> Knowledge play.
- *Prospect understands:* Mallin learns from wins and turns them into reusable, evidence-backed plays.
- *Transition:* "Now watch what happens when I *don't* listen."

**3:00-5:00 · Tanager (lost).** Show the **Ledger** loss, then the **Knowledge** trap.
- *Say:* "Tanager I lost. In April Mallin told me it was single-threaded on Sam, an analytics lead
  with no budget, and that it had seen that exact shape die. It said: don't send a proposal until
  you're with the economic buyer. I got busy, didn't force it - Tanager built in-house and the deal
  died, for the reason Mallin named. It's a labeled loss now."
- *Screen:* Ledger row (lost, risk_materialized:true / move_taken:false) -> Knowledge trap.
- *Prospect understands:* Mallin is not a cheerleader - it remembers what kills deals and holds the
  rep accountable.
- *Transition:* "Here's the payoff - watch it use that loss on a live deal."

**5:00-8:00 · Vela (at risk) - the centerpiece.** Open **Cockpit -> the Vela Prep brief.**
- *Say:* "Vela is live and at risk. Two weeks ago my champion Jordan left. Mallin caught the departure
  from the data, flagged I'm now single-threaded on Erin - a PM with no budget - and then said the
  thing no dashboard would: 'this is the same shape as Tanager, the deal you lost in May.' It
  remembered my loss. Then it gave me the moves - turn Erin into a champion with this one-pager, use it
  to get the COO back - and drafted both. And notice: Jordan leaving is a *fact*; the budget freeze is
  an *assumption* it flags as unverified; multithreading now is its *recommended move*."
- *Screen:* Prep - stakeholder strategy, the evidence-cited risk, the Tanager callout, drafted
  email/one-pager, and the facts/assumptions/moves separation.
- *Prospect understands:* institutional knowledge + evidence-backed, guided execution - Mallin applies
  a past loss to save a live deal and hands the rep the next action, not a chart.
- *Transition:* "Last one - and deliberately a healthy deal, so you see it's not just an alarm."

**8:00-9:30 · Keelstone (on track).** Open the **Keelstone Prep brief.**
- *Say:* "Keelstone is multithreaded - champion, CFO, technical, all engaged, security cleared. Mallin
  confirms the thesis is formed and there's a real compelling event, their own launch. It's not
  inventing risk to look useful; the *only* thing it flags is that the paper process hasn't started,
  and it tells me to kick that off now so procurement doesn't slip an August close. It even drafted the
  mutual action plan."
- *Screen:* Prep - formed thesis, the single paper-process risk, the drafted mutual plan.
- *Prospect understands:* Mallin reads a healthy deal accurately and still finds the one execution gap
  - guided execution, not a wall of green.
- *Transition (close):* "Four deals, one thread: it remembers what wins and what loses, it backs every
  call with evidence, and it tells me the next move. That's the difference from a dashboard."

**9:30-10:00 · Close.** Back to **Cockpit.** "This is one rep's book. Every rep's would look like this,
and Mallin gets sharper on every deal it runs."

---

## Appendix C - Consistency validation

1. **Every recommendation is evidence-backed - PASS.** Each recommended move traces to a cited call
   quote or data signal: Cloudpeak -> Dana's $2.1M renewal (call 3); Tanager -> Sam's "I'll take it
   to Rachel" + zero EB calls; Vela -> Jordan-departure signal + Erin call 4; Keelstone -> missing
   paper-process step + Gabe's countersign quote (call 5).
2. **Facts / assumptions / moves distinguishable - PASS.** The two live deals separate them explicitly
   (Vela: departure = fact, budget freeze = flagged assumption, multithread = move; Keelstone:
   multithread/security = fact, procurement lead time = flagged assumption, mutual-plan/paper-process =
   move). The two closed deals state facts + whether the move was taken.
3. **Dates internally consistent - PASS.** Cloudpeak 02-10 -> 06-12 (~4 mo). Tanager 04-02 last call +
   56 idle days = 05-28 lost. Vela 04-08 open, last call 07-06 (12 days before "today" 2026-07-18),
   close 08-15. Keelstone 05-05 -> 08-05 (~3 mo), next call 07-24. Every close date falls after the last
   logged call; all cycle lengths sit in the 3.5-5 month band.
4. **Titles / authority believable - PASS.** Champions are roadmap owners (VP Product / VP Data);
   economic buyers are finance/ops execs who sign (CFO / COO); technical stakeholders are staff/platform
   engineers (the build-vs-buy gatekeepers). The users who lack budget (Analytics Lead, Senior PM) are
   correctly NOT cast as economic buyers - that mismatch is the point of Tanager and Vela.
5. **MEDDPICC aligns with each deal's maturity - PASS.** Cloudpeak: full (Metrics, engaged EB, Champion,
   Competition) -> won. Tanager: gaps (no EB, powerless champion, no Metrics, no Paper Process) ->
   lost. Vela: was maturing, now regressed (Champion lost, EB cold, compelling event needs
   reconfirming) -> at risk. Keelstone: strong across the board with **Paper Process** the one open field
   -> on track. Maturity matches state in every case.
6. **No name collides with a known sample or real company - PASS (two names changed 2026-07-18).**
   Two demo companies were renamed to avoid collisions: the **lost** deal (its prior name matched a
   well-known e-commerce *sample database*) is now **Tanager Commerce**, and the **on-track** deal (its
   prior name matched a real analytics *brand*) is now **Keelstone Data**. Cloudpeak, Vela Supply, and
   the seller product "Meridian" are clear - distinct sectors, no direct collision; "Meridian" stays
   purely the fictional demo product. The renames are display strings only; the seed plan's state-based
   deal keys were updated to match for readability but carry no record-identity meaning.
