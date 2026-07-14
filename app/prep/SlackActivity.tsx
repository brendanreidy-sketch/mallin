/**
 * SlackActivity — server component. Shows the recent outbound Slack
 * posts Mallín made on this deal's behalf. Reads from
 * slack_outbound_posts via lib/db/load-slack-activity.
 *
 * Empty state matters: most reps haven't received Slack alerts for
 * their deals yet (the panel is new + the audit is new). The empty
 * state says so explicitly rather than rendering a confusing void.
 *
 * Reach into Slack: "Open →" link uses the audit's channel_id +
 * message_ts when available. If not, we just show the row without a
 * link.
 */
import {
  buildSlackDeepLink,
  loadSlackActivityForDeal,
  type SlackActivityRow,
} from "@/lib/db/load-slack-activity";
import s from "./slackActivity.module.css";

export interface SlackActivityProps {
  /** Candidate IDs that may match opportunity_id in slack_outbound_posts.
   *  Pass both substrate UUID and external CRM id when known. */
  candidateIds: string[];
}

export default async function SlackActivity({
  candidateIds,
}: SlackActivityProps) {
  const rows = await loadSlackActivityForDeal(candidateIds, {
    limit: 10,
    sinceDays: 7,
  });

  return (
    <section
      id="cockpit-slack"
      className={s.section}
      aria-label="Slack activity"
    >
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>SLACK ACTIVITY</div>
          <h3 className={s.title}>
            What Mallín posted on your behalf · last 7 days
          </h3>
        </div>
        <div className={s.count}>
          {rows.length} {rows.length === 1 ? "post" : "posts"}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className={s.empty}>
          No Slack activity on this deal in the last 7 days. When a
          verification alert fires, Mallín posts it here and to the
          deal&apos;s Slack thread.
        </p>
      ) : (
        <div className={s.list}>
          {rows.map((r) => (
            <ActivityRow key={r.id} row={r} />
          ))}
        </div>
      )}

      <footer className={s.footer}>
        <span className={s.footerHint}>
          Toggle in <a href="/settings/integrations" className={s.footerLink}>
            Settings → Integrations
          </a>{" "}
          to also post to Microsoft Teams.
        </span>
      </footer>
    </section>
  );
}

function ActivityRow({ row }: { row: SlackActivityRow }) {
  const when = formatWhen(row.posted_at);
  const deepLink = buildSlackDeepLink(row);
  return (
    <article
      className={`${s.row} ${row.ok ? "" : s.rowFailed}`}
    >
      <div className={s.when}>{when}</div>
      <div className={s.body}>
        <span className={s.target}>
          {row.surface === "dm" ? row.channel ?? "DM" : row.channel ?? "#channel"}
        </span>
        <span className={s.text}>
          {row.ok ? row.payload_summary : `✗ Failed: ${row.payload_summary}`}
        </span>
      </div>
      {deepLink ? (
        <a className={s.open} href={deepLink} target="_blank" rel="noreferrer">
          Open →
        </a>
      ) : row.error ? (
        <span className={s.errorTag} title={row.error}>
          error
        </span>
      ) : null}
    </article>
  );
}

/** Compact relative-time formatter: 14m / 3h / 2d. Falls back to ISO date for
 *  anything older than 7 days (the query caps at 7, but defensive). */
function formatWhen(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}d ago`;
  return iso.slice(0, 10);
}
