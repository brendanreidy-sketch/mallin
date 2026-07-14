/**
 * ============================================================================
 *  Dry-run preview — what the system WOULD send if writes were enabled
 * ============================================================================
 *
 *  Pure logic. Given a DiffResult, returns the exact Salesforce REST
 *  payloads that would fire — without ever sending them. This is the
 *  verification step before earning the write privilege.
 *
 *  Why this matters:
 *    Reps (and the engineer behind them) need to see the literal
 *    payload before any human signs off on automation. A diff card
 *    showing "next step will be written" is hand-wavy. A JSON body
 *    showing `{"NextStep": "Send pricing to Priya (VP Finance)"}`
 *    is auditable.
 *
 *  Doctrine §11.3 enforcement (defense in depth):
 *    - readonly tier items NEVER appear in any payload, even surface_only
 *      (they'd be wrong to write).
 *    - suggest tier items appear in `would_suggest_to_rep` (a payload the
 *      UI would render, not one we'd send).
 *    - auto tier items appear in `would_auto_write` (a single PATCH body).
 *    - All payloads carry dry_run=true and a banner explaining nothing
 *      was sent.
 * ============================================================================
 */

import type { DiffResult, DiffItem } from "./types";

/** Salesforce REST PATCH body shape — flat field→value object. */
export type SfPatchBody = Record<string, string | number | boolean | null>;

export interface DryRunPreview {
  /** Always true. The route + UI must surface this prominently so no
   *  one assumes writes happened. */
  dry_run: true;

  /** SF Opportunity Id the writes would target. */
  sf_opp_id: string;

  /** What would auto-fire — the tier=auto items where SF was blank
   *  and substrate had a confident value. */
  would_auto_write: {
    items: DryRunItem[];
    rest_url: string; // e.g. /services/data/v62.0/sobjects/Opportunity/<id>
    method: "PATCH";
    body: SfPatchBody;
    /** Compact, readable cURL the engineer can eyeball. Auth header
     *  redacted — never includes the real bearer token. */
    curl_preview: string;
  };

  /** What would render to the rep for approval — never auto-fires.
   *  Each item is its own approval, not a single batch payload. */
  would_suggest_to_rep: {
    items: DryRunItem[];
    notes: string;
  };

  /** What is intentionally NOT included in any payload — surfaced for
   *  audit only, never sent. */
  excluded_readonly: {
    items: DryRunItem[];
    notes: string;
  };

  /** Top-line summary, surfaced in the UI banner. */
  summary: {
    auto_count: number;
    suggest_count: number;
    excluded_readonly_count: number;
    payload_size_bytes: number;
  };
}

export interface DryRunItem {
  field_label: string;
  sf_field: string;
  tier: "auto" | "suggest" | "readonly";
  /** Value the system would write. Mirrors substrate_value from the
   *  diff item, kept here for grep-ability when reading the JSON. */
  value: string | number | boolean | null;
  current_sf_value: string | null;
  reason: string;
}

/** Best-effort conversion of substrate string back into the SF wire
 *  type. Salesforce REST accepts strings for most field types but
 *  numbers/booleans should be typed for clarity. */
function coerceForSfWire(
  raw: string | null,
  sf_field: string,
): string | number | boolean | null {
  if (raw === null) return null;
  // Amount-shaped fields → number
  if (/Amount|MRR|ARR|Margin|Pct/i.test(sf_field)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  // Boolean checkbox fields (methodology checkbox fields, and explicit
  // boolean SF types like IsClosed)
  if (raw === "true") return true;
  if (raw === "false") return false;
  // Default: pass through as string
  return raw;
}

/** Build a dry-run preview from a completed diff. Pure function — no I/O. */
export function buildDryRunPreview(diff: DiffResult): DryRunPreview {
  const auto: DryRunItem[] = [];
  const suggest: DryRunItem[] = [];
  const excluded: DryRunItem[] = [];

  for (const it of diff.items) {
    const item: DryRunItem = {
      field_label: it.field_label,
      sf_field: it.sf_field,
      tier: it.tier,
      value: coerceForSfWire(it.substrate_value, it.sf_field),
      current_sf_value: it.sf_current,
      reason: it.reason,
    };

    if (it.tier === "readonly") {
      // Surface_only AND no_op readonly items go into excluded for full
      // audit. We never write a readonly field.
      if (it.action === "surface_only" || it.action === "no_op") {
        excluded.push(item);
      } else {
        // Engine should never produce write_now/suggest for readonly.
        // If it does, surface as excluded anyway — defense in depth.
        excluded.push(item);
      }
      continue;
    }

    if (it.action === "write_now") {
      auto.push(item);
    } else if (it.action === "suggest") {
      suggest.push(item);
    }
    // no_op (match, substrate_blank) → not included in any payload
  }

  // Build the auto-write PATCH body
  const body: SfPatchBody = {};
  for (const a of auto) {
    body[a.sf_field] = a.value;
  }

  const restUrl = `/services/data/v62.0/sobjects/Opportunity/${diff.sf_id}`;
  const bodyJson = JSON.stringify(body);

  // cURL with redacted auth — engineer can copy, see the shape, but
  // never accidentally include a live bearer token in chat / a doc.
  const curlPreview = auto.length
    ? `curl -X PATCH \\
  '<sf-instance-url>${restUrl}' \\
  -H 'Authorization: Bearer <REDACTED>' \\
  -H 'Content-Type: application/json' \\
  -d '${bodyJson}'`
    : "(no auto-write items — nothing to send)";

  return {
    dry_run: true,
    sf_opp_id: diff.sf_id,
    would_auto_write: {
      items: auto,
      rest_url: restUrl,
      method: "PATCH",
      body,
      curl_preview: curlPreview,
    },
    would_suggest_to_rep: {
      items: suggest,
      notes:
        "These would render in the UI as Approve/Edit/Dismiss cards. No PATCH fires until the rep approves each one individually.",
    },
    excluded_readonly: {
      items: excluded,
      notes:
        "Forecast-impacting fields. NEVER written, even on rep approval. Rep must edit them in Salesforce directly.",
    },
    summary: {
      auto_count: auto.length,
      suggest_count: suggest.length,
      excluded_readonly_count: excluded.length,
      payload_size_bytes: bodyJson.length,
    },
  };
}
