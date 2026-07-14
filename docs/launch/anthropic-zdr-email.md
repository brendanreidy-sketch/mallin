# Anthropic Zero Data Retention (ZDR) request

*Copy-paste ready. Send from Brendan's primary email to `privacy@anthropic.com` (cc the account team if known).*

---

**To:** privacy@anthropic.com
**Subject:** Zero Data Retention request — pre-launch enterprise SaaS (sales execution platform)

Hi Anthropic team,

I'm building a B2B sales execution platform (working name: Execute.ai) that will use the Anthropic API to process customer-derived data — call transcripts, email threads, CRM records, sales-stakeholder profiles. We're pre-launch and currently testing with a single design partner against synthetic and personal-deal data, but real customer data is imminent (first design partner expected within 60–90 days).

Before we connect any production customer data to the API, I want to formally request **Zero Data Retention** on our Anthropic account. Specifically:

- All API requests (Messages API, including streaming and tool use) processed without retention beyond the request lifecycle
- No human review, no model training use, no log retention beyond what's required for abuse / billing / safety
- Effective immediately (or as soon as you can enable it on the account)

A few specific questions to confirm:

1. Is ZDR available on our current account tier, or does it require an enterprise contract / commitment?
2. What's the standard process — is it a console-level toggle, an addendum to the terms, or an account-level configuration on your side?
3. Once enabled, is there an audit-trail or attestation we can reference when our own customers ask (this will come up in their security reviews)?
4. Does ZDR cover all model variants we'd use (Sonnet, Haiku, Opus), or do we need separate confirmation per model?

Happy to sign whatever DPA / addendum is required. The sooner this is in place, the cleaner our customer-facing security posture is when we begin the design-partner data-use conversations.

Account email on file: **[YOUR ANTHROPIC ACCOUNT EMAIL]**
Org name on file: **[YOUR ORG NAME, IF SET]**

Thanks,
Brendan Reidy
[email] · [phone if you want to include]
Execute.ai (working name)

---

## Notes before sending

- Replace the two bracketed placeholders.
- If you have an account team or solutions engineer assigned (typical for Anthropic enterprise accounts), CC them — the request moves faster through that channel than the privacy alias alone.
- If you don't have an enterprise relationship yet, send to `privacy@anthropic.com` as the primary contact. They'll triage to the right team.
- Save the response thread — when a design partner's security team asks "do you have ZDR with Anthropic?", you reference this thread.

## Why we're doing this now (for your own reference)

The plan (page 23) lists *"Anthropic Zero Data Retention requested before any real customer data is processed"* under the data-and-security posture decisions. This email is the executable form of that line. It's a 15-minute task that removes a future blocker — by the time a design partner asks for proof of data-handling, the answer is *"already in place,"* not *"let me request it."*
