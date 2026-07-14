---
title: "The half-life of a CRM field"
date: "2026-06-29"
excerpt: "Every field in your CRM is decaying. The question isn't whether your AI can write to the CRM — it's whether it knows which fields are already lies, and which ones it has no business touching."
author: "Mallín"
---
Open any enterprise CRM and pick a deal that closed last quarter. Look at Next Step, Decision Criteria, Economic Buyer, and Close Date as they stood ninety days before close. Most were wrong by close. A meaningful share were wrong the day they were entered.

This is the substrate any revenue AI writes into. Not a clean schema. A ledger of stale judgments, optimistic forecasts, and copy-pasted MEDDIC fields a rep filled in on a Friday because the manager's dashboard demanded it.

If you want AI to write back to the CRM — and you should, because the alternative is letting a shadow system of record grow next to it — then you have to take seriously that **every field has a half-life**, and most tooling treats the CRM as a database of facts rather than a ledger of decaying claims.

## Fields decay at very different rates

Account name decays slowly. Industry decays slowly. Contact title decays in months. Next Step decays in days. Champion decays the moment your champion gets a new boss. Close Date decays every time procurement adds a step nobody told the rep about.

A serious operating layer models this as a primitive, not a feature. When the system reads the CRM to form a brief, it cannot treat a Next Step entered eleven days ago the same as one entered after yesterday's call. When it considers writing back, it cannot overwrite a human-entered Economic Buyer with the same confidence it uses to log a meeting attendee.

The naive version of write-back — the version most "AI for sales" demos show — flattens all of this. The model extracts entities from a transcript and shoves them into fields. Sometimes it's right. Sometimes it overwrites a rep's hard-won judgment with a hallucinated title from a misheard intro. The rep loses trust once, and the write-back channel is dead forever.

## What "governed" actually has to mean

"Governed write-back" is thrown around as if it means the admin picked which fields the AI can touch. That's the floor. The ceiling is a system that reasons about each field on three axes before it writes: the decay rate of the field, the confidence of the new claim, and the cost of being wrong versus the cost of leaving it stale.

Meeting logged from calendar plus transcript: high confidence, low cost of error, write it. Contact role inferred from one Slack mention: medium confidence, medium cost, propose it to the rep, don't write it. Economic Buyer change inferred from a passing comment on a call: high cost of error, never auto-write, surface it as a question in the next brief.

The **never-auto fields** are the trust primitive. Every customer should be able to point at a list and say: the AI will never silently change these. It can propose. It can flag. It cannot write. The instant a system can't tell you which fields those are for your org, it isn't governed — it's just polite.

## The brief is where decay gets priced in

The pre-call brief is where this work pays off, because the brief is where stale CRM data does the most damage. A rep walks into a call holding a Next Step from three weeks ago, a Close Date set before the buyer's reorg, and a Decision Criteria field copy-pasted from the original discovery template.

A brief that summarizes the CRM launders those lies into something that looks like ground truth. A brief that prices decay does the opposite: *the Next Step on file is eighteen days old and the last two emails contradict it; the Close Date predates the buyer-side reorg announced on LinkedIn; the Decision Criteria field has not been touched since qualification and the champion has since named two new criteria in writing.*

That is not a summary. That is the rep being told, before the call, which parts of their own record to stop trusting.

The contradiction work — the one fact in the deal that breaks the rep's current plan — depends entirely on this. You cannot detect a contradiction against a record you're treating as true. You have to treat the record as a set of claims, each with an age and a source, and check them against the freshest evidence in calls, email, and Slack.

## Institutional memory is the inverse problem

Some fields decay slowly and are wildly undervalued: the reason a deal stalled two years ago, the procurement quirk at a specific F500, the fact that this buyer's CFO hates three-year terms. Reps leave. Managers rotate. That knowledge usually dies in a Slack thread or a closed-lost note nobody reads.

An operating layer that takes field decay seriously also takes field *persistence* seriously. The structured judgment a rep formed on a deal two years ago — written into the right fields, attached to the right account — should still be there when a new rep picks up the logo. That's the moat most teams don't realize they're building, or losing, every quarter.

Writing to the CRM is not the hard part. Knowing what each field is worth on the day you write it — and on the day someone else reads it — is the whole job.
