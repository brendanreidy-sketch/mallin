/**
 * PrepGreeting — the warm-up bar at the top of every prep page.
 *
 *   Mallín logo · Hi {firstName} · {Account logo + name}
 *
 * The greeting is operator-quiet: no marketing copy, no "welcome
 * back," no time-of-day variations. One line, name only, fast scan.
 * Mallín's mark on the left grounds the surface as a Mallín product;
 * the account logo on the right anchors WHICH deal context the rep
 * is in — useful when reps juggle multiple briefs across the day.
 *
 * Server component — receives the rep's first name from the caller
 * (page.tsx looks up via Clerk's currentUser). Account logo is a
 * client component because Clearbit fetch happens browser-side.
 */

import MallinMark from "@/components/MallinMark";
import AccountLogo from "@/components/AccountLogo";
import ThemeModeToggle from "./ThemeModeToggle";
import s from "./prepGreeting.module.css";

interface PrepGreetingProps {
  /** Rep's first name (Clerk first_name). Falls back to "there" if
   *  Clerk hasn't given us one yet. */
  firstName?: string | null;
  /** Display name of the account this prep is for (e.g. "Flow"). */
  accountName: string;
  /** Account domain — drives the logo lookup (e.g. "flow.life"). */
  accountDomain?: string | null;
}

export default function PrepGreeting({
  firstName,
  accountName,
  accountDomain,
}: PrepGreetingProps) {
  const name = (firstName ?? "").trim();
  return (
    <header className={s.greeting} aria-label="Prep greeting">
      <div className={s.left}>
        <MallinMark size={24} surfaceColor="var(--ck-ink)" streamColor="var(--ck-blue-2)" />
        <span className={s.brand}>Mallín</span>
      </div>

      <div className={s.center}>
        <span className={s.hi}>Hi{name ? ` ${name}` : ""}</span>
      </div>

      <div className={s.right}>
        <ThemeModeToggle />
        <span className={s.divider} aria-hidden="true">·</span>
        <span className={s.accountLabel}>{accountName}</span>
        <AccountLogo name={accountName} domain={accountDomain} size={24} />
      </div>
    </header>
  );
}
