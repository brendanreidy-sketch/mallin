# Approval → outcome loop — making "it gets better over time" true

**Status:** design doc · contract only · NOT implemented · **build-gated on the drift harness clearing its precision bar**
**Last updated:** 2026-06-05
**Companion memory:** `approval_emotional_contract.md`, `cockpit_as_operating_environment.md`, `behavioral_dependency_signal.md`, `dependency_mechanism_doctrine.md`, `reserved_not_forgotten.md`, `type_level_ux_guards.md`, `recommendation_sequence.md`, `pattern_log.md`
**Builds on:** the drift-detection harness (`docs/drift-detection-harness.md`, `scripts/_drift/{canonical,evidence-delta}.ts`, `scripts/detect-drift.ts`), the `PrepArtifact` contract (`lib/contracts/execution-agent-output`), and the Approve gesture / Primary Decision Focus already shipped.

> **The question this answers:** *Is Mallin actually right — and does it get more right the more you use it?* Today that claim is a half-truth: "more substrate → richer brief" is context accumulation (a lift raw Claude also gets), NOT learning. This loop is the change that turns it into a measured, falsifiable, raw-Claude-can't-do-this property.
>
> **What it is NOT:** model fine-tuning, auto-write, or a dopamine/streak mechanic. The model never changes. See §8.
>
> **Success test:** *Wire Approve → an immutable recommendation ledger. When the next call lands, the drift engine (re-aimed) reports whether the committed move was ACTED and whether the targeted risk RESOLVED — with a quoted line on both sides. Then: does `worked-rate` rise as the corpus grows? If it doesn't move, the "gets better over time" claim is false and we now know it.*

---

## 1. The reframe — accountability first, calibration second, learning never (in the ML sense)

"Gets better over time" hides two different loops. Only the first is buildable now, and it is the prerequisite for the second.

1. **Measurement loop** — close the loop enough to *know if Mallin was right*. Cheap. Build-first. Already delivers the accountable half of `approval_emotional_contract` ("you approved this — here's what happened"), instead of "I clicked an AI button."
2. **Calibration loop** — feed that signal back to change future recommendations. Expensive. Gated. **Retrieval over our own outcome corpus, never fine-tuning** (§8).

You cannot have #2 without #1. Today neither exists — which is why "the more you use it, the smarter it gets" is not true yet. The honest current sentence is *"the more substrate you give it, the more it has to reason over."*

---

## 2. The loop — four states

```
RECOMMENDED → COMMITTED (approved) → ACTED (move taken) → RESOLVED (outcome observed)
```

- **RECOMMENDED** — a `deal_thesis`, `critical_risk`, or `forcing_move` in a `PrepArtifact`. Already exists; ephemeral (re-minted every regeneration — see §3 on why that forces a snapshot).
- **COMMITTED** — the rep clicks Approve. We snapshot the recommendation into an immutable ledger row. This is the audit ledger `type_level_ux_guards` already calls for.
- **ACTED** — did the rep actually take the named move? Inferred from later substrate (the move appears in a subsequent call/email) or rep-marked.
- **RESOLVED** — did it work? The targeted risk/axis moved in the intended direction, evidence-backed — or didn't.

---

## 3. The data model — two append-only tables

Recommendations are **run-local and ephemeral**: Pass 2 re-mints `intelligence[]` (and thus evidence ids and recommendation text) fresh every regeneration. The same instability that forced the drift harness to key on quote-content rather than `int_` ids (`docs/drift-detection-harness.md` §2.2) forces this loop to **snapshot the recommendation at commit time**. A recommendation you can't pin can't be tracked.

**`recommendation_ledger`** — written once, on Approve. Immutable (`readonly` types):
```
id                      stable, minted at commit (NOT the artifact's run-local id)
opportunity_id, tenant_id
recommendation_kind     'thesis' | 'risk' | 'forcing_move'
recommendation_text     verbatim snapshot (what the rep agreed to)
intended_effect         structured: { axis?, target_risk?, stakeholder?, expected_direction }
deal_state_snapshot     canonical view at commit (controller / stage / dominant_risk_class + thesis)
committed_at
approved_by_user_id     NON-NULL — type-level guard (no approval without an accountable user)
source_artifact_id
```

**`recommendation_outcome`** — appended when later substrate lands (0..n per ledger row, the loop can re-observe):
```
ledger_id
observed_at, observed_from_call
acted                   boolean | null
acted_evidence_quote    verbatim substrate line proving the move happened
effect                  'advanced' | 'resolved' | 'no_change' | 'regressed' | null
effect_evidence_quote   verbatim line proving the effect
evaluator               'auto' | 'rep_marked'
```

Both tables are scoring/audit-side, append-only. The ledger is never mutated — re-evaluation appends a new `recommendation_outcome`, it never edits the prior one (immutability = the integrity-preserving friction of `type_level_ux_guards`).

---

## 4. The evaluator IS the drift engine (the load-bearing reuse)

This is the whole reason the loop is cheap: **the evaluator already exists.** It is `detect-drift` with its lens narrowed from "did *anything* change" to "did *this committed move* land." When the next call lands, for each open ledger row:

1. **Did the action happen? (ACTED)** Resolve the `forcing_move`'s named target + verb against the new substrate's quotes — this is `scripts/_drift/evidence-delta.ts` exactly. *"Email Eric the bank-churn answer"* → search new substrate for Eric + bank-churn → `acted = true` + the quote. No new substrate mentioning it → `acted = false` (silence is honest, not a miss).
2. **Did it work? (RESOLVED)** Run `canonical.ts` `dimensionAgrees` on the *targeted* axis from `intended_effect`. If the targeted risk is no longer load-bearing in the new slice and the move is **evidence-backed** (the wolf-gate from harness §2.2 — new substrate grew, not model wobble) → `resolved` / `advanced`. Unchanged → `no_change`. Worse → `regressed`.

The same `quote` that proves the outcome is the receipt the rep sees. **The wolf-gate, the evidence trail, and now the outcome ledger are one primitive** — the verbatim quote, resolved through Pass 3 `intelligence[]` (drift-harness §2.2).

---

## 5. The metric — what becomes measurable and falsifiable

Per rep, per deal, across the corpus:

- **acted-rate** — of committed recommendations, how many did the rep actually take? (a trust/dependency signal — `behavioral_dependency_signal`)
- **worked-rate** — of acted recommendations, how many produced the intended effect? (the first real measure of whether Mallin is *right*)
- **calibration drift** — does `worked-rate` rise as the corpus grows? **This is the falsification of "gets better over time."** If it's flat, the claim is false — and we know it instead of asserting it.

A false `resolved` costs more than no measurement (it tells the rep a move worked when it didn't — the inverse of crying wolf). So the evaluator's precision bar is the harness's precision bar (§7).

---

## 6. Architecture / components

```
PrepArtifact (recommendation)
   │  rep clicks Approve
   ▼
[1] recommendation_ledger  (immutable snapshot at commit; approved_by NON-NULL)
   │
   │  next call lands → new substrate slice
   ▼
[2] outcome evaluator  =  detect-drift, re-aimed
        ├─ ACTED?    evidence-delta resolver over new substrate quotes
        └─ RESOLVED? canonical-axis diff on intended_effect (+ wolf-gate)
   │
   ▼
[3] recommendation_outcome  (append-only)
   │
   ▼
[4] metric: acted-rate / worked-rate / calibration-drift  (per rep, per deal)
   ┊
   ┊  (GATED, later) labeled (recommendation, context, outcome) corpus
   ▼
[5] calibration via RETRIEVAL — "moves like this, on deals like this, worked"
       (RAG over our own outcomes; NEVER fine-tuning; promotion-gated like pattern_log)
```

1. **Ledger write** — on Approve. New table; the audit primitive.
2. **Outcome evaluator** — reuse `detect-drift` / `_drift/*`. ~No new reasoning code.
3. **Outcome write** — append-only.
4. **Metric** — read-side rollup.
5. **Calibration** — deferred; see §8.

---

## 7. Build order + the gate

**The loop is downstream of the drift harness, two ways:**
- **Mechanically** — the evaluator *is* the drift engine. Building the loop before the engine is trustworthy is building on sand.
- **Trust-wise** — you cannot measure "did it work" with an evaluator that cries wolf. A false `resolved` is worse than no measurement.

So: **gated on the drift harness clearing its precision bar** (`docs/drift-detection-harness.md` step 4 — Goldrich Run B and the corpus backtest: does it stay silent when it should?).

1. **[gate]** Drift harness proves precision (stable-despite-evidence on Goldrich; positive lead time on a real catch).
2. **`recommendation_ledger` (immutable snapshot on Approve).** Cheap, on-doctrine — it's the audit ledger regardless. Safe to build first; do NOT surface it to the rep yet.
3. **Auto-`acted` via evidence-delta.** Near-free; the resolver exists.
4. **Thesis-level `effect` via the drift classifier** (advanced / held / died). Per-recommendation effect calibration comes later.
5. **Metric rollup.** acted-rate / worked-rate per rep.
6. **[separately gated] Calibration retrieval (§8).**

**Adoption gate before any of this reaches the rep's face** (`approval_emotional_contract`, `reserved_not_forgotten`): a rep approves a recommendation AND asks *"did that do anything?"*, OR ≥2 reps look for the follow-through elsewhere. **Watch Gianna's first session.** Build the ledger before the signal if you like (it's just a snapshot); do not wire the visible loop before it.

---

## 8. What this is NOT

- **Not fine-tuning.** The model and prompts stay frozen. The calibration layer (step 6) is **retrieval over our own outcome corpus** — surface "on deals like this, a move like this worked / didn't" at generation time. Promotion-gated exactly like `pattern_log` (≥3 confirmations + cold-read) before any outcome shapes a recommendation.
- **Not auto-write / auto-act.** Outcomes inform; they never move a never-auto field (Stage / Amount / Close Date / Forecast — `salesforce_writeback_spec`). The loop observes; it does not execute.
- **Not a dopamine mechanic.** It attaches to *"was I right"* and compound memory — not streaks, badges, or variable reward (`dependency_mechanism_doctrine` — variable reward kills trust).
- **Not a new reasoning system.** It is a ledger + a re-aim of the drift engine. If a proposed component adds a second reasoning path, it has drifted out of scope.

---

## 9. Drift signals (block at review)

- The ledger being **mutated** instead of appended — breaks the audit guarantee; the immutability IS the feature.
- A `resolved` outcome written **without an `effect_evidence_quote`** — that's the evaluator crying wolf on outcomes; the verbatim line is what makes it auditable (mirrors the harness evidence floor).
- Tracking recommendations by the artifact's **run-local id** instead of a committed snapshot — same `int_` instability the harness already solved; it will silently mis-join across regenerations.
- Wiring the **visible** loop before the adoption signal fires — premature, the `approval_emotional_contract` failure mode ("I clicked an AI button").
- Building the **auto-evaluator before the drift harness clears precision** — measuring outcomes with a wolf-crier.
- Any outcome data flowing into a **fine-tune** or auto-mutating a recommendation without the `pattern_log`-style promotion gate.
- Framing the loop as **streaks / gamification** — it earns dependency through correctness and memory, not dopamine.

---

## 10. Open questions

- **Action attribution confidence.** Substrate-inferred `acted` (a later call mentions the move) vs rep-marked. Where's the precision floor before auto-`acted` is trustworthy? Likely needs the same evidence-quote discipline as drift.
- **Outcome window.** How many calls after commit do we keep evaluating? A move can resolve 1 call later or 3. Start: evaluate on every new slice until the targeted risk leaves the canonical view or the deal closes.
- **Recommendation-level vs thesis-level effect.** MVP measures thesis-level movement (cheap, reuses the classifier). Per-recommendation effect (did *this specific* move resolve *this specific* risk) is sharper but needs the axis→recommendation mapping made explicit in `intended_effect`. Promote by test, not assumption.
- **Cross-deal calibration shape.** When step 6 arrives: retrieval keyed on what? (canonical deal-state + risk-class + move-kind). Same "promote by test" discipline as the harness's 4th axis.
