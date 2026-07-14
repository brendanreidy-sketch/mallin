/**
 * ============================================================================
 *  AI SDR — tools + governed executor
 * ============================================================================
 *
 * The agentic layer: the agent doesn't *emit* a decision, it *calls* tools.
 * Two action tools (send_resource, hand_off) plus a terminal respond_to_prospect.
 *
 * executeAction() is the governance gate every action passes through:
 *   auto    → perform the effect now, audit "executed"
 *   approve → DON'T perform; audit "pending_approval"; tell the agent not to
 *             promise it (a human signs off out of band)
 *   never   → audit "blocked"; the agent must not attempt or imply it
 *
 * Effects are STUBBED for this slice (recorded, not yet wired to real
 * calendar/CRM/email) — the agentic structure + governance + audit are real;
 * the integrations plug in at the marked points without changing the loop.
 * ============================================================================
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_ACTION_MODE,
  type ActionMode,
  type AuditEntry,
  type SdrTenantConfig,
} from "./types";
import { performEffect, type EffectOpts } from "./effects";

// ── Tool schemas the agent sees ─────────────────────────────────────────────

export const SEND_RESOURCE_TOOL: Anthropic.Tool = {
  name: "send_resource",
  description:
    "Send the prospect a piece of collateral from the resource library. Pick by relevance to what they just raised. Use ONLY ids from the library.",
  input_schema: {
    type: "object",
    properties: {
      resource_id: { type: "string", description: "id from the resource library" },
    },
    required: ["resource_id"],
  },
};

export const HAND_OFF_TOOL: Anthropic.Tool = {
  name: "hand_off",
  description:
    "Route this prospect to the customer's sales team as a qualified lead. Call when they clear the work-now bar.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why they qualify (1 sentence)." },
      lead_summary: {
        type: "string",
        description: "Name/company/role/use-case/timeline as known (human-readable).",
      },
      name: { type: ["string", "null"], description: "Prospect name, if known." },
      email: { type: ["string", "null"], description: "Prospect email — capture before handing off." },
      phone: { type: ["string", "null"], description: "Prospect phone, if offered." },
      company: { type: ["string", "null"], description: "Company, if known." },
      title: { type: ["string", "null"], description: "Role/title, if known." },
    },
    required: ["reason", "lead_summary"],
  },
};

export const RESPOND_TO_PROSPECT_TOOL: Anthropic.Tool = {
  name: "respond_to_prospect",
  description:
    "Send the next reply to the prospect and record the current read. Call this exactly once to END the turn, after any actions.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "What the prospect sees. Natural, human." },
      triage: {
        type: "string",
        enum: ["qualifying", "work_now", "nurture", "disqualify"],
      },
      state: {
        type: "object",
        properties: {
          lead: {
            type: "object",
            properties: {
              name: { type: ["string", "null"] },
              email: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              company: { type: ["string", "null"] },
              role: { type: ["string", "null"] },
              team_size: { type: ["string", "null"] },
              use_case: { type: ["string", "null"] },
              timeline: { type: ["string", "null"] },
            },
            required: ["name", "email", "phone", "company", "role", "team_size", "use_case", "timeline"],
          },
          criteria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                criterion: { type: "string" },
                status: { type: "string", enum: ["met", "unmet", "unknown"] },
                evidence: { type: ["string", "null"] },
              },
              required: ["criterion", "status", "evidence"],
            },
          },
          fit: {
            type: "object",
            properties: {
              icp_match: { type: "string", enum: ["strong", "plausible", "weak", "none"] },
              reasoning: { type: "string" },
            },
            required: ["icp_match", "reasoning"],
          },
          missing: { type: "array", items: { type: "string" } },
        },
        required: ["lead", "criteria", "fit", "missing"],
      },
    },
    required: ["reply", "triage", "state"],
  },
};

export const BOOK_MEETING_TOOL: Anthropic.Tool = {
  name: "book_meeting",
  description:
    "Offer the prospect the booking link to schedule a meeting. Use on a work-now prospect who's ready to talk to the team.",
  input_schema: {
    type: "object",
    properties: {
      link: { type: "string", description: "Booking link (omit to use the configured default)." },
    },
    required: [],
  },
};

export const ACTION_TOOLS = [SEND_RESOURCE_TOOL, HAND_OFF_TOOL, BOOK_MEETING_TOOL];
export const ALL_TOOLS = [...ACTION_TOOLS, RESPOND_TO_PROSPECT_TOOL];

// ── Governed executor ───────────────────────────────────────────────────────

export function actionMode(config: SdrTenantConfig, tool: string): ActionMode {
  return config.action_policy?.[tool] ?? DEFAULT_ACTION_MODE;
}

function describe(tool: string, input: Record<string, unknown>, config: SdrTenantConfig): string {
  if (tool === "send_resource") {
    const r = (config.resources ?? []).find((x) => x.id === input.resource_id);
    return r ? `send "${r.title}"` : `send resource ${String(input.resource_id)}`;
  }
  if (tool === "hand_off") return `route lead to sales (${String(input.lead_summary ?? "")})`;
  return tool;
}

/**
 * Run one action tool through the governance gate. Returns the audit entry;
 * its `result` is also what gets fed back to the agent so its next step
 * reflects reality (e.g. "queued, not done" → don't tell the prospect it's set).
 *
 * `auto` actually performs the effect (via the dispatcher); `approve` queues;
 * `never` blocks. `dryRun` (in opts) forwards to the dispatcher so the sim
 * never sends for real.
 */
export async function executeAction(
  tool: string,
  input: Record<string, unknown>,
  config: SdrTenantConfig,
  opts: EffectOpts = {},
): Promise<AuditEntry> {
  const mode = actionMode(config, tool);

  if (mode === "never") {
    return {
      tool,
      input,
      mode,
      status: "blocked",
      result: `Blocked by policy: ${tool} is not permitted. Do not attempt it or imply it happened.`,
    };
  }

  if (mode === "approve") {
    return {
      tool,
      input,
      mode,
      status: "pending_approval",
      result: `Queued for human approval (NOT executed): ${describe(tool, input, config)}. Do not tell the prospect it's done — say a teammate will confirm shortly.`,
    };
  }

  // auto → perform the real effect now.
  const result = await performEffect(tool, input, config, opts);
  return { tool, input, mode, status: "executed", result };
}
