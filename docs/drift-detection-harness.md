# Drift-detection harness — proving "you believed X, reality is Y"

**Status:** design doc · contract only · NOT implemented · validation harness (NOT a UI surface)
**Last updated:** 2026-06-03
**Companion memory:** `topology_contradiction_hypothesis.md`, `deal_outcomes.md`, `dependency_mechanism_doctrine.md`, `behavioral_dependency_signal.md`, `intake_primitive_doctrine.md`, `stable_cognition_layer.md`
**Builds on:** the existing Pass 1.5 → 2 → 2c → 3 → 4 pipeline, `scripts/compare-pass4.ts`, the `_fixtures/*-substrate-full.json` corpus, and the outcome ground-truth in `deal_outcomes.md`.

> **The question this answers:** *When would Mallin have caught the thing that actually decided a deal — and would it have caught it before the rep, or only in hindsight?*
>
> **What it is NOT:** the rep-facing "X → Y → evidence → change" card. That's the next spec, and it's gated on this one proving precision. This harness is the offline instrument that earns the right to build that card.
>
> **Success test:** *"Run Mallin on Clenera's substrate as it stood at call 4 — no outcome leak. Does it surface the criteria-undefined / stakeholder-map-unvalidated contradiction as a decision-changing drift, before the Mar 30 loss made it obvious? Same for Cipher's build-vs-buy navigate, Goldrich's GTreasury-Ripple vendor-risk. Measure how often it catches the decisive contradiction, how often it cries wolf, and how many calls of lead time it buys."*

---

## 1. Why this is mostly an extension, not a new build

The pieces already exist; they've just been pointed at a different question (substrate-richness, run-to-run noise) instead of *time*.

- **Pass 4 already produces the "belief."** A `PrepArtifact` (`lib/contracts/execution-agent-output`) carries `deal_thesis` (status, confidence, decision_frame), `top_line` (posture), `critical_risks`, `stakeholder_strategy`. That IS the decision Mallin would hand the rep.
- **`compare-pass4.ts` is already a drift classifier skeleton.** It diffs two `PrepArtifact`s and — crucially — computes a **canonical view** (`controller`, `stage`, `dominant_risk_class`) and a **`directional_agreement`** boolean triple that distinguishes *"phrasing differs"* from *"interpretation differs."* It also emits `state_transition` (posture/decision_frame shift + triggering evidence). That canonical-decision axis is exactly what "load-bearing drift" means.
- **The corpus already supports slicing.** Deals ship in `calls-only` and `full` variants; substrate calls carry `started_at`. "Substrate as of call N" is a generalization of the subset mechanism the richness experiment already uses.
- **Ground truth already exists, and lives in the right place.** `deal_outcomes.md` holds the locked decisive mechanism per deal (Clenera: criteria undefined + stakeholder map unvalidated; Cipher: build-vs-buy navigated; Goldrich: GTreasury/Ripple vendor-risk) — and the substrate-hygiene rule keeps outcomes OUT of fixtures so the model forms its thesis blind.

What's missing is three things: a **time-slicer**, a **temporal** (not variant) framing of the comparator, and an **oracle scorer** that grades flagged drift against the known decisive contradiction.

---

## 2. The core idea

### 2.1 Two forms of drift — and the cold-start one comes first

**Form A — temporal drift (longitudinal).** Belief at call N vs belief at call N+k.
```
PrepArtifact(substrate ≤ call N)   = "what you believed"
PrepArtifact(substrate ≤ call N+k) = "reality now"
load-bearing drift = a flip on a canonical decision axis between them
```

**Form B — CRM-belief drift (zero-history, day-one).** The CRM encodes the rep's *last recorded belief*; the calls are reality. No accumulated history required.
```
CRM snapshot (StageName / Next Step / EB / Competition)  = "what you believed"
PrepArtifact(latest substrate)                            = "reality now"
load-bearing drift = substrate contradicts the CRM-encoded belief
```
Form B is the shortest path to the live moment (it works the second data is connected) and reuses `salesforce_writeback_spec.md` Phase 2 (the substrate-vs-CRM diff). **This harness validates Form A against the corpus first** — the corpus is where ground truth lives — then Form B inherits the validated drift classifier.

### 2.2 Load-bearing vs noise — the binding constraint

The hard problem is not detecting *a* change. It's detecting the *decision-changing* one. A drift counts as **load-bearing** only if it flips a canonical decision axis (reuse + extend `compare-pass4`'s `directional_agreement`):

- `controller` — who actually holds the decision (stakeholder topology / decision ownership)
- `stage` — the real maturity vs the declared stage
- `dominant_risk_class` — what is actually most likely to kill the deal
- *(candidate 4th axis, under test: `decision_frame` — "what game is the buyer playing?" — the basis on which the buyer will decide)*

A change in wording, confidence wobble, or a new-but-non-decisive risk is **noise** and must NOT fire. Precision on this distinction is the whole game (`topology_contradiction_hypothesis` Phase 1: *"can the system catch the correct contradiction at all?"* — measured here).

**The wolf-gate — an axis flip is not enough; the evidence must have grown.** A canonical axis can "flip" for two very different reasons: (a) genuinely new substrate appeared that changes the read, or (b) the model re-read *identical* substrate and worded it differently. Only (a) is drift. So a flip is promoted to **valid drift** only if the later thesis stands on evidence the earlier thesis could not see (`scripts/_drift/evidence-delta.ts`). This **cannot** be an `evidence_ids` set-diff: those ids (`int_001…`) are run-local pointers into each run's freshly-minted Pass 2 `intelligence[]`, so `int_004` in slice A ≠ `int_004` in slice B. The gate instead resolves each cited id to its run-STABLE content key — the verbatim `quote` + `source_ref` from the slice's Pass 3 `intelligence[]` — and asks whether the after-thesis gained any quote the before-thesis didn't stand on. Time-honesty is inherited from the slice cut (a quote in B's window but not A's is genuinely later substrate, *given* the `max_occurred_at` cutoff + replay guard). That same `quote` is what the eventual rep-facing card must show: **the wolf-gate and the evidence trail are the same primitive.** Verified on fixtures: clenera `run1→run2` (same substrate) → 0 gained → `evidence_backed:false` (wobble correctly suppressed); ws-development `calls-only→full` → 3 gained quotes via content resolution despite differing run-local ids → `evidence_backed:true`. `valid_drift = load_bearing && evidence_grew`; when no Pass 3 table is supplied the gate can't run and `evidence_backed` stays `null` (the gap is surfaced, never silently rubber-stamped).

**The compression this exposes (the real architectural result).** The evidence gate and the user-facing trust model are the *same object*. The pipeline is not `Drift Engine → Trust Gate → UI Evidence` (three things); it is one primitive — the **quote** — flowing `quote → evidence_delta → trust gate → UI evidence`. And the control flow inverts: not `axis movement → verdict`, but `detection_class → evidence_delta → axis movement → verdict`. A rep does not care that an axis moved; they care that *something new entered reality, and here is the line that proves it.* The quote is that proof. Keep this ordering — axis movement is the last gate, not the first.

**Next trust layer — `mechanism_backed` (reserved, NOT built; gated on Cipher).** Today `evidence_backed:true` means only *a new quote appeared.* It does not yet mean *the new quote justifies the claimed mechanism.* Counter-example: a quote `"we should probably include procurement"` is real evidence growth, but it does NOT by itself justify `controller changed` / `decision_frame flipped`. The quote must support the *specific* axis movement, not merely co-occur with it. The future record gains a second flag:
```
{ "evidence_backed": true,      // a new quote entered reality
  "mechanism_backed": true }    // that quote actually justifies THIS axis flip
```
**Do not build this now** — the current gate is exactly right for the Goldrich cleanup, and over-building before data is the failure mode this whole harness guards against (`reserved_not_forgotten`). **Build-gate signal:** Cipher (or any thesis_flip deal) produces a run of `new quote → flip, new quote → flip` where the quotes are real but do not license the flips. That is where the `mechanism_backed` layer earns its place; until that pattern is observed in real backtest data, `evidence_backed` is sufficient.

**`decision_frame` — promote by test, not by assumption.** The instinct is that `controller` / `stage` / `dominant_risk_class` can miss the real thesis shift — *"what game is the buyer playing?"* — which is closer to the product than a risk label. But assuming it widens the canonical view prematurely (more axes = more surface to fire = lower precision). The protocol:

1. Run the Clenera backtest with the **three** existing axes only.
2. If the decisive mechanism is caught through one of the three → keep the canonical view tight; `decision_frame` stays out.
3. If the decisive mechanism is **only** visible as a `decision_frame` shift (the three axes don't flip but the buyer's game changed) → promote it to a fourth axis, with Clenera as its anchor.

Clenera is the right test case: its mechanism (criteria named-but-undefined + stakeholder map accepted-without-validation) is frame-shaped, so if any deal forces the fourth axis, it's this one. Resolve empirically on the first backtest, not now.

### 2.3 Two detection MODES — silence first, then flip

A thesis transition is NOT just "did a canonical axis flip?" The earliest valuable Mallin behavior is not *"your belief changed"* — it is *"you now have enough evidence to form a belief, and here is the one that matters."* So a transition is classified by the `{from,to}` thesis **status** first, and only secondarily by whether an axis flipped. The `deal_thesis` discriminated union (`formed` vs `indeterminate`) already carries the status; the classifier reads it directly.

The five outcomes (`detect-drift.ts → DetectionClass`):

| class | from → to status | axis flip | meaning |
|---|---|---|---|
| **`first_formation`** *(MODE 1)* | indeterminate → formed | n/a | Mallin stayed silent on thin evidence, then formed the RIGHT thesis as soon as it sufficed. A missing→concrete *first observation*, NOT a concrete→concrete conflict. **Clenera's win lives here.** |
| **`thesis_flip`** *(MODE 2)* | formed → formed | yes (concrete→concrete) | The controlling reality changed. **Cipher's win probably lives here.** |
| `stable` | formed → formed | no | The SILENCE primitive: "thesis intact." A correct non-event, NOT a miss. |
| `still_indeterminate` | indeterminate → indeterminate | n/a | Still gathering — correct silence before there's enough to say. |
| `thesis_dissolved` | formed → indeterminate | n/a | Edge: new evidence pulled the ground from under a prior read. Rare; watch it. |

**Why MODE 1 is not a degenerate flip.** You cannot "flip" a belief you never held. `indeterminate → formed` is ALWAYS `first_formation` even if axes also move, because moving off `Unknown`/absent is a *missing observation*, not a `concrete_conflict` (it mirrors `dimensionAgrees`). `thesis_flip` therefore requires `formed` on **both** sides. This is the load-bearing distinction that keeps a first-formation from being mis-scored as a (non-existent) flip, and keeps a correct silence (`stable` / `still_indeterminate`) from being scored as a miss.

**Scoring consequence.** Recall/precision (§4) must be computed *per mode*: a `first_formation` is a catch when Mallin forms the oracle's `decisive_mechanism` thesis at or before `first_detectable_call`; a `thesis_flip` is a catch when the axis movement matches the mechanism in the `[first_detectable, resolution]` window. The two modes answer different questions ("did it form the right thesis early?" vs "did it catch the controlling reality changing?") and must not be averaged into one number.

---

## 3. The oracle (ground truth)

Per deal, one **oracle record** — NOT a substrate fixture (hygiene rule). The discipline that matters: **short, cold, auditable — five fields, not an essay.** A rich oracle becomes hindsight narrative instead of test ground truth, and quietly fits the test to the answer it already knows. Exactly five fields:

```
{
  "deal": "clenera",
  "decisive_mechanism": "<one sentence — what actually moved the outcome>",
  "first_detectable_call": "<call_id / date — earliest substrate point the evidence is present>",
  "evidence_quote": "<verbatim substrate line that makes it detectable>",
  "expected_drift_axis": "<controller | stage | dominant_risk_class | decision_frame*>",
  "expected_behavior_change": "<one line — what the rep should do differently once flagged>"
}
```

Field discipline:
- **`decisive_mechanism`** — one cold sentence. No backstory, no "and this connects to…". If it needs a paragraph, it's narrative, not ground truth.
- **`first_detectable_call`** — sourced by reading the substrate (when does the evidence *first* appear?), independent of when the outcome landed.
- **`evidence_quote`** — a *verbatim* substrate line, not a paraphrase. This is what makes the record auditable: anyone can open the fixture and confirm the quote exists at that call.
- **`expected_drift_axis`** — the canonical axis that best describes the mechanism (§2.2). This is a **diagnostic, truest-fit label, not the pass/fail key.** A catch is scored on **mechanism + timing** (§4), *not* on exact axis match — otherwise labeling a deal `decision_frame` would force recall to 0 on a 3-axis detector and "prove" the fourth axis by construction. So the 3-axis detector can still *catch* a deal whose truest-fit label is `decision_frame` (via `controller`/`risk_class`); whether it does is exactly the §2.2 test. `decision_frame` is starred because its membership in the detector is under test.
- **`expected_behavior_change`** — the rep action the catch should produce. Ties the drift to a *decision change* (the whole point), and is the bar the eventual rep-facing card must clear.

The **outcome** (`closed_won` / `closed_lost`) is deliberately **not** a field — it lives in `deal_outcomes.md` and the scorer joins to it. Keeping it out of the record removes the temptation to write the mechanism backward from the result, and removes one more leakage surface. The oracle record as a whole is scoring-side only — never on the Pass 4 input path.

---

## 4. The metric (this is a backtest)

For each deal, slice the substrate at each call boundary, run the pipeline blind, run the drift classifier between consecutive slices, then score the flagged drifts against the oracle:

- **Recall (the catch):** did the harness emit the **correct cognitive event** (§2.3) in the `[first_detectable, resolution]` window — a `first_formation` that names the `decisive_mechanism`, OR a `thesis_flip` on the mechanism? Recall is *not* "did a flip fire": a first-formation deal (Clenera) is a catch even when no flip ever fires. The scorer reports *which mode* caught it rather than prescribing one.
- **Precision (the wolf):** of all detection events the harness emitted (`first_formation` | `thesis_flip` | `thesis_dissolved`), how many were on-target vs premature (fired before `first_detectable_call`)? A premature *formation* is as much a wolf as a premature *flip*. Correct silence (`stable` / `still_indeterminate`) is never counted against precision.
- **Lead time:** how many calls *before* the contradiction became obvious (the outcome / the late forum) did the flag fire? This is the quantification of "caught something I missed" — a flag at call 4 on a deal that broke at call 8 is the product; a flag at call 8 is hindsight.
- **Stability:** run-to-run, does the same slice flag the same drift? (Reuse the within-variant noise-floor pattern from `compare-pass4`.)

Pass bar before any rep-facing build: high precision (a false "Mallin caught something" costs more trust than a missed one earns — `behavioral_dependency_signal`), with positive lead time on at least the Clenera loss and one won deal, validated cold (`topology_contradiction_hypothesis` promotion gate).

---

## 5. Architecture / components

```
substrate-full.json
   │
   ▼
[1] time-slicer ─────────► substrate ≤ call N   (filter by started_at; generalize calls-only/full)
   │                          │
   │                          ▼
   │                   [2] pipeline (existing): Pass 3 merge → Pass 4  →  PrepArtifact(N)
   │                          │
   ▼                          ▼
sequence of slices ──► [3] drift classifier  (extend compare-pass4: temporal, canonical-axis flip = load-bearing)
                              │
                              ▼
                       flagged drifts  ──► [4] oracle scorer  ──► recall / precision / lead-time / stability
                                                   ▲
                                          oracle record (memory-sourced, blind to Pass 4)
```

1. **Time-slicer** (`scripts/slice-substrate.ts`, new) — given a substrate file + a call boundary, emit the substrate as it stood then. No new substrate authored (`intake_primitive_doctrine`); pure filter over existing fixtures.
2. **Per-slice pipeline run** — existing `run-pass-4-manual.ts` (and Pass 3 merge) over each slice. Stub-by-default for plumbing, `--production` for real reads.
3. **Drift classifier** (`scripts/detect-drift.ts`, new — but lifts `compare-pass4`'s canonical view + `directional_agreement` + `state_transition`). Input: ordered `PrepArtifact[]`. Output: per-transition `{ from_call, to_call, axis_flipped, before, after, triggering_evidence }`, tagged load-bearing iff a canonical axis flipped.
4. **Oracle scorer** (`scripts/score-drift.ts`, new) — joins flagged drifts to the oracle record, emits the §4 metrics. Outcome-blind on the input side, outcome-aware on the scoring side only.

`compare-pass4.ts` is refactored so its canonical-view / directional-agreement logic is importable by the drift classifier rather than duplicated.

---

## 6. Build order (smallest first)

1. **[DONE]** **Oracle records** for the corpus (Clenera + Cipher + Goldrich first — the deals with the sharpest locked mechanisms). No code; just encode ground truth from `deal_outcomes.md` into oracle files. Forces precision on "what was the decisive contradiction, and when was it first detectable." → `scripts/_oracle/{clenera,cipher,goldrich}.oracle.json` (5-field schema) + `scripts/_oracle/outcomes.json` (scoring-side outcome map).
2. **[DONE]** **Time-slicer** — verify a slice at call N contains exactly the substrate present then, no leakage. → `scripts/slice-substrate.ts`. Neutralizes forward-looking `opportunity.{stage_label,stage_position,deal_posture,last_activity_at}` by default (Form A); `--preserve-crm-belief` for Form B; `--verify` asserts no retained event post-dates the cutoff. Verified clean on Clenera @ call_jan09.
3. **[DONE]** **Drift classifier** — extract `compare-pass4`'s canonical logic; run it on two adjacent slices of one deal; confirm it flags interpretation flips and ignores phrasing. → canonical logic extracted to `scripts/_drift/canonical.ts` (imported by both `compare-pass4.ts` and the classifier); classifier is `scripts/detect-drift.ts`. Verified: noise floor (same-substrate run1/run2) = no flip; concrete→concrete conflict = load-bearing; `CFO→Unknown` correctly treated as missing-observation, not a flip. `decision_frame` is the 4th axis, OFF by default, opt-in via `--with-decision-frame` (the §2.2 experiment). **Now classifies by detection MODE (§2.3), not just axis-flip:** `detection_class ∈ {first_formation, thesis_flip, stable, still_indeterminate, thesis_dissolved}` is the PRIMARY verdict; `load_bearing` is demoted to a sub-property of `thesis_flip`. `first_formation` (indeterminate→formed) is the Clenera-shaped capability — a correct early thesis, not a flip. **Wolf-gate wired (§2.2):** each record carries `changed_axes` (flat roll-up) + `evidence_delta` (`scripts/_drift/evidence-delta.ts`, quote-content resolution via each slice's Pass 3 `intelligence[]`, opt-in per slice as `--slice <call>=<artifact>::<pass3>`) + `valid_drift = load_bearing && evidence_grew`. Resolver unit-verified: same-substrate run1/run2 → `evidence_backed:false`; calls-only→full → 3 gained quotes despite run-local id instability → `evidence_backed:true`. End-to-end CLI smoke (ws-development) produces `thesis_flip` / `changed_axes:[stage]` / evidence BACKED / valid drift.
4. **[DONE — Clenera backtest run cold]** **Oracle scorer + first backtest** — scorer is `scripts/score-drift.ts`. It now consumes the classifier's `detection_class` (§2.3): recall = "did Mallin emit the correct cognitive event in-window" (a `first_formation` naming the mechanism OR a `thesis_flip` on it), reporting *which* mode caught it; precision = on-target / all detection events, with a premature formation counted as a wolf; silence never counts against precision. **Clenera result (5 of 6 slices — `call_mar30` blocked on API credit exhaustion, so lead-time is a lower bound):** caught via **`first_formation` at `call_jan09`**, lead time ≥3 calls, precision 2/2, **zero false positives before Jan 9** (oct27 correctly stayed `indeterminate`). The catch was the FIRST formed thesis ("parent-approval problem disguised as a product evaluation"), not a flip — so the maturity flip (stage evaluation→approval) is incidental, and **`decision_frame` earns no promotion here** (its 3 extra "flips" in the `--with-decision-frame` run are rewordings of one stable committee-gate frame = noise). This is the first evidence the harness catches the *right* drift, at the *right* time, cold.
5. **Expand to the corpus** — **Cipher next** (tests the true `thesis_flip` path: a real mid-cycle competitive/pricing shift, `formed→formed` + axis flip — distinct from Clenera's formation), then **Goldrich** (`stable` — thesis correctly intact). If Cipher catches via `thesis_flip` while Clenera stays `first_formation`, that's evidence the model captures genuinely different cognitive events. **Gated on API credit restoration.** Report precision/recall/lead-time across deals.

---

## 7. Dependencies (must exist before building)

- The Pass 1.5→4 pipeline + fixtures (exist).
- `compare-pass4.ts` canonical-view / directional-agreement logic (exists — to be extracted/importable).
- Locked decisive mechanisms in `deal_outcomes.md` (exist for Clenera/Cipher/Goldrich; thinner for in-flight deals — start with the closed corpus).
- For Form B only (later): CRM read access + the `salesforce_writeback_spec.md` Phase 2 diff.

---

## 8. What this is NOT

- **Not a UI.** No rep-facing card here. The "show the changed decision" surface is the next spec, gated on this harness clearing the precision bar.
- **Not new substrate.** Pure analysis over existing fixtures. No new `*-intelligence.ts` / `seed-*` files (`intake_primitive_doctrine`).
- **Not outcome-leaking.** Outcomes and oracle records never touch the Pass 4 input path. The model forms its thesis blind (substrate-hygiene rule).
- **Not prompt-promotion.** A pattern that backtests well is a *hypothesis*, not doctrine — promotion to prompt injection still requires cold-read validation (`topology_contradiction_hypothesis`, `pattern_log`).
- **Not a forecasting claim.** Backtest skill ≠ live predictive skill. This proves Mallin *could have* caught it; live validation on Gianna's real deal is a separate, later signal.

---

## 9. Drift signals (block at review)

- An oracle record's `outcome` or `decisive_contradiction` reachable from the Pass 4 input — leakage; invalidates the whole backtest.
- The drift classifier firing on phrasing / confidence wobble / non-decisive new risks — precision breach; the metric exists to catch this, don't suppress it.
- A new substrate fixture authored to "make the harness pass" — that's fitting the test to the answer.
- Reporting recall without precision (or vice-versa) — both, plus lead-time, or the number is misleading.
- Treating a good backtest as PMF — it's Phase 1 detection evidence, not behavioral dependency (`behavioral_dependency_signal`).
- Building the rep-facing card before the precision bar is cleared — the failure mode this whole harness exists to prevent.

---

## 10. Open questions

- **Canonical axes — three or four?** Is `decision_frame` a distinct load-bearing axis or already captured by `controller` + `dominant_risk_class`? Clenera's mechanism is frame-shaped (how criteria are defined), which argues for four. Resolve empirically on the first backtest.
- **Slice granularity.** Per-call, or per-meaningful-event (call OR email OR CRM edit)? Start per-call; revisit if drift fires between calls.
- **Precursor credit.** If the harness flags a *related* contradiction one call before the exact decisive one, is that a hit, a partial, or a miss? Define the scoring rubric in step 1, not after seeing results.
- **Form B oracle.** CRM-belief drift has no historical oracle in the corpus (fixtures are call-substrate, not CRM snapshots). Validating Form B needs a deal present in both Mallin's DB and a CRM — same dependency as `salesforce_writeback_spec.md`. Defer until Form A is proven.

---

## 11. Precision-bar finding — 2026-06-05 (the harness has NOT cleared precision)

**Verdict: the drift harness still cries wolf on a clean, uncontaminated test. It is NOT ready to gate downstream builds.** This is the most important result to date — it's the harness failing its own §4 precision bar, caught by the same provable-or-silent skepticism the harness exists to enforce.

**Setup (clean-room).** To eliminate the cross-deal substrate contamination found earlier (a Stockbridge call leaking into Goldrich's shared-tenant slice), Goldrich was seeded **alone into a fresh isolated tenant** — nothing else present to leak. Replay guard active. Two slices chosen to bracket *real* new substrate: **A = `--as-of 2025-06-12`** (1 call, discovery) → **B = `--as-of 2025-09-13`** (6 calls: CFO demo, value engineering, value survey, value report, demo). Goal: a trustworthy `stable` or `valid_drift` datapoint.

**What the harness reported:** `THESIS-FLIP`, `stage: approval → execution`, evidence **BACKED** (7 new quotes), **valid drift**.

**Why that is a FALSE POSITIVE:**
1. **`canonicalStage` matched a keyword, not a reality.** B was labeled `execution` because the regex hit **"go-live"** — in a *future-tense* sentence (top_line: *"advancing… toward a 2026 treasury management system go-live"*). No contract is signed by Sep-13 (pricing is Oct, SoW Nov). The deal is mid-evaluation. The classifier has no tense/actuality awareness.
2. **The evidence gate rubber-stamped it.** `evidence_grew` is **trivially true** (B has 5 more calls → 7 new thesis quotes), so `evidence_backed:true`. But those quotes discuss a demo and a *future* go-live — they do **not** justify "the deal entered execution." This is the **`mechanism_backed` gap (§2.2)** demonstrated live: *evidence appeared ≠ evidence licenses this flip.*
3. **Run-to-run non-determinism.** A second run of the *same* isolated pair flagged a **different** axis (`risk_class: stakeholder→economic`); the same slice A classified as `stakeholder` risk in one run and `economic` in another. The canonical axes are not stable run-to-run.

**What IS solid:** the *deep thesis* is stable across both runs and both slices (knowledge-transfer / John Schwendig's retirement is the gate; continuity over capability; `low→low` confidence). The fragility is entirely in the **coarse canonical buckets** (`canonicalStage`, `classifyRisk` regexes), not the reasoning. And the one genuinely real development — **CFO Angel entered at the Jul-30 demo** (`controller Unknown→CFO`) — was correctly treated as a *missing-observation, not a flip*. The harness flagged the bogus axis and correctly de-emphasized the real one.

**Scorecard:**

| | Status |
|---|---|
| Substrate-leak wolf cry (contamination) | ✅ Fixed — replay guard + single-deal isolation |
| Classifier-artifact wolf cry (regex bucketing) | ❌ Still present |
| Evidence gate stops leak-flips | ✅ Yes |
| Evidence gate stops classifier-flips | ❌ No — needs `mechanism_backed` |
| Canonical-axis stability run-to-run | ❌ Unproven (flips differ across runs) |

**Two fixes stand between here and a trustworthy datapoint:**
1. **`canonicalStage` / `classifyRisk` robustness** — actuality/tense awareness, not keyword incidence. "go-live" in a future-tense target sentence must not classify as `execution`.
2. **`mechanism_backed` gate** — the reserved layer (§2.2 / `approval-outcome-loop.md`): does the new evidence justify *this specific* flip, not merely exist.

**Consequence for the gates:** the rep-facing drift card and the approval→outcome loop are gated on this harness clearing precision. **It has not.** Both correctly remain gated. This finding is the gate doing its job. Evidence: `scripts/_drift/runs/goldrich-iso-gated-drift.json`.

### 11.1 Fix #1 landed — `canonicalStage` actuality guard (same day)

`canonicalStage` execution detection was split into **HARD** markers (actual close/post-close events — unconditional) and **SOFT** markers (`go-live`/`deployed`/`kickoff` — execution-phase words spoken in pre-close demos) that count **only when not future-framed** in their local window (`hasActualExecution`). Result, re-classifying the **cached** isolated artifacts (no new LLM):

- B's stage: `execution` → **`approval`** (the "2026 go-live" future target no longer fires execution).
- **iso A→B now classifies `stable`** (`controller Unknown→CFO` missing-observation; `stage approval→approval`; `risk economic→economic`) — the trustworthy *"learned more, understanding didn't change"* datapoint.
- **Regression-safe:** ws-development `calls-only→full` still flips `approval→execution` (real Docusign-sent = HARD marker preserved).

**Still open before the harness clears precision (do NOT un-gate yet):**
1. **`classifyRisk` bucketing fragility** — run 1 flagged `risk_class: stakeholder→economic` on semantically-similar stakeholder-access risks; same fix philosophy (don't bucket on keyword incidence) needed.
2. **Run-to-run axis stability** — the same slice classified differently across two Pass 2/4 runs. Needs a stability harness (N runs, report axis variance) before any flip is trusted.
3. **`mechanism_backed` gate** — the evidence gate still confirms growth, not that growth licenses the flip. Reserved (§2.2 / `approval-outcome-loop.md`).

One of three precision fixes is in. The harness is closer, not cleared.

### 11.2 Stability finding — the canonical axes are stochastic (the real blocker)

The new stability harness (`scripts/drift-stability.ts`) assembles a slice once, then runs Pass 2→3→4→`canonicalize` **N times** and reports per-axis variance. Run on the isolated Goldrich **Sep-13** slice, **N=5** (`scripts/_drift/runs/goldrich-iso-stability-sep13.json`):

| Axis | Distribution across 5 runs | Stable? |
|---|---|---|
| `thesis_status` | `formed × 5` | ✅ |
| `controller` | `Unknown × 3, CFO × 2` | ❌ |
| `stage` | `approval × 4, execution × 1` | ❌ |
| `dominant_risk_class` | `unknown × 3, economic × 2` | ❌ |

**Three of four axes are unstable on byte-identical substrate.** `stage` hit `execution` once even *with* the §11.1 actuality guard — because a different Pass 4 run *phrased* the deal in a way that tripped a hard marker. The instability is not (only) regex weakness; the regex **inherits the run-to-run variance of stochastic LLM prose**, and coarse bucketing amplifies it.

**This is the real precision blocker, and it reframes the others:**
- **A single drift verdict is not trustworthy, full stop.** Run `detect-drift` once and "stage flipped to execution" is a 1-in-5 fluke; run it again and it's `approval`. Fixing individual classifiers (§11.1) raises the modal fraction but does not make one shot reliable.
- **What IS robust is the structured layer.** `thesis_status` (the `deal_thesis` discriminated union) is rock-stable, and the *thesis prose* was consistent across runs. The judgment is stable; the **coarse buckets derived by regex over free-text are not.**

**Two paths to trustworthy axes (both real work; pick by cost/precision):**
1. **Consensus classification** — run each slice N times, take the **modal** axis value; only flag drift when the change is stable across runs on *both* slices. Robust, simple, but N× the cost per verdict.
2. **Structured axis extraction** — derive `controller` / `stage` / `risk` from **structured artifact fields** (stakeholder roles, posture enum, risk severities) instead of regex over `thesis`/`top_line` prose, so the axes stop inheriting prose variance. Cheaper at run time; more engineering; the durable fix.

**Revised precision scorecard:**

| Fix | Status |
|---|---|
| `canonicalStage` future-go-live (§11.1) | ✅ Modal fraction up; not sufficient alone |
| `classifyRisk` bucketing | ❌ Open |
| **Axis stability run-to-run** | ❌ **The blocker — 3/4 axes stochastic** |
| `mechanism_backed` gate | ❌ Reserved |

**Do not un-gate the drift card or the approval→outcome loop.** The stability harness just proved single-shot canonical drift is unreliable; trustworthy drift requires consensus or structured extraction first. The thesis layer is solid — which is why `first_formation` (status-based, stable) is a safer first capability to surface than `thesis_flip` (axis-based, currently stochastic).

### 11.3 Mode-1 corpus sweep — first_formation generalizes (with one sharp caveat)

`formation-arc.ts` walked each deal's early cutoffs in an isolated single-deal tenant. Evidence: `scripts/_drift/runs/{clenera,cipher,ws}-formation-arc.json`.

| Deal | Silent @1 call? | Forms @ | Thesis quality at formation |
|---|---|---|---|
| **Clenera** | ✅ silent | 2 calls (= oracle `first_detectable`) | Right family (stakeholder topology) — missed exact mechanism (Enlight parent / undefined criteria) |
| **Cipher** | ✅ silent | 2 calls (*before* oracle's Nov-14) | Coherent but asserted *"operational urgency, not feature comparison"* — opposite of the eventual decisive competitive eval |
| **WS** | ❌ formed@1 | 1 call (rich first call) | Strong + specific — named a vendor-vs-competitor race, the CFO, and the implementation-partnership differentiator |
| **CCR** | — | n/a | INVALID — 2024 deal, cutoffs fell outside the `lookback_days:365`-from-now window → `0 calls` assembled (silent failure mode, see below) |

**Two findings, both load-bearing:**

1. **The silence→form transition is reliable AND evidence-responsive — not a mechanical call count.** Clenera/Cipher stayed silent on a thin first call and formed on the second; WS formed immediately because its *first* call was rich (clear two-horse race + named CFO + specific requirement). That is the *correct* provable-or-silent behavior: form when evidence suffices, not after N calls. This **generalizes** — first_formation is trustworthy as a capability.

2. **The formed thesis captures the deal's state AT FORMATION, not necessarily the DECISIVE mechanism** — because the decisive mechanism is often not detectable yet. WS (rich early) nailed it; Clenera got the right family but not the specifics; Cipher formed a confident early read that *downplayed* the factor (competitive eval) that later decided the deal. **Therefore Mode 1 and Mode 2 are complements, not substitutes:** first_formation gives the early thesis; drift (Mode 2) is what catches the decisive mechanism *superseding* it later (Cipher: operational-urgency → competitive/technical). Surfacing first_formation must frame it as *"the thesis the evidence supports now,"* never *"what decides this deal."*

**New bug — silent lookback failure (block at review, §9).** A slice whose `lookback_days` window excludes its own cutoff's substrate returns `0 calls → indeterminate` — indistinguishable from correct silence. CCR (a 2024 deal) hit this. The assembler/arc must **fail loudly** when the assembled substrate is empty for a cutoff that should have calls (or anchor lookback to the cutoff, not to now). `formation-arc` logs the call count, which surfaced it — but a naive read would miss it.

**Net:** Mode 1 (first_formation) is validated as a generalizing, trustworthy-today capability across 3 deals — ship it as *"here's the thesis the evidence now supports,"* paired with (gated) drift for the supersession case. Mode 2 (thesis_flip) remains gated on axis stability (§11.2).

### 11.4 Fix #2 landed — structured controller extraction (axis stability, validated)

The §11.2 blocker is axis stochasticity. First lever, validated: derive `controller` from the **structured `stakeholder_strategy[]`** (each stakeholder's `role` title, weighted by `current_state.influence_level` + `priority`) instead of regexing the stochastic thesis prose. `canonicalControllerStructured()` in `scripts/_drift/canonical.ts`.

**A/B on N=5 Goldrich Sep-13 artifacts** (`drift-stability.ts --save-artifacts` now dumps each run's artifact so extractors iterate offline for free; compared via `scripts/_drift/_compare-controller.ts`):

| Method | Distribution | Verdict |
|---|---|---|
| **Prose** (`canonicalController`) | `CFO ×3, Unknown ×1` | ❌ UNSTABLE |
| **Structured** (`canonicalControllerStructured`) | `CFO ×4` | ✅ STABLE |

Discriminating case = run-3: the thesis narrative didn't name the CFO (prose → `Unknown`), but the structured extractor read Angel Herrera's `role: "Chief Financial Officer", influence: high` and held `CFO`. **The stakeholder list is grounded in substrate; the narrative is not.** Confirms the §11.2 thesis (judgment stable, prose-derived buckets not) and the durable-fix path (structured extraction over prose regex).

**Remaining for axis stability:** `stage` has **no** structured field (`top_line.posture` is momentum — `advancing|stalled|at_risk|indeterminate` — not maturity), so it needs consensus or a different signal; `dominant_risk_class` has `severity` but no structured category. Controller is the first axis moved from prose to structured; stage and risk are next, and `stage` may force the consensus path.
