/**
 * ============================================================================
 *  AI SDR — governed inbound triage — contract
 * ============================================================================
 *
 * A capability Mallin offers to its CUSTOMERS. A company runs Mallin; a visitor
 * lands on their website and engages the chat. This agent, GOVERNED by the
 * customer's configured rubric, determines one of three things and IMPLEMENTS
 * it:
 *
 *   work_now   — good fit, ready: route to the sales motion immediately.
 *   nurture    — right profile, not ready (timing / role / budget): keep warm.
 *   disqualify — never a good fit: close out warmly, don't burn a rep.
 *
 * This is the Mallin operating-layer move applied to the front door: the SAME
 * governed criteria that run deal execution now classify inbound. Governance =
 * the rubric (what "good fit" means + where the lines are). Implementation =
 * acting on the determination. See governance_template_schema.md,
 * governance templates, product_north_star.md.
 *
 * Multi-tenant by construction: every decision is anchored to a per-customer
 * SdrTenantConfig. The agent has no opinions of its own about fit — it applies
 * the customer's governance.
 *
 * Stable-contract discipline (stable_cognition_layer.md): these shapes are the
 * durable contract. The surface (chat widget) and the handoff (CRM / calendar /
 * nurture sequence) plug in underneath without changing them.
 * ============================================================================
 */

/**
 * The governed rubric a customer configures — what "good fit" means and where
 * the lines fall between work-now, nurture, and disqualify. This IS the
 * customer's governance applied to inbound triage.
 */
export interface SdrGovernance {
  /** Who is a good-fit buyer (ICP), in the customer's own words. */
  icp: string;
  /** The signals the agent must evaluate — the inbound qualification checklist. */
  qualification_criteria: string[];
  /** Clear non-fits → disqualify. */
  disqualifiers?: string[];
  /**
   * The bar a prospect must clear to be WORKED IMMEDIATELY rather than
   * nurtured (e.g. "decision-maker + concrete need + timeline this quarter").
   */
  work_now_bar: string;
  /**
   * When a right-profile-but-not-ready prospect should be NURTURED instead of
   * worked now (e.g. "good fit but no timeline, no budget yet, or just
   * researching on someone else's behalf").
   */
  nurture_band: string;
}

/**
 * A piece of collateral the customer makes available — a case study, product
 * one-pager, security overview, pricing guide, etc. The agent attaches the
 * genuinely relevant ones during the conversation. It selects by `id` only;
 * the URL is resolved from this catalog, so the agent can never invent a link.
 */
export interface SdrResource {
  /** Stable id the agent references when attaching this resource. */
  id: string;
  title: string;
  type:
    | "case_study"
    | "product_doc"
    | "security"
    | "pricing"
    | "guide"
    | "integration"
    | "other";
  url: string;
  /** 1-2 lines so the agent knows what it contains. */
  summary: string;
  /**
   * When this is relevant — free-form hints the agent matches against the
   * prospect's context (industries, use cases, personas, objections/topics it
   * addresses). E.g. ["fintech", "security", "build-vs-buy"].
   */
  relevant_for?: string[];
}

/** What the agent DOES per triage decision — the implementation layer. */
export interface SdrImplementation {
  /** work_now: route straight into the customer's sales motion. */
  work_now: {
    type: "book_meeting" | "handoff_sales" | "start_trial";
    detail?: string;
  };
  /** nurture: keep them warm without spending a sales rep. */
  nurture: {
    type: "capture_email" | "send_resource" | "add_to_sequence";
    detail?: string;
  };
  // disqualify is implicit: warm close, no downstream action.
}

/** A product or service the company sells — auto-discovered or hand-entered. */
export interface SdrProduct {
  name: string;
  description: string;
  /** Who it's for — fit signals specific to this product. */
  for_who?: string;
}

/**
 * A buyer persona the agent tailors the conversation to. The agent reads the
 * prospect's role/title, maps to the closest persona, and leads with that
 * persona's typical duties + pains + decision drivers.
 */
export interface SdrPersona {
  /** Title/role, e.g. "VP of Sales", "RevOps lead", "Head of Eng". */
  role: string;
  /** What they do day-to-day. */
  duties?: string;
  /** Problems this persona typically faces that the offering speaks to. */
  pains?: string[];
  /** What they care about / decision drivers. */
  cares_about?: string[];
}

/** Everything a Mallin customer configures once. Anchors every decision. */
export interface SdrTenantConfig {
  /** The customer's company name — the agent represents them. */
  company_name: string;
  /**
   * The customer's website/domain — the AUTHORITATIVE identity for research.
   * Disambiguates same-named companies (e.g. "Mallin" the RevOps AI vs a
   * metal recycler). Strongly recommended before running company research.
   */
  website?: string;
  /** What the customer sells. Anchors product answers AND fit judgment. */
  offering: string;
  /**
   * Products/services the company sells — lets the agent converse and qualify
   * across the whole catalog, not just one offering, and detect which product a
   * prospect wants. Auto-buildable via company research.
   */
  products?: SdrProduct[];
  /**
   * Buyer personas — the agent reads the prospect's role and tailors the
   * conversation (their duties, typical pains, what they care about).
   */
  personas?: SdrPersona[];
  /** The governed rubric. */
  governance: SdrGovernance;
  /** What to implement per triage outcome. */
  implementation: SdrImplementation;
  /**
   * Governed autonomy: per-tool, what the agent may do ON ITS OWN.
   *   auto    → execute immediately (low-stakes, reversible).
   *   approve → queue for a human; the agent does NOT execute or promise it.
   *   never   → forbidden; the agent must not attempt it.
   * Missing tool falls back to DEFAULT_ACTION_MODE. This is the same
   * auto / suggest-and-approve / never tiering as CRM write-back, applied to
   * the front door — it's what makes the autonomy GOVERNED, not unleashed.
   */
  action_policy?: ActionPolicy;
  /**
   * Collateral the agent may send during the conversation — case studies,
   * product docs, security overviews, etc. The agent attaches the relevant
   * ones; it cannot send anything not in this list.
   */
  resources?: SdrResource[];
  /**
   * Optional product facts the agent may answer with — a lightweight KB. The
   * agent must NOT invent capabilities/pricing/claims beyond these + offering.
   */
  knowledge?: string[];
  /** Optional tone guidance ("warm and consultative", "concise and direct"). */
  voice?: string;
  /**
   * Where qualified leads / hand-offs are delivered. The working default is
   * email (sent via Resend). Slack + CRM are optional adapters — set them and
   * the effect dispatcher routes there too; leave them unset and email stands
   * in. (Real Slack/CRM wiring needs the customer's own creds/OAuth.)
   */
  notify_email?: string;
  slack_webhook_url?: string;
  crm?: { kind: "salesforce" | "hubspot"; /* creds resolved server-side */ };
}

export type Speaker = "prospect" | "agent";
export interface ConversationTurn {
  role: Speaker;
  content: string;
}

export type IcpMatch = "strong" | "plausible" | "weak" | "none";

/**
 * The governed triage decision — the headline output.
 *   qualifying — still gathering; not enough to decide yet.
 *   work_now   — clears the work_now_bar: route to sales immediately.
 *   nurture    — fits the nurture_band: keep warm, don't hand to a rep yet.
 *   disqualify — a disqualifier or clear non-fit: close out warmly.
 */
export type TriageDecision = "qualifying" | "work_now" | "nurture" | "disqualify";

/** Lead fields captured from the conversation — null until learned. */
export interface CapturedLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  team_size: string | null;
  use_case: string | null;
  timeline: string | null;
}

/** Per-criterion progress, keyed to the governance qualification_criteria. */
export interface CriterionStatus {
  criterion: string;
  status: "met" | "unmet" | "unknown";
  /** Quoted/paraphrased evidence from the conversation, or null. */
  evidence: string | null;
}

/** The rolling, structured read the agent maintains every turn. */
export interface QualificationState {
  lead: CapturedLead;
  criteria: CriterionStatus[];
  fit: {
    icp_match: IcpMatch;
    /** Why this read — grounded in what the prospect said. */
    reasoning: string;
  };
  /** What still must be learned to decide — drives the next question. */
  missing: string[];
}

/**
 * Governed autonomy: per-tool, what the agent may do on its own.
 *   auto    → execute immediately.
 *   approve → queue for a human; do not execute.
 *   never   → forbidden.
 */
export type ActionMode = "auto" | "approve" | "never";
export type ActionPolicy = Record<string, ActionMode>;

/** Fallback when a tool isn't named in the tenant's action_policy. */
export const DEFAULT_ACTION_MODE: ActionMode = "approve";

/**
 * One governed action the agent took (or tried to) this turn — the audit
 * record. Every tool invocation produces exactly one of these, whether it
 * executed, was queued for approval, or was blocked by policy.
 */
export interface AuditEntry {
  tool: string;
  input: Record<string, unknown>;
  /** The policy that applied. */
  mode: ActionMode;
  status: "executed" | "pending_approval" | "blocked";
  /** Human-readable outcome (also fed back to the agent mid-loop). */
  result: string;
}

/**
 * The result of one prospect turn: what to say, the rolling read, AND the
 * governed actions the agent actually took to get there. `actions` is the
 * audit trail — the difference between an agent that DECIDES and one that DOES.
 */
export interface SdrAgentTurn {
  /** What the agent says to the prospect next. */
  reply: string;
  /** The governed triage decision. */
  triage: TriageDecision;
  state: QualificationState;
  /** Every governed action taken (executed / queued / blocked) this turn. */
  actions: AuditEntry[];
}
