/**
 * AppShell — sidebar + content wrapper for the operating-layer surfaces.
 *
 * Server component. Applies the stored theme (ThemeProvider) so cream/dark
 * is consistent on first paint, renders the AppSidebar rail, and lays out
 * the page content. Each surface renders <AppShell> around its own body.
 */

import type { ReactNode } from "react";
import s from "./appShell.module.css";
import AppSidebar from "./AppSidebar";
import ThemeProvider from "@/app/prep/ThemeProvider";

export default function AppShell({
  name,
  initials,
  topbar,
  children,
}: {
  name: string | null;
  initials: string;
  topbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={s.shell}>
      <ThemeProvider />
      <AppSidebar name={name} initials={initials} />
      <div className={s.main}>
        {topbar ? <div className={s.topbar}>{topbar}</div> : null}
        <div className={s.body}>{children}</div>
      </div>
    </div>
  );
}
