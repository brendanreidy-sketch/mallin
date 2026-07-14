/**
 * SyncChip — visible CRM sync state on every rep note.
 *
 * Required by the write-through doctrine: every saved write carries a
 * visible status (Syncing / Synced / Pending retry / Failed). The rep
 * never has to guess whether their contribution landed in CRM.
 *
 * Provider label resolved from tenant.crm_provider — shown as
 * "Synced to HubSpot" / "Synced to Salesforce" / etc. Provider-neutral
 * at the component level; the string is just a render-time format.
 */

"use client";

import s from "./repNotes.module.css";
import type { RepNoteSyncStatus } from "@/lib/notes/types";

interface SyncChipProps {
  status: RepNoteSyncStatus;
  providerLabel?: string | null; // e.g. "HubSpot", "Salesforce"
  retryCount?: number;
  failedReason?: string | null;
  onRetry?: () => void;
}

function providerDisplay(label?: string | null): string {
  if (!label) return "CRM";
  // Title-case provider names: "hubspot" → "HubSpot", "salesforce" → "Salesforce"
  return label
    .split(/[\s_-]+/)
    .map((w) =>
      w.length === 0
        ? w
        : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function SyncChip({
  status,
  providerLabel,
  retryCount,
  failedReason,
  onRetry,
}: SyncChipProps) {
  const provider = providerDisplay(providerLabel);

  if (status === "syncing") {
    return (
      <span
        className={`${s.syncChip} ${s.syncSyncing}`}
        role="status"
        aria-live="polite"
      >
        <span className={s.syncDot} aria-hidden="true" />
        <span>Syncing to {provider}…</span>
      </span>
    );
  }
  if (status === "synced") {
    return (
      <span
        className={`${s.syncChip} ${s.syncSynced}`}
        title="Note written to your CRM under existing permissions"
      >
        <span className={s.syncDot} aria-hidden="true" />
        <span>✓ Synced to {provider}</span>
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span
        className={`${s.syncChip} ${s.syncPending}`}
        title="Saved in Mallín; sync to CRM is queued"
      >
        <span className={s.syncDot} aria-hidden="true" />
        <span>
          ⏳ Pending sync · {provider}
          {onRetry && (
            <button
              type="button"
              className={s.syncRetry}
              onClick={onRetry}
              aria-label="Retry sync now"
            >
              retry
            </button>
          )}
        </span>
      </span>
    );
  }
  // failed
  return (
    <>
      <span
        className={`${s.syncChip} ${s.syncFailed}`}
        title={failedReason ?? "Sync failed"}
      >
        <span className={s.syncDot} aria-hidden="true" />
        <span>
          ✗ Sync failed
          {typeof retryCount === "number" && retryCount > 0 && ` · ${retryCount} attempt${retryCount === 1 ? "" : "s"}`}
          {onRetry && (
            <button
              type="button"
              className={s.syncRetry}
              onClick={onRetry}
              aria-label="Retry sync"
            >
              retry
            </button>
          )}
        </span>
      </span>
    </>
  );
}
