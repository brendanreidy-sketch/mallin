---
title: "AI has a cost of goods"
date: "2026-07-13"
excerpt: "Everyone says the winners will build the most efficient AI. I think that's backwards. The moat isn't being cheapest to run — it's knowing, to the dollar, what every action costs, and pricing to the value."
author: "Mallín"
---

I spent an hour last week on the least glamorous work there is: figuring out what our own product actually costs to run for one customer, for one month. I'd been putting it off. Most founders do — the number feels "roughly fine," the pricing page is already live, there are louder fires.

It was the most clarifying hour of the month. Not because the number was scary. Because of what it exposed about a claim everyone in AI repeats, and I think has backwards: that the winners will be whoever builds the most *efficient* AI.

## Software forgot it had a cost of goods

For fifteen years, software's defining trait was that the second customer was free. Once you'd built it, serving one more user cost a rounding error — a little bandwidth, a row in a database. Marginal cost was basically zero, so "unlimited" cost nothing to promise. You priced on access, not usage, because usage never showed up on your bill.

AI breaks that. Every time the product does real work — reads the call, drafts the follow-up, researches the account before the meeting — it makes model calls, and each has a published, [per-token price](https://www.anthropic.com/pricing). Run a whole task and it's real money, every time. [Bessemer pegs AI gross margins at 50–60%, against 80–90% for classic SaaS](https://www.bvp.com/atlas/the-ai-pricing-and-monetization-playbook), because — their words — "every AI query incurs a non-trivial expense." Their three-word summary of the shift: *COGS matter again.*

So far, so widely agreed. Here's where I part ways with the crowd.

## "Build the most efficient AI" is the wrong lesson

Efficiency is a floor, not a moat — and it's a floor that keeps dropping on its own, because model prices fall year after year. Optimize to be the cheapest to run *today* and you've tuned a number that was going to fall anyway, while teaching your customers to expect a cheap product.

And efficiency doesn't fix the trap sitting underneath. In old SaaS, your heaviest users were your best users — high engagement, near-zero cost, beautiful margin. Priced the same way in AI, your heaviest, most-dependent users are the ones quietly losing you money. You can win the efficiency game outright and still lose the company, because you've turned your best customers into your worst accounts.

The lesson isn't "spend less." It's two other things.

## Know the number. Then price to the value.

**Know it** — the real cost, per action, per account, not an estimate. It's genuinely startling how many AI companies can't tell you what a customer cost them to serve last month without grepping logs. (We spent this week wiring ours up. It should've been there from the start.) [a16z has watched AI companies burn more than 80% of the capital they raise](https://a16z.com/navigating-the-high-cost-of-ai-compute/) on compute — you cannot fly that blind and expect to land.

**Then price to the value, not the tokens.** The cost of a model call and the value of what it produces aren't the same order of magnitude, and they shouldn't set the same number. A tool that wins a rep one more deal a year is worth a slice of quota, not a markup on inference. Anchor to the outcome and the per-action cost goes back to being what it is — a cost of goods you manage, not the thing you sell.

## Costs fall, value compounds

This is the part that flips efficiency on its head. Inference gets cheaper every year; the value of a won deal does not. Price to the outcome and *hold*, and your margin widens on its own as model costs drop — deflation working in your favor while you sleep. The founders racing each other to the cheapest price are handing that gift away, and training a generation of customers to expect it.

There's a quieter advantage hiding in the cost itself, too. A product that takes real money to serve *and* delivers real value is hard for a free clone to copy, because the clone has to pay to serve it as well. Unpriced COGS is a threat. Priced COGS is a wall.

## Why this is a governance point, not a spreadsheet one

We call Mallín a governed operating layer. Usually "governed" means what the AI is allowed to touch in the CRM — which fields it can draft, who gets looped in when a deal slips, what it can never write on its own. But governance that stops at the customer's data and shrugs at the cost of the machine is half a principle. Something that acts on your behalf has to be accountable for what it spends doing it. A system that can't see its own cost of goods can't be trusted to act at scale — for the same reason one that can't tell which CRM field is already a lie can't be trusted to write to it. One discipline, two directions.

The winners won't be the cheapest to run. They'll be the ones who know, to the dollar, what every action costs — and have convinced customers it's worth paying for the outcome, not the tokens. Efficiency is the floor. Knowing your number is the discipline. Pricing to value is the moat.

Software could forget its cost of goods because it barely had one. AI can't. The meter's running whether you look at it or not. The winners are just the ones who look.
