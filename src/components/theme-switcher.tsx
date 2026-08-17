"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, Contrast } from "lucide-react";
import { setThemePreference } from "@/app/theme-actions";
import { THEME_LABEL, type ThemeId } from "@/lib/theme";

const OPTIONS: { id: ThemeId; icon: typeof Sun }[] = [
  { id: "light", icon: Sun },
  { id: "slate", icon: Contrast },
  { id: "dark", icon: Moon },
];

// docs/product/05a-theme-system.md §3.2b: the choice belongs to the account,
// not the browser — every click persists server-side via setThemePreference.
// Applied to <html> immediately (no flash while the Server Action round-
// trips), then router.refresh() re-syncs the SSR-resolved value from the DB,
// the same source layout.tsx's own resolveTheme() reads.
export function ThemeSwitcher({
  current,
  surface = "chrome",
}: {
  current: ThemeId;
  /** Which token family to speak — "chrome" in the sidebar, "content" in the header. */
  surface?: "chrome" | "content";
}) {
  const [active, setActive] = useState(current);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function choose(theme: ThemeId) {
    setActive(theme);
    if (theme === "slate") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    startTransition(async () => {
      await setThemePreference(theme);
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex gap-0.5 rounded-[var(--r-md)] border p-0.5"
      style={
        surface === "chrome"
          ? { borderColor: "var(--chrome-border)", background: "var(--chrome-hover)" }
          : { borderColor: "var(--border)", background: "var(--surface-sunken)" }
      }
    >
      {OPTIONS.map(({ id, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={THEME_LABEL[id]}
            aria-label={THEME_LABEL[id]}
            disabled={pending}
            onClick={() => choose(id)}
            className="flex h-7 w-7 items-center justify-center rounded-[calc(var(--r-md)-2px)] transition-colors disabled:opacity-60"
            style={
              surface === "chrome"
                ? {
                    background: isActive ? "var(--chrome-active)" : "transparent",
                    color: isActive ? "var(--chrome-accent)" : "var(--chrome-muted)",
                  }
                : {
                    background: isActive ? "var(--accent-subtle)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
                  }
            }
          >
            <Icon size={15} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
