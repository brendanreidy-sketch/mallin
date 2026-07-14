"use client";

/**
 * ============================================================================
 *  LinkActions — Confirm match / Unlink buttons
 * ============================================================================
 *
 *  Minimal client component. Wraps the POST/DELETE /api/sf/confirm-match
 *  endpoints. No Salesforce writes are involved — these only touch the
 *  substrate's sf_opportunity_links table.
 *
 *  After a successful action, calls router.refresh() so the server
 *  component re-fetches and re-renders with the updated link state.
 * ============================================================================
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./diff.module.css";

interface ConfirmButtonProps {
  dealId: string;
  sfOppId: string;
  /** When true, the API will soft-unlink any existing different link
   *  before creating this one. Used in the "you previously confirmed
   *  another opp" scenario. */
  replace?: boolean;
  label?: string;
}

export function ConfirmMatchButton({
  dealId,
  sfOppId,
  replace,
  label,
}: ConfirmButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/sf/confirm-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, sfOppId, replace: !!replace }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? `HTTP ${res.status}`);
        return;
      }
      // Refresh the server component so the link banner updates.
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={handleClick}
        disabled={busy || isPending}
        className={styles.linkButton}
      >
        {busy || isPending
          ? "Saving…"
          : (label ?? (replace ? "Replace previous link" : "Confirm match"))}
      </button>
      {error ? (
        <span className={styles.linkError}>{error}</span>
      ) : null}
    </span>
  );
}

interface UnlinkButtonProps {
  dealId: string;
  label?: string;
}

export function UnlinkButton({ dealId, label }: UnlinkButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleUnlink() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/sf/confirm-match?dealId=${encodeURIComponent(dealId)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#8a8a93" }}>
          Are you sure?
        </span>
        <button
          onClick={handleUnlink}
          disabled={busy}
          className={styles.linkButtonDanger}
        >
          {busy ? "Unlinking…" : "Yes, unlink"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className={styles.linkButtonSubtle}
        >
          Cancel
        </button>
        {error ? <span className={styles.linkError}>{error}</span> : null}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={busy || isPending}
      className={styles.linkButtonSubtle}
    >
      {label ?? "Unlink"}
    </button>
  );
}
