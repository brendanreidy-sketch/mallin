/**
 * Applies a ThemeConfig to the document root by setting CSS variables.
 *
 * Architecture: components read CSS vars (--accent-h, --density-scale,
 * etc.) and don't know about ThemeConfig. This decoupling is what
 * keeps the cognition contract stable across themes — the JSX and
 * component structure never change, only the visual primitives do.
 *
 * v0 wiring: high-impact CSS rules consume --accent-h / -s / -l and
 * --density-scale. Lower-impact dimensions (mode, fontFamily,
 * borderRadius) set their variables here but the existing CSS doesn't
 * read them yet — they're plumbed for forward compatibility. Each
 * one becomes visually active as the existing hardcoded values get
 * migrated to use the variables.
 *
 * No-op on server (window check) so this is safe to import in shared
 * code. Only applies on the client.
 */

import type { ThemeConfig } from "./types";

const STORAGE_KEY = "mallin.theme.v1";

const DENSITY_SCALE: Record<ThemeConfig["density"], number> = {
  compact: 0.85,
  comfortable: 1.0,
  spacious: 1.15,
};

const RADIUS_PX: Record<ThemeConfig["borderRadius"], string> = {
  sharp: "0",
  subtle: "4px",
  rounded: "10px",
  pill: "24px",
};

const FONT_FAMILY: Record<ThemeConfig["fontFamily"], string> = {
  system:
    'var(--font-system, system-ui), -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Charter", serif',
  mono: 'var(--font-jetbrains-mono), ui-monospace, "SF Mono", Menlo, monospace',
};

export function applyTheme(theme: ThemeConfig): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Accent color — split into HSL components so components can compose
  // alpha variants (rgba-style via hsla). The existing slate-blue
  // (#88b8d0) translates to roughly hsl(204, 40%, 67%).
  root.style.setProperty("--accent-h", String(theme.accent.hue));
  root.style.setProperty("--accent-s", `${theme.accent.saturation}%`);
  root.style.setProperty("--accent-l", `${theme.accent.lightness}%`);

  // Density scale — multiplier applied to padding/margin at major
  // surface containers (prep page, account intelligence, live coach).
  root.style.setProperty(
    "--density-scale",
    String(DENSITY_SCALE[theme.density]),
  );

  // Forward-plumbed variables (consumers retrofit over time).
  root.style.setProperty("--theme-radius", RADIUS_PX[theme.borderRadius]);
  root.style.setProperty("--theme-font-family", FONT_FAMILY[theme.fontFamily]);
  root.style.setProperty(
    "--theme-mode",
    theme.mode === "light" ? "light" : "dark",
  );

  // data-mode attribute on <html> so CSS can branch with selectors
  // like [data-mode='light'] when light mode rules land.
  root.setAttribute("data-mode", theme.mode);
}

export function loadStoredTheme(): ThemeConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Lightweight runtime check — re-export validateThemeConfig from
    // types when stored values need stricter audit. For now, accept
    // any well-formed object and let CSS variable application fall
    // back gracefully on bad values.
    if (parsed && typeof parsed === "object") return parsed as ThemeConfig;
    return null;
  } catch {
    return null;
  }
}

export function saveStoredTheme(theme: ThemeConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // localStorage may be unavailable (private browsing, quota). Silent
    // failure is appropriate — theme survives the current session via
    // the in-memory state in ThemeProvider; only persistence is lost.
  }
}

export function clearStoredTheme(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
