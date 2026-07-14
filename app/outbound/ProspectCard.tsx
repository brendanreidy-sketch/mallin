"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./outbound.module.css";
import type { Prospect } from "@/lib/sdr/outbound/sourcing-agent";

/**
 * One prospect as a compact worklist ROW — scan-and-clear, not a card to study.
 * Collapsed: fit dot + company + contact + trigger + quick Approve/Skip. Click
 * the row to expand the drafted first touch + LinkedIn/email. Posts to
 * /api/outbound/approve; the server resolves the autonomy disposition. Send is
 * STUBBED everywhere; nothing here hits an email API.
 */

const RESOLVED = new Set(["skipped", "queued_send", "approved", "held", "sent"]);

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  skipped: "Skipped",
  queued_send: "Queued to send",
  held: "Held (draft)",
  sent: "Sent",
};

const DOT_COLOR: Record<string, string> = {
  strong: "#2e7d5b",
  plausible: "#b98900",
  weak: "#9aa3b3",
};

export default function ProspectCard({
  id,
  prospect,
  status,
}: {
  id: string;
  prospect: Prospect;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState(status);
  const [open, setOpen] = useState(false);

  const resolved = RESOLVED.has(localStatus);
  const contact = prospect.contact;

  async function act(action: "approve" | "skip") {
    setBusy(true);
    try {
      const res = await fetch("/api/outbound/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.status) setLocalStatus(data.status as string);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.row} ${resolved ? styles.rowResolved : ""}`}>
      <div
        className={styles.rowHead}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
      >
        <span
          className={styles.rowDot}
          style={{ background: DOT_COLOR[prospect.confidence] ?? "#9aa3b3" }}
          aria-hidden="true"
        />
        <span className={styles.rowCompany}>{prospect.company}</span>
        <span className={styles.rowContact}>
          {contact.name} · {contact.role}
        </span>
        <span className={styles.rowTrigger}>{prospect.trigger_event}</span>
        {resolved ? (
          <span className={styles.statusPill}>
            {STATUS_LABEL[localStatus] ?? localStatus}
          </span>
        ) : (
          <span className={styles.rowActions}>
            <button
              type="button"
              className={styles.rowApprove}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                act("approve");
              }}
            >
              {busy ? "…" : "Approve"}
            </button>
            <button
              type="button"
              className={styles.rowSkip}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                act("skip");
              }}
            >
              Skip
            </button>
          </span>
        )}
        <span className={styles.rowChevron} aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </div>

      {open && (
        <div className={styles.rowBody}>
          <div className={styles.contactLine}>
            {contact.linkedin_url ? (
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            ) : null}
            {contact.email_guess ? (
              <>
                {contact.linkedin_url ? " · " : ""}
                {contact.email_guess}{" "}
                <span style={{ color: "#b98900" }}>(unverified)</span>
              </>
            ) : null}
          </div>
          <div className={styles.triggerLine}>
            <span className={styles.triggerLabel}>Trigger:</span> {prospect.trigger_event}
          </div>
          <p className={styles.draft}>{prospect.first_touch}</p>
        </div>
      )}
    </div>
  );
}
