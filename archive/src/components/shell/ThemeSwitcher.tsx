"use client";

import { THEMES } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";

export default function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();

  return (
    <div className="flex gap-1 rounded-[10px] border border-border bg-card p-1">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-label={t.label}
          onClick={() => setTheme(t.id)}
          className="h-6 w-6 rounded-[7px]"
          style={{
            background: `linear-gradient(135deg, ${t.swatchA} 0 50%, ${t.swatchB} 50% 100%)`,
            border: theme === t.id ? "2px solid var(--ac)" : "2px solid transparent",
          }}
        />
      ))}
    </div>
  );
}
