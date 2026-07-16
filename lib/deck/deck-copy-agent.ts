/**
 * deck-copy-agent — turn a discovery-call transcript into punchy, customer-facing
 * deck copy: the meeting block (attendees + agenda) plus the deal-story narrative
 * sections ("Where you are today", "What you're solving for", "Why <seller>",
 * "How we connect", "Next steps").
 *
 * This is the "make it good" layer. The deterministic deck-model trims the
 * intelligence artifact into clean slides; this agent writes slide copy that
 * reads like a rep wrote it — concrete, compressed, no fluff or internal tactics.
 * Output drops straight into AccountIntelligenceArtifact.meeting (the deck reads
 * attendees/agenda/sections from there).
 *
 * Customer-facing voice: framed for the buyer, no landmines / watch-fors /
 * rep-coaching. Every bullet is a point the customer would nod at.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MeetingBlock } from "@/lib/intelligence/types";
import type { SellerProof } from "./seller-proof-agent";

const MODEL = "claude-opus-4-7";

export interface DeckCopyRequest {
  transcript: string;
  /** What's being sold (anchors the framing). */
  productContext: string;
  sellerName: string;
  buyerName: string;
  /** The PRIOR call's distilled deck content, if this is a follow-on call.
   *  Used only to carry forward still-relevant threads (pain, goals,
   *  stakeholders) the latest call builds on but may not restate. The latest
   *  transcript always wins; nothing here is invented or resurrected. */
  priorMeeting?: MeetingBlock | null;
  /** Real, web-sourced seller proof (positioning + named references + need→module
   *  fit). When present, the deck actually SELLS the seller with same-industry
   *  references — the one exception to the transcript-only rule. Null → the deck
   *  stays transcript-only. */
  sellerProof?: SellerProof | null;
}

const emitTool: Anthropic.Tool = {
  name: "emit_deck_copy",
  description:
    "Emit the customer-facing deck content extracted + written from the call.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Meeting title, e.g. 'Northwind / Acme Corp — Intro Call'." },
      date: { type: "string", description: "ISO date of the call (YYYY-MM-DD) if stated." },
      meeting_type: { type: "string", description: "discovery | demo | pricing | intro | technical_review | check_in | unknown" },
      attendees: {
        type: "array",
        description: "Everyone on the call.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            title: { type: "string", description: "Role/title as stated, e.g. 'VP of Finance'." },
            company: { type: "string" },
            side: { type: "string", enum: ["seller", "buyer"] },
          },
          required: ["name", "company", "side"],
        },
      },
      agenda: {
        type: "array",
        description: "Ordered agenda topics the call covered (short phrases).",
        items: { type: "string" },
      },
      sections: {
        type: "array",
        description:
          "The deal-story narrative as deck sections, in order. Use these headings when supported: 'Where <buyer> is today' (current state + pain), 'What <buyer> is solving for' (goals/outcomes), 'Why <seller>' (fit + how modules map to their needs), 'What's included' (one entry per module: what it does + its benefits — ONLY when seller proof is provided), 'Who <seller> works with' (real named same-industry references — ONLY when seller proof is provided), 'How we connect' (integration + connectivity if discussed), 'Next steps'. 3-7 sections, each 3-5 bullets. Each bullet is ONE concrete point, <= 14 words, customer-facing — EXCEPT the 'What's included' bullets, which may run longer (module name — what it does — its benefits). Bullets are drawn from what was actually said on the call — EXCEPT 'Why <seller>', 'What's included', and 'Who <seller> works with', which use the provided seller proof (real references + need→module fit).",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["heading", "bullets"],
        },
      },
      quotes: {
        type: "array",
        description:
          "3-5 VERBATIM quotes pulled straight from the transcript — the buyer's OWN words that reveal their pain, goals, or stakes. Quote EXACTLY what they said (lightly trim filler words/false starts only; never paraphrase or improve it). Pick the most revealing lines a CFO would recognize as their own. Prefer buyer speakers over the seller. Each quote MUST be attributed to the real speaker + their role.",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "The exact words. No quotation marks; no paraphrase." },
            speaker: { type: "string" },
            role: { type: "string", description: "e.g. 'VP of Finance'" },
            company: { type: "string" },
          },
          required: ["text", "speaker"],
        },
      },
      impact: {
        type: "object",
        description:
          "Quantified impact for an executive (CFO) audience. metrics: 2-4 HERO figures stated on the call (hours, dollars, # entities, cycle times) — value is the big number, label is what it measures. today: 3-4 short phrases naming the cost of the status quo (what it costs them now). with_solution: 3-4 short phrases naming what changes with <seller>. Use ONLY real numbers/facts from the call; if a number wasn't stated, don't invent one.",
        properties: {
          metrics: {
            type: "array",
            items: {
              type: "object",
              properties: { value: { type: "string" }, label: { type: "string" } },
              required: ["value", "label"],
            },
          },
          today: { type: "array", items: { type: "string" } },
          with_solution: { type: "array", items: { type: "string" } },
        },
        required: ["metrics", "today", "with_solution"],
      },
    },
    required: ["title", "attendees", "agenda", "sections", "quotes", "impact"],
  },
};

/**
 * Generate deck copy from a transcript. Returns a MeetingBlock (attendees +
 * agenda + sections) ready to merge into an artifact's `meeting` field.
 */
export async function generateDeckCopy(req: DeckCopyRequest): Promise<MeetingBlock> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  // Follow-on call: hand the model the PRIOR call's distilled deck content so it
  // can carry forward still-live threads instead of resetting to only this call.
  // Compact by design — sections/impact/quote-gist/attendees, not raw transcript.
  const priorSummary = req.priorMeeting
    ? JSON.stringify({
        title: req.priorMeeting.title,
        meeting_type: req.priorMeeting.meeting_type,
        attendees: req.priorMeeting.attendees ?? [],
        sections: req.priorMeeting.sections ?? [],
        impact: req.priorMeeting.impact ?? null,
        quotes: (req.priorMeeting.quotes ?? []).map((q) => ({ speaker: q.speaker, text: q.text })),
      })
    : null;

  const carryForward = priorSummary
    ? `

THIS IS A FOLLOW-ON CALL — carry forward, don't reset.
You're given the PRIOR call's deck content (in the user message). The transcript above is the PRIMARY source and defines the CURRENT state: title, date, meeting_type, agenda, attendees, quotes, and impact all come from THIS call. Use the prior content ONLY to carry forward threads still live and that this call builds on without restating — an established pain point, a stated goal, a stakeholder introduced earlier.
Rules: (1) the latest call ALWAYS wins where they differ — never resurrect something this call resolved, priced, or moved past; (2) never invent — carry forward only what the prior content actually contains; (3) quotes are VERBATIM from THIS call's transcript, never the prior one; (4) prefer this call's numbers. Continuity, not a merge: the deck IS this call, enriched by what's still true from before.`
    : "";

  const sellerProofBlock = req.sellerProof
    ? `\n\nSELLER PROOF — real, web-sourced material you MUST use (the ONE exception to "only from the call"; researched from ${req.sellerName}'s public sources):\n${JSON.stringify(req.sellerProof)}\nUse it to make the deck actually SELL ${req.sellerName}:\n- Build a strong "Why ${req.sellerName}" section from module_fit — each bullet ties one of ${req.buyerName}'s STATED needs to the specific ${req.sellerName} module that solves it.\n- Add a section titled "What's included" — one bullet per module in module_fit: lead with the module name, then a plain-English line on what it does (its definition) and its benefits. This is where a prospect who doesn't know the modules learns what each one includes; these bullets may run longer than the usual 14 words.\n- Add a section titled "Who ${req.sellerName} works with" — one bullet per real reference: the named customer + the one-line proof, same-industry first. Use ONLY the named references provided; never invent a logo or a stat.\n- You may open "Why ${req.sellerName}" with the positioning line.\nEvery OTHER section (today, solving-for, quotes, impact, next steps) still comes only from the call.`
    : "";

  const system = `You write the customer-facing slide deck a rep presents AFTER a discovery call.
The deck is presented BY ${req.sellerName} TO ${req.buyerName}. It is selling: ${req.productContext}.

Voice — non-negotiable:
- Every bullet is ONE concrete, compressed point a rep would actually say. <= 14 words.
- Operator language, not analyst language. Specific to THIS company and THIS call.
- Pull from what was actually said (numbers, systems, banks, names). No invented facts.
- Customer-facing: NO internal sales tactics, NO "watch for", NO landmines, NO rationale.
- No fluff, no "leverage synergies", no generic SaaS copy.
- NO internal deal-state or pipeline language — this slide is shown TO THE CUSTOMER. Banned: "gate", "gate is open", "no date set", "ready to decide", "close date", "forecast", "advancing", "stage", "next step owner". The customer has no idea what a "gate" is. "Next steps" are concrete MUTUAL actions anyone in the room would recognize — who does what next: e.g. "Northwind sends the data-residency detail to security", "Revised proposal + phased scope to Dana this week", "Reference calls complete". Real to-dos, never the deal's internal status.

Build the sections so the deck tells the deal story: where the buyer is today (their
current pain, with their real numbers/systems), what they're solving for (their goals),
why ${req.sellerName} fits (proof + how it maps to their needs), how it connects (their
ERP + banks if discussed), and next steps. Quote real specifics from the call.

This deck is for an EXECUTIVE (CFO) audience. Two things make it land:
1. quotes — pull the buyer's OWN words verbatim. This is the strongest lever: a CFO
   who sees their exact words feels understood. Quote exactly; never paraphrase.
2. impact — make the cost of the status quo and the payoff QUANTIFIED and concrete,
   using the real numbers said on the call (hours/week, dollars, # entities, close
   timing). A CFO buys on impact, not features.${carryForward}${sellerProofBlock}`;

  const priorBlock = priorSummary
    ? `Prior call's deck content — for CARRY-FORWARD ONLY, not the source of this deck:\n\`\`\`json\n${priorSummary}\n\`\`\`\n\n`
    : "";
  const user = `${priorBlock}This call's transcript:\n\n\`\`\`\n${req.transcript}\n\`\`\`\n\nCall emit_deck_copy once with the complete deck content.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    tools: [emitTool],
    tool_choice: { type: "tool", name: "emit_deck_copy" },
    messages: [{ role: "user", content: user }],
  });

  const block = res.content.find((b) => b.type === "tool_use" && b.name === "emit_deck_copy");
  if (!block || block.type !== "tool_use") {
    throw new Error("deck-copy agent did not emit_deck_copy");
  }
  const out = block.input as {
    title?: string;
    date?: string;
    meeting_type?: string;
    attendees?: MeetingBlock["attendees"];
    agenda?: string[];
    sections?: { heading: string; bullets: string[] }[];
    quotes?: MeetingBlock["quotes"];
    impact?: MeetingBlock["impact"];
  };

  return {
    title: out.title,
    date: out.date,
    meeting_type: out.meeting_type,
    attendees: out.attendees ?? [],
    agenda: out.agenda ?? [],
    sections: out.sections ?? [],
    quotes: out.quotes ?? [],
    impact: out.impact ?? null,
  };
}
