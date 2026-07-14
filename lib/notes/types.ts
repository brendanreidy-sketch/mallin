/**
 * ============================================================================
 *  Rep notes — neutral types
 * ============================================================================
 *
 *  These types describe rep-authored notes from Mallin's perspective:
 *  the cached body, the sync state, the Mallin-only metadata. They do
 *  NOT carry any CRM-provider identifying fields beyond the generic
 *  `external_activity_id` + `sync_status`. Provider routing happens via
 *  tenants.crm_provider + lib/crm/router.ts.
 *
 *  Doctrine:
 *    - memory:write_through_operating_layer.md (CRM is governed record)
 *    - memory:write_through_surface_contract.md (6 rules + provider
 *      neutrality + 8-box PR review)
 * ============================================================================
 */

export type RepNoteAttachTo = "deal" | "account";

export type RepNoteSyncStatus =
  | "pending"   // queued for sync, not yet attempted
  | "syncing"   // adapter call in flight
  | "synced"   // CRM accepted; external_activity_id set
  | "failed";   // adapter returned an error; retry_count incremented

export interface RepNote {
  id: string;
  tenant_id: string;

  // Mallin-side linkage
  opportunity_id: string | null;
  account_id: string | null;
  section_key: string | null;

  // Author
  created_by_user_id: string;
  created_by_email: string | null;

  // Body — cached from CRM as authoritative source (see migration 015)
  body: string;

  // Attachment target (which CRM object the write-through lands on)
  attach_to: RepNoteAttachTo;

  // Mallin-only metadata
  is_pattern: boolean;
  is_private: boolean;

  // CRM sync state (provider-neutral)
  sync_status: RepNoteSyncStatus;
  external_activity_id: string | null;
  external_object_type: string | null;
  last_sync_at: string | null;
  failed_reason: string | null;
  retry_count: number;

  created_at: string;
  updated_at: string;
}

/** Inputs accepted when a rep creates a new note from the cockpit. */
export interface CreateRepNoteInput {
  /** Required — the rep types this in. Plain text or simple HTML. */
  body: string;
  /** What in the CRM this attaches to. */
  attach_to: RepNoteAttachTo;
  /**
   * Optional — when set, the note attaches to the deal AND we link to it
   * on the Mallin side for fast queries by deal. Required when
   * attach_to === "deal".
   */
  opportunity_id?: string | null;
  /**
   * Optional — when set, the note attaches to the account AND we link
   * to it on the Mallin side. Required when attach_to === "account".
   */
  account_id?: string | null;
  /** Optional brief section the note was added to ('primary-focus' etc). */
  section_key?: string | null;
  /** Mallin-only metadata. */
  is_pattern?: boolean;
  is_private?: boolean;
}

/** Inputs accepted when editing an existing note. All fields optional. */
export interface UpdateRepNoteInput {
  body?: string;
  is_pattern?: boolean;
  is_private?: boolean;
}

/** Response shape returned to the cockpit. Sync state is always visible. */
export interface RepNoteResponse {
  note: RepNote;
}

export interface RepNoteListResponse {
  notes: RepNote[];
}
