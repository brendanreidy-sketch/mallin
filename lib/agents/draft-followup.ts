/**
 * ============================================================================
 *  Draft follow-up email — generates a customer-voice follow-up email
 *  from the deal's substrate.
 *
 *  CRITICAL ARCHITECTURE NOTE (May 16 2026):
 *
 *  The previous version of this file was a deterministic string-concatenator
 *  that took the rep-coaching content from `artifact.talk_track.opening_angle`
 *  and `artifact.talk_track.key_questions[0]` and prepended English connectors
 *  to it. The result was an email that read like internal prep notes pasted
 *  into Gmail — phrases like "I'd open the demo with..." and "that gets you
 *  competitive intel" leaked from rep-cognition into customer-facing text.
 *
 *  Gianna's reaction: "this email is freaking horrible." Correctly identified
 *  as a trust-integrity failure, not a polish issue. See `one_substrate_many_outputs.md`
 *  in memory for the doctrine: the substrate is shared across artifacts, but
 *  each artifact type has a different rhetorical contract. There is no single
 *  voice that renders correctly into every surface.
 *
 *  This rewrite enforces the boundary:
 *    1. The Pass 4 substrate (talk_track, critical_risks, etc.) is treated
 *       as INTENT, not as output text.
 *    2. An LLM transform takes the intent + the deal context and produces a
 *       customer-voice email body, written as the rep would write it to the
 *       customer — never as rep-coaching prose.
 *    3. A leakage validator scans the generated body for internal-cognition
 *       markers ("I'd open with", "that gets you", "shows you were listening",
 *       "the goal is", etc.) and retries (up to MAX_ATTEMPTS) if any are
 *       present. If retries exhaust, the function returns a low-confidence
 *       fallback rather than ship leaked content.
 *
 *  This is artifact-specific voice governance — the architectural correction
 *  the doctrine pointed at. Same substrate, different rhetorical obligation.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";

/**
 * Structural input type — accepts both DraftSubstrate (DB path) and
 * Substrate (JSON-fixture path) without coupling to either. The
 * generator reads only these fields.
 */
export interface DraftSubstrate {
  opportunity?: {
    id?: string;
    name?: string;
    deal_posture?: string | null;
    last_activity_at?: string | null;
  };
  account?: {
    name?: string;
  };
  stakeholders?: Array<{
    name?: string;
    email?: string;
    committee_role?: string | null;
  }>;
  /** The rep's own side of the call. Their emails are NEVER a valid
   *  follow-up recipient — used to keep a draft from auto-addressing the
   *  rep themselves. */
  internal_participants?: Array<{
    email?: string;
  }>;
}

export interface DraftFollowup {
  to: string;
  to_name?: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  /** What in the substrate the draft was derived from — surfaced as the
   *  "Drafted from..." attribution line in the composer. */
  attribution: string;
  /** Mallin's confidence in this draft (0-1). High when the LLM transform
   *  produced clean customer-voice text with no leakage detected; lower
   *  when fallback was used because the transform leaked internal voice. */
  confidence: number;
  /** True when the leakage validator triggered fallback. Surface this on
   *  the composer so the rep knows to rewrite from scratch. */
  fallback: boolean;
}

interface GenerateOptions {
  /** Override the recipient (e.g. composer UI lets rep pick). When unset,
   *  we use the primary champion from the substrate. */
  to_email?: string;
  /** Override the subject line. */
  subject?: string;
  /** Rep's first name for the signoff. */
  rep_first_name?: string;
  /** The logged-in rep's own email — excluded from auto-recipient
   *  resolution so a draft never auto-addresses the rep. */
  rep_email?: string;
}

// ─── Leakage validator ─────────────────────────────────────────────────────
//
// Customer-facing emails must NEVER contain phrases that signal internal
// cognition. These markers indicate the model leaked rep-coaching voice
// into the customer-facing artifact. If any of these appear, the draft
// is rejected and regenerated; on exhaustion, fall back rather than ship.
//
// The list is conservative — false positives are cheap (one extra LLM
// retry), false negatives are expensive (a real email leaks to a real
// customer). Add to this list whenever new leakage patterns surface in
// production.

const LEAKAGE_MARKERS: ReadonlyArray<RegExp> = [
  /\bI'?d open\b/i,
  /\bthat gets you\b/i,
  /\bshows you were listening\b/i,
  /\bthe goal is\b/i,
  /\bwe should position\b/i,
  /\bthis gives us\b/i,
  /\btalk track\b/i,
  /\bobjection handling\b/i,
  /\bI'?d say\b/i,
  /\bI'?d lead with\b/i,
  /\bopening angle\b/i,
  /\bkey questions?\b/i,
  /\bcompetitive intel\b/i,
  /\bdiscovery (call|frame)\b/i,
  /\bstakeholder (map|strategy)\b/i,
  /\bchampion (play|action)\b/i,
  /\bdeal posture\b/i,
  /\bcritical risk\b/i,
  /\bmid-cycle\b/i,
  /\bcommercial stage\b/i,
  /\beconomic buyer\b/i,
  /\bbudget approver\b/i,
  /\b(if|when) Kevin asks\b/i,
  /\bget Kevin to\b/i,
  // Sentences that talk ABOUT what to say rather than saying it
  /:\s*['"]/, // quotes-as-script — e.g. `... I'd open with: "Kevin, before..."`
];

interface LeakageResult {
  clean: boolean;
  matched: string[];
}

function detectLeakage(body: string): LeakageResult {
  const matched: string[] = [];
  for (const re of LEAKAGE_MARKERS) {
    const m = body.match(re);
    if (m) matched.push(m[0]);
  }
  return { clean: matched.length === 0, matched };
}

// ─── Customer-voice transform prompt ───────────────────────────────────────

const CUSTOMER_EMAIL_SYSTEM_PROMPT = `You write follow-up emails from a B2B account executive (the rep) to their customer prospect AFTER a discovery or progress call.

CRITICAL: You are writing the email body TO the customer. You are NOT explaining what the rep should say or how the rep should approach the conversation. You ARE the rep, writing to the customer directly.

Voice contract:
- Natural, warm, professional. Read like a senior enterprise AE wrote it in 60 seconds, not like an AI assistant generated it.
- Concise. 3-5 short paragraphs max. No bullet lists, no headers, no markdown.
- Reference one or two specific things from the call (a stated priority, a competitor mentioned, a constraint). Specific over vague.
- Propose one concrete next step (a meeting, a piece of follow-up material, an introduction).
- Spell out acronyms — write so any reader understands it, not just an insider.
- HOLD THE LINE. If the intent names something to hold (a number, date, or scope the rep isn't ready to stand behind), do NOT concede it in the email — protect the rep's credibility. When the buyer is pushing for a commitment the rep can't yet make, acknowledge the pressure, name what has to happen first (in plain terms — never "the critical risk"), and offer a *conditional* path ("once we've confirmed X, I can put a real range in front of you"). A draft that caves to a premature number is a worse outcome than one that holds.
- STEER toward the move. If the intent names a winning move (a meeting to lock, a person to bring in), the email's concrete next step should drive toward that move — not a generic "let's catch up."
- Sign off with the rep's first name.

FORBIDDEN — these are internal-cognition markers that must NEVER appear in the email body:
- "I'd open with", "I'd say", "I'd lead with"
- "that gets you ___", "this shows them ___"
- "the goal is", "we should position", "this gives us"
- Any reference to internal frameworks: "talk track", "objection handling", "stakeholder map", "champion play", "deal posture", "discovery frame", "economic buyer", "budget approver", "competitive intel"
- Quoting what the rep WOULD say to the customer (e.g. \`I'd open with: "Kevin, before..."\`) — instead, JUST SAY IT directly to the customer.
- Meta-commentary about strategy. The customer should never read about your own sales strategy.

If you find yourself writing any of those phrases, rewrite the sentence as if you were a human rep typing the email yourself. The customer is reading what you write.

Output format: Return ONLY the email body as plain text. No subject line, no recipient line, no "Body:" label. Just the body — starting with the greeting, ending with the signoff.`;

interface TransformInput {
  recipientFirstName: string;
  repFirstName: string;
  accountName: string;
  dealName: string;
  /** Pass 4 INTENT — not text to copy. The transform reads this as the
   *  rep's strategic intent and translates it into customer-voice prose. */
  intent: {
    /** What the rep wants to accomplish with this email (in rep-coaching voice — the LLM transforms it) */
    recap_intent: string | null;
    ask_intent: string | null;
    /** A concrete moment from the call worth referencing (in rep-coaching voice) */
    call_anchor: string | null;
    /** The line to HOLD — what the rep must not over-commit or concede in this
     *  email (from the top critical risk's posture). Keeps the draft from
     *  caving to a premature number/date the way a lost deal did. */
    guard_intent: string | null;
    /** The winning move to steer the next step toward (from how_you_win). */
    win_intent: string | null;
  };
}

async function transformIntentToCustomerVoice(
  input: TransformInput,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  const client = new Anthropic({ apiKey });

  const userMessage = [
    `Recipient: ${input.recipientFirstName}`,
    `Rep signing off: ${input.repFirstName}`,
    `Account: ${input.accountName}`,
    `Deal context: ${input.dealName}`,
    "",
    "REP'S STRATEGIC INTENT (in internal-coaching voice — DO NOT copy this language; transform it into customer-voice prose):",
    input.intent.recap_intent
      ? `- Recap intent: ${input.intent.recap_intent}`
      : "",
    input.intent.call_anchor
      ? `- Call anchor: ${input.intent.call_anchor}`
      : "",
    input.intent.ask_intent
      ? `- Ask intent: ${input.intent.ask_intent}`
      : "",
    input.intent.win_intent
      ? `- The move to steer the next step toward: ${input.intent.win_intent}`
      : "",
    input.intent.guard_intent
      ? `- HOLD THIS LINE (do not over-commit or concede it in the email): ${input.intent.guard_intent}`
      : "",
    "",
    "Write the follow-up email body. Customer-voice. No internal-cognition markers. Body only.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: CUSTOMER_EMAIL_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      thinking: { type: "disabled" },
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    return block.text.trim();
  } catch (err) {
    console.warn(
      `[draft-followup] LLM transform failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;

export async function generateFollowupDraft(
  substrate: DraftSubstrate,
  artifact: PrepArtifact | null,
  opts: GenerateOptions = {},
): Promise<DraftFollowup> {
  const recipient = pickRecipient(substrate, opts.to_email, opts.rep_email);
  const dealName = substrate.opportunity?.name ?? "the deal";
  const accountName = substrate.account?.name ?? dealName;
  const repFirstName = opts.rep_first_name ?? "—";
  const subject =
    opts.subject ?? buildSubject(dealName, substrate, artifact);
  const recipientFirst = recipient.first_name ?? "there";

  // Pass 4 intent — extracted but NOT copied into the email body. The
  // transform reads these as intent signals to interpret, not text to
  // emit verbatim.
  const intent = {
    recap_intent: artifact?.talk_track?.opening_angle?.trim() ?? null,
    ask_intent:
      artifact?.talk_track?.key_questions?.[0]?.question?.trim() ?? null,
    call_anchor: artifact?.post_call_synthesis?.what_surfaced?.[0]?.trim() ?? null,
    // The line to hold + the winning move — so the email executes the brief's
    // strategy (protect credibility, steer toward the unlock), not just a
    // generic "let's catch up." Without these the draft plays defense-only and
    // drifts off the plan the brief just laid out.
    guard_intent: artifact?.critical_risks?.[0]?.recommended_posture?.trim() ?? null,
    win_intent: artifact?.how_you_win?.trim() ?? null,
  };

  // Attempt the LLM customer-voice transform up to MAX_ATTEMPTS times.
  // Reject any attempt whose body contains internal-cognition markers.
  let body: string | null = null;
  let leakedAttempts: string[][] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = await transformIntentToCustomerVoice({
      recipientFirstName: recipientFirst,
      repFirstName,
      accountName,
      dealName,
      intent,
    });
    if (!candidate) break;
    const leakage = detectLeakage(candidate);
    if (leakage.clean) {
      body = candidate;
      break;
    }
    leakedAttempts.push(leakage.matched);
    console.warn(
      `[draft-followup] attempt ${attempt + 1}/${MAX_ATTEMPTS} leaked: ${leakage.matched.join(", ")}`,
    );
  }

  // Fallback — if every attempt leaked OR the LLM was unavailable, we do
  // NOT ship leaked content. Return a minimal honest draft with low
  // confidence so the rep knows to write from scratch.
  let fallback = false;
  if (!body) {
    fallback = true;
    body = buildFallbackBody(recipientFirst, repFirstName);
  }

  const bodyText = body;
  const bodyHtml = body
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const attribution = fallback
    ? `Draft unavailable — write from scratch · ${dealName} · ${new Date().toISOString().slice(0, 10)}`
    : `Drafted from substrate · ${dealName} · ${new Date().toISOString().slice(0, 10)}`;

  const confidence = fallback ? 0.2 : artifact ? 0.92 : 0.7;

  return {
    to: recipient.email,
    to_name: recipient.first_name,
    subject,
    bodyText,
    bodyHtml,
    attribution,
    confidence,
    fallback,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface RecipientPick {
  email: string;
  first_name?: string;
}

function pickRecipient(
  substrate: DraftSubstrate,
  override?: string,
  repEmail?: string,
): RecipientPick {
  if (override) {
    return { email: override };
  }

  // Never auto-address the rep's own side. Exclude the rep's email + any
  // internal-participant email, plus any stakeholder sharing a seller-side
  // domain. If that leaves no buyer-side email, we return blank — the rep
  // picks a recipient rather than the draft defaulting to themselves.
  const excluded = new Set<string>();
  const norm = (e?: string | null) => (e ?? "").trim().toLowerCase();
  const repNorm = norm(repEmail);
  if (repNorm) excluded.add(repNorm);
  for (const p of substrate.internal_participants ?? []) {
    const e = norm(p.email);
    if (e) excluded.add(e);
  }
  const sellerDomains = new Set<string>();
  for (const addr of excluded) {
    const domain = addr.split("@")[1];
    if (domain) sellerDomains.add(domain);
  }

  const isBuyerSide = (email?: string): boolean => {
    const e = norm(email);
    if (!e) return false;
    if (excluded.has(e)) return false;
    const domain = e.split("@")[1];
    if (domain && sellerDomains.has(domain)) return false;
    return true;
  };

  const stakeholders = (substrate.stakeholders ?? []).filter((s) =>
    isBuyerSide(s.email),
  );
  const champion = stakeholders.find(
    (s) =>
      s.committee_role?.toLowerCase().includes("champion") ||
      s.committee_role === "champion",
  );
  const pick = champion ?? stakeholders[0];
  if (!pick) {
    return { email: "" };
  }
  return {
    email: pick.email ?? "",
    first_name: pick.name?.split(/\s+/)[0],
  };
}

function buildSubject(
  dealName: string,
  _substrate: DraftSubstrate,
  _artifact: PrepArtifact | null,
): string {
  return `Re: ${dealName} — following up`;
}

function buildFallbackBody(
  recipientFirst: string | undefined,
  repFirstName: string,
): string {
  const greeting = recipientFirst ? `${recipientFirst},` : "Hi,";
  return [
    greeting,
    "",
    "Wanted to follow up after our last conversation. Let me know if a quick call this week makes sense to align on next steps — Thursday afternoon or Friday morning works on my side.",
    "",
    `— ${repFirstName}`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
