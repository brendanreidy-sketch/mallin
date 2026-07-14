"use client";

/**
 * ActionQueue — the cockpit's "approve in batch" surface.
 *
 * Renders pending queue items + recently-actioned (last 24h) for this
 * deal. Per-item: Approve / Defer / Dismiss. Bulk: select multiple
 * with checkboxes, then "Approve N selected" / "Dismiss N selected" /
 * "Defer N selected".
 *
 * Status badges show item lifecycle. Executed items render with the
 * "Open in <system>" deep link when the executor produced one.
 *
 * The panel is intentionally simple: it does not try to be a real-time
 * inbox. After any mutation we router.refresh() to re-fetch from the
 * server. Optimistic local state would feel snappier but complicates
 * error handling — defer to v2.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { QueuedAction } from "@/lib/action-queue/types";
import s from "./actionQueue.module.css";

export interface ActionQueueProps {
  items: QueuedAction[];
}

const ACTION_LABELS: Record<QueuedAction["action_type"], string> = {
  crm_update: "CRM update",
  email_send: "Email send",
  email_draft: "Email draft",
  risk_ack: "Risk acknowledgment",
  manager_escalate: "Manager escalation",
  deferral: "Deferral",
};

const STATUS_LABELS: Record<QueuedAction["status"], string> = {
  queued: "Pending",
  approved_pending: "Approving…",
  executed: "Executed",
  failed: "Failed",
  dismissed: "Dismissed",
  deferred: "Deferred",
};

export default function ActionQueue({ items }: ActionQueueProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{
    kind: "ok" | "err";
    message: string;
  } | null>(null);

  // Group: pending items at the top, then deferred, then recently-actioned
  const pendingItems = items.filter(
    (i) => i.status === "queued" || i.status === "approved_pending",
  );
  const deferredItems = items.filter((i) => i.status === "deferred");
  const actionedItems = items.filter(
    (i) =>
      i.status === "executed" ||
      i.status === "failed" ||
      i.status === "dismissed",
  );

  const pendingIds = new Set(pendingItems.map((i) => i.id));
  const selectedPending = Array.from(selected).filter((id) => pendingIds.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPending() {
    setSelected(new Set(pendingItems.map((i) => i.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function postJson(path: string, body: unknown): Promise<Response> {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function approve(ids: string[]) {
    if (ids.length === 0) return;
    const res = await postJson("/api/queue/approve", { ids });
    const json = await res.json();
    if (json.ok) {
      setBanner({
        kind: "ok",
        message: `✓ ${ids.length} item${ids.length === 1 ? "" : "s"} approved + executed`,
      });
    } else {
      const fails = (json.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      setBanner({
        kind: "err",
        message: `${ids.length - fails.length} of ${ids.length} succeeded. ${fails.length} failed — check below.`,
      });
    }
    clearSelection();
    router.refresh();
  }

  async function dismissBatch(ids: string[]) {
    if (ids.length === 0) return;
    await postJson("/api/queue/dismiss", { ids });
    setBanner({
      kind: "ok",
      message: `${ids.length} item${ids.length === 1 ? "" : "s"} dismissed`,
    });
    clearSelection();
    router.refresh();
  }

  async function deferOne(id: string, deferUntilIso: string) {
    await postJson("/api/queue/defer", { id, defer_until: deferUntilIso });
    setBanner({ kind: "ok", message: "Item deferred" });
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <section
        id="cockpit-queue"
        className={s.section}
        aria-label="Action queue"
      >
        <header className={s.head}>
          <div>
            <div className={s.eyebrow}>ACTION QUEUE</div>
            <h3 className={s.title}>Empty</h3>
          </div>
        </header>
        <p className={s.empty}>
          Queue is empty. Items land here when you click 📋 Queue on a CRM
          suggestion, email draft, or risk card.
        </p>
      </section>
    );
  }

  return (
    <section id="cockpit-queue" className={s.section} aria-label="Action queue">
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>ACTION QUEUE</div>
          <h3 className={s.title}>
            {pendingItems.length} pending
            {deferredItems.length > 0 ? ` · ${deferredItems.length} deferred` : ""}
          </h3>
        </div>
        {pendingItems.length > 0 ? (
          <div className={s.bulkActions}>
            {selectedPending.length > 0 ? (
              <>
                <button
                  className={s.btnPrimary}
                  disabled={pending}
                  onClick={() => startTransition(() => approve(selectedPending))}
                >
                  ✓ Approve {selectedPending.length} selected
                </button>
                <button
                  className={s.btnSecondary}
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => dismissBatch(selectedPending))
                  }
                >
                  Dismiss {selectedPending.length}
                </button>
                <button className={s.btnTertiary} onClick={clearSelection}>
                  Clear
                </button>
              </>
            ) : (
              <>
                <button
                  className={s.btnPrimary}
                  disabled={pending}
                  onClick={() =>
                    startTransition(() =>
                      approve(pendingItems.map((i) => i.id)),
                    )
                  }
                >
                  ✓ Approve all {pendingItems.length}
                </button>
                <button className={s.btnTertiary} onClick={selectAllPending}>
                  Select all
                </button>
              </>
            )}
          </div>
        ) : null}
      </header>

      {banner ? (
        <div className={banner.kind === "ok" ? s.bannerOk : s.bannerErr}>
          {banner.message}
        </div>
      ) : null}

      <ul className={s.list}>
        {pendingItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            checked={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
            onApprove={() => startTransition(() => approve([item.id]))}
            onDismiss={() => startTransition(() => dismissBatch([item.id]))}
            onDefer={(iso) => startTransition(() => deferOne(item.id, iso))}
            disabled={pending}
          />
        ))}

        {deferredItems.length > 0 ? (
          <li className={s.groupHead}>Deferred</li>
        ) : null}
        {deferredItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            checked={false}
            onToggle={() => {}}
            onApprove={() => startTransition(() => approve([item.id]))}
            onDismiss={() => startTransition(() => dismissBatch([item.id]))}
            onDefer={() => {}}
            disabled={pending}
            hideCheckbox
          />
        ))}

        {actionedItems.length > 0 ? (
          <li className={s.groupHead}>Recent (last 24h)</li>
        ) : null}
        {actionedItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            checked={false}
            onToggle={() => {}}
            onApprove={() => {}}
            onDismiss={() => {}}
            onDefer={() => {}}
            disabled
            hideCheckbox
            hideActions
          />
        ))}
      </ul>
    </section>
  );
}

// ─── Per-row ───────────────────────────────────────────────────────────────
interface ItemRowProps {
  item: QueuedAction;
  checked: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onDismiss: () => void;
  onDefer: (deferUntilIso: string) => void;
  disabled: boolean;
  hideCheckbox?: boolean;
  hideActions?: boolean;
}

function ItemRow({
  item,
  checked,
  onToggle,
  onApprove,
  onDismiss,
  onDefer,
  disabled,
  hideCheckbox,
  hideActions,
}: ItemRowProps) {
  const summary = describeItem(item);
  const statusClass =
    item.status === "executed"
      ? s.statusOk
      : item.status === "failed"
        ? s.statusErr
        : item.status === "dismissed"
          ? s.statusDismissed
          : item.status === "deferred"
            ? s.statusDeferred
            : s.statusPending;

  return (
    <li className={s.row}>
      {!hideCheckbox ? (
        <input
          type="checkbox"
          className={s.checkbox}
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          aria-label={`Select ${ACTION_LABELS[item.action_type]}`}
        />
      ) : (
        <span className={s.checkboxSpacer} />
      )}

      <div className={s.body}>
        <div className={s.rowHead}>
          <span className={s.actionType}>{ACTION_LABELS[item.action_type]}</span>
          <span className={`${s.statusChip} ${statusClass}`}>
            {STATUS_LABELS[item.status]}
          </span>
        </div>
        <div className={s.summary}>{summary}</div>
        {item.rationale ? (
          <div className={s.rationale}>{item.rationale}</div>
        ) : null}
        {item.error ? <div className={s.errorText}>✗ {item.error}</div> : null}
        {item.external_object_url ? (
          <a
            className={s.openLink}
            href={item.external_object_url}
            target="_blank"
            rel="noreferrer"
          >
            Open in {prettyExternalType(item.external_object_type)} →
          </a>
        ) : null}
      </div>

      {!hideActions ? (
        <div className={s.actions}>
          <button
            className={s.btnApply}
            onClick={onApprove}
            disabled={disabled}
            title="Approve and execute now"
          >
            ✓ Approve
          </button>
          <button
            className={s.btnDefer}
            onClick={() => onDefer(tomorrowIso())}
            disabled={disabled}
            title="Snooze until tomorrow"
          >
            ⏰ Tomorrow
          </button>
          <button
            className={s.btnDismiss}
            onClick={onDismiss}
            disabled={disabled}
            title="Dismiss permanently"
          >
            ✗
          </button>
        </div>
      ) : null}
    </li>
  );
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function prettyExternalType(t: string | null): string {
  if (!t) return "Mallín";
  if (t.startsWith("gmail.")) return "Gmail";
  if (t.startsWith("salesforce.")) return "Salesforce";
  if (t.startsWith("hubspot.")) return "HubSpot";
  if (t.startsWith("slack.")) return "Slack";
  if (t.startsWith("mallin.")) return "Mallín";
  return t;
}

function describeItem(item: QueuedAction): string {
  const p = item.payload;
  switch (p.type) {
    case "crm_update":
      return `${p.field_label} → ${truncate(p.value, 120)}`;
    case "email_send":
      return `Send "${truncate(p.subject, 100)}" to ${p.to}`;
    case "email_draft":
      return `Draft "${truncate(p.subject, 100)}" to ${p.to}`;
    case "risk_ack":
      return `Ack risk "${p.risk_title}": ${truncate(p.action_taken, 100)}`;
    case "manager_escalate":
      return `Notify manager: ${truncate(p.reason, 120)}`;
    case "deferral":
      return `Defer until ${p.defer_until}`;
    default:
      return JSON.stringify(p).slice(0, 200);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
