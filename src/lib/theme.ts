import type { Theme } from "@prisma/client";

export type ThemeId = Theme;

// docs/product/05a-theme-system.md §3.2b: Slate is the default on every
// surface, chosen by nobody. The un-stamped document already renders Slate
// (globals.css's bare :root) — this constant is for resolving a null DB
// preference, not for stamping an attribute.
export const DEFAULT_THEME: ThemeId = "slate";

export const THEME_IDS: ThemeId[] = ["light", "dark", "slate"];

export const THEME_LABEL: Record<ThemeId, string> = {
  light: "Light",
  dark: "Dark",
  slate: "Slate",
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as string[]).includes(value);
}
