/**
 * seller-proof-agent — research the SELLER's real ammunition to arm the deck.
 *
 * The deck-copy agent is transcript-only (never invents facts), which means it
 * can only reflect what the buyer said — it cannot sell who the seller is, name
 * same-industry customers, or map the buyer's needs to the seller's modules.
 * This agent fills that gap: given the call + the seller + what's being sold, it
 * web-searches the seller's OWN customer/case-study page (and the web) for real,
 * named, same-industry references, and maps the buyer's stated needs to specific
 * seller modules. Its output feeds the deck's "Why <seller>" + proof sections.
 *
 * Never throws: any failure returns null and the deck degrades to transcript-only.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/billing/log-usage";

const MODEL = "claude-sonnet-4-6";
const MAX_WEB_SEARCHES = 6;
const MAX_ITERATIONS = MAX_WEB_SEARCHES + 2;

export interface SellerProofReference {
  /** Real named customer. */
  customer: string;
  /** Their industry (used to show same-industry relevance). */
  industry?: string;
  /** One concrete line of proof — what they achieved / why they chose the seller. */
  proof: string;
  /** Source URL (seller customer page / case study). */
  url?: string;
}

export interface SellerProofModuleFit {
  /** The buyer's stated need/pain, from the transcript. */
  need: string;
  /** The specific seller module/capability that addresses it. */
  module: string;
  /** One concrete line on how that module solves the need. */
  how_it_helps: string;
}

export interface SellerProof {
  /** 1-2 sentences: who the seller is + why they're credible for a buyer like this. */
  positioning: string;
  /** 2-4 real, named references — same-industry first, then size-tier fallback. */
  references: SellerProofReference[];
  /** Buyer needs → seller modules mapping. */
  module_fit: SellerProofModuleFit[];
}

export interface SellerProofRequest {
  sellerName: string;
  buyerName: string;
  /** What's being sold — anchors module mapping. */
  productContext: string;
  /** The latest call transcript — used to infer the buyer's industry + needs. */
  transcript: string;
}

const emitTool: Anthropic.Tool = {
  name: "emit_seller_proof",
  description: "Emit the researched, real seller proof: positioning, named references, and need→module fit.",
  input_schema: {
    type: "object",
    properties: {
      positioning: {
        type: "string",
        description:
          "1-2 sentences on who the seller is and why they're credible for a buyer like this. Real, from public sources — not marketing fluff.",
      },
      references: {
        type: "array",
        description:
          "2-4 REAL named customer references. Prefer the buyer's OWN industry first; fall back to the buyer's size tier. Never invent a company or a stat.",
        items: {
          type: "object",
          properties: {
            customer: { type: "string", description: "Real named company." },
            industry: { type: "string", description: "Their industry — show same-industry relevance." },
            proof: {
              type: "string",
              description:
                "One concrete line: what they achieved with the seller, or why they chose them. From the customer's real story/testimonial.",
            },
            url: { type: "string", description: "Source URL (seller's customer/case-study page)." },
          },
          required: ["customer", "proof"],
        },
      },
      module_fit: {
        type: "array",
        description:
          "2-4 mappings of the buyer's STATED needs (from the transcript) to the specific seller modules/capabilities that address them.",
        items: {
          type: "object",
          properties: {
            need: { type: "string", description: "The buyer's stated need/pain, from the call." },
            module: { type: "string", description: "The specific seller module/capability that addresses it." },
            how_it_helps: { type: "string", description: "One concrete line on how that module solves the need." },
          },
          required: ["need", "module", "how_it_helps"],
        },
      },
    },
    required: ["positioning", "references", "module_fit"],
  },
};

/**
 * Research the seller's real proof to feed the deck. Returns null on any failure
 * (missing key, no emit, error) — the caller degrades to transcript-only copy.
 */
export async function researchSellerProof(req: SellerProofRequest): Promise<SellerProof | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const client = new Anthropic({ apiKey });

    const system = `You are a sales-enablement researcher arming a rep for a follow-up deck.

The SELLER is ${req.sellerName}. They sell: ${req.productContext}. The BUYER is ${req.buyerName}.

Do THREE things, then emit them with emit_seller_proof:

1. positioning — 1-2 sentences on who ${req.sellerName} is and why they're credible for a buyer like ${req.buyerName}. Real, from public sources.

2. references — 2-4 REAL named customer references. web_search ${req.sellerName}'s OWN customer / case-study page (try their "/customers" page) plus the web. Prefer customers in the BUYER'S OWN INDUSTRY first — infer the buyer's industry from the transcript. If you can't find same-industry names, fall back to the buyer's SIZE TIER (SMB / mid-market / enterprise). Each reference = a real named company + one concrete line of proof (what they achieved or why they chose ${req.sellerName}) + the source URL. A recognizable peer beats a big unrelated logo.

3. module_fit — map the buyer's STATED needs/pains from the transcript to the specific ${req.sellerName} modules/capabilities that address them, one concrete line each on how it helps.

Rules:
- Only real, sourced facts. NEVER invent a customer, a logo, or a number — if you can't verify a reference, drop it rather than fabricate.
- Spend up to ${MAX_WEB_SEARCHES} searches; prioritize the seller's customer page for same-industry names.
- When done, call emit_seller_proof ONCE. Do not respond with text.`;

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Latest call transcript (infer the buyer's industry + stated needs from it):\n\n\`\`\`\n${req.transcript}\n\`\`\`\n\nResearch ${req.sellerName}'s real proof and call emit_seller_proof once.`,
      },
    ];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES } as unknown as Anthropic.Tool,
          emitTool,
        ],
        messages,
      });
      messages.push({ role: "assistant", content: res.content });
      try {
        logUsage(`deck.seller_proof.iter${iter}`, MODEL, res.usage);
      } catch {
        /* no usage context on this path — fine */
      }

      const emit = res.content.find((b) => b.type === "tool_use" && b.name === "emit_seller_proof");
      if (emit && emit.type === "tool_use") {
        const input = emit.input as Partial<SellerProof>;
        return {
          positioning: input.positioning ?? "",
          references: (input.references ?? []).filter((r) => r && r.customer && r.proof),
          module_fit: (input.module_fit ?? []).filter((m) => m && m.need && m.module),
        };
      }

      if (res.stop_reason !== "tool_use" && res.stop_reason !== "pause_turn") break;
    }
    return null;
  } catch (e) {
    console.warn(`[researchSellerProof] ${(e as Error).message}`);
    return null;
  }
}
