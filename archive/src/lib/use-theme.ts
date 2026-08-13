"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeId, type ThemeId } from "./theme";

/** Reads/writes the persisted theme choice and keeps `data-theme` on <html> in sync. */
export function useTheme(): [ThemeId, (next: ThemeId) => void] {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // Deliberately reads localStorage post-mount rather than via a lazy
  // useState initializer: the initial render must match the server's
  // DEFAULT_THEME to avoid a hydration mismatch (the no-flash swatch is
  // handled separately by the blocking inline script in layout.tsx that
  // sets data-theme on <html> before hydration).
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const resolved = isThemeId(stored)
      ? stored
      : document.documentElement.getAttribute("data-theme");
    if (isThemeId(resolved) && resolved !== DEFAULT_THEME) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (localStorage/DOM attribute) on mount, not derivable during render
      setThemeState(resolved);
    }
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  return [theme, setTheme];
}
