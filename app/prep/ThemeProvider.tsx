/**
 * ThemeProvider — loads the user's stored theme on mount and applies
 * it to document.documentElement.
 *
 * Renders nothing. Lives near the top of the prep page tree (above
 * the greeting) so theme application runs before any visible content
 * mounts. Race window between SSR render and client mount produces a
 * brief flash of default theme — acceptable for v0; mitigatable later
 * via inline <script> in <head> that applies the theme before React
 * hydrates (the typical FOUC fix for client-side theming).
 */

"use client";

import { useEffect } from "react";
import { applyTheme, loadStoredTheme } from "@/lib/theme/apply";
import { DEFAULT_THEME } from "@/lib/theme/types";

export default function ThemeProvider() {
  useEffect(() => {
    const stored = loadStoredTheme();
    applyTheme(stored ?? DEFAULT_THEME);
  }, []);

  return null;
}
