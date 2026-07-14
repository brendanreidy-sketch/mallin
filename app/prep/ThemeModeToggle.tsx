/**
 * ThemeModeToggle — one-click cream ⇄ dark switch in the greeting bar.
 *
 * The cockpit defaults to the cream (light) brand so it's a seamless
 * handoff from the marketing landing; this toggle flips to the dark
 * operating surface and back, persisting the choice. It writes the full
 * ThemeConfig (mode swapped, everything else preserved) through the
 * shared apply/save path.
 */

"use client";

import { useEffect, useState } from "react";
import { applyTheme, loadStoredTheme, saveStoredTheme } from "@/lib/theme/apply";
import { DEFAULT_THEME, type ThemeConfig } from "@/lib/theme/types";
import s from "./prepGreeting.module.css";

export default function ThemeModeToggle() {
  const [mode, setMode] = useState<ThemeConfig["mode"]>(DEFAULT_THEME.mode);

  // Sync the label to whatever theme is actually applied (stored choice
  // wins over the default). Runs after mount; ThemeProvider has already
  // applied the same stored theme, so there's no visual disagreement.
  useEffect(() => {
    setMode((loadStoredTheme() ?? DEFAULT_THEME).mode);
  }, []);

  function toggle() {
    const base = loadStoredTheme() ?? DEFAULT_THEME;
    const next: ThemeConfig = {
      ...base,
      mode: base.mode === "dark" ? "light" : "dark",
    };
    applyTheme(next);
    saveStoredTheme(next);
    setMode(next.mode);
  }

  return (
    <button
      type="button"
      className={s.customizeBtn}
      onClick={toggle}
      aria-label={mode === "dark" ? "Switch to cream theme" : "Switch to dark theme"}
      title={mode === "dark" ? "Switch to cream (light)" : "Switch to dark"}
    >
      {mode === "dark" ? "Cream" : "Dark"}
    </button>
  );
}
