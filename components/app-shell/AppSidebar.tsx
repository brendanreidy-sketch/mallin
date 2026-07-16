"use client";

/**
 * AppSidebar — the operating-layer navigation rail.
 *
 * Five surfaces (Home / Deals / Ask Mallín / Team / Knowledge) plus the
 * theme toggle, sign-out, and the signed-in rep. Active item is derived
 * from the current path. Styled via appShell.module.css on the shared
 * --ck-* tokens, so it's cream by default and flips to dark with the rest
 * of the app through the existing ThemeModeToggle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./appShell.module.css";
import MallinMark from "@/components/MallinMark";
import { AppSignOut } from "@/components/auth/sign-out-button";
import ThemeModeToggle from "@/app/prep/ThemeModeToggle";

type IconProps = { d: string };
function Icon({ d }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const NAV: { href: string; label: string; d: string }[] = [
  { href: "/cockpit", label: "Home", d: "M4 11l8-6 8 6v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" },
  { href: "/deals", label: "Deals", d: "M3.5 7a2 2 0 0 1 2-2h3.6l1.8 2h7.6a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" },
  { href: "/ask", label: "Ask Mallín", d: "M4.5 6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4.5 4z" },
  { href: "/coaching", label: "Team", d: "M9 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3.5 20a5.5 5.5 0 0 1 11 0M16 5.4a3.2 3.2 0 0 1 0 6.2M20.5 20a5.5 5.5 0 0 0-3.6-5.2" },
  { href: "/knowledge", label: "Knowledge", d: "M5 5.2A1.8 1.8 0 0 1 6.8 3.4H19v14.4H7a2 2 0 0 0-2 2zM7 17.8h12v2.8H6.8A1.8 1.8 0 0 1 5 18.8" },
];

export default function AppSidebar({
  name,
  initials,
}: {
  name: string | null;
  initials: string;
}) {
  const pathname = usePathname();
  return (
    <aside className={s.side}>
      <div className={s.logo}>
        <MallinMark size={22} surfaceColor="var(--ck-ink)" streamColor="var(--ck-blue-2)" />
        Mallín
      </div>
      {NAV.map((item) => {
        const active =
          item.href === "/cockpit"
            ? pathname === "/cockpit"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${s.nav} ${active ? s.navOn : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon d={item.d} />
            {item.label}
          </Link>
        );
      })}
      <div className={s.spacer} />
      <Link
        href="/settings/integrations"
        className={`${s.nav} ${pathname.startsWith("/settings") ? s.navOn : ""}`}
        aria-current={pathname.startsWith("/settings") ? "page" : undefined}
      >
        <Icon d="M11 4h2l.4 2.3a6 6 0 0 1 1.7.7l2-.9 1.4 1.4-.9 2a6 6 0 0 1 .7 1.7l2.3.4v2l-2.3.4a6 6 0 0 1-.7 1.7l.9 2-1.4 1.4-2-.9a6 6 0 0 1-1.7.7L13 20h-2l-.4-2.3a6 6 0 0 1-1.7-.7l-2 .9-1.4-1.4.9-2a6 6 0 0 1-.7-1.7L3.4 12v-2l2.3-.4a6 6 0 0 1 .7-1.7l-.9-2 1.4-1.4 2 .9a6 6 0 0 1 1.7-.7z M12 9.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" />
        Settings
      </Link>
      <div className={s.tools}>
        <ThemeModeToggle />
        <AppSignOut />
      </div>
      <div className={s.me}>
        <span className={s.avatar}>{initials}</span>
        {name ?? "You"}
      </div>
    </aside>
  );
}
