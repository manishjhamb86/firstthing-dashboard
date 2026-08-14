import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { resolveTheme } from "@/lib/resolve-theme";

// Minimal, not the approved theme system's full shell (05a-theme-system.md
// §3.7's component list) — that's a larger lift than this milestone needs.
// What IS adopted: the chrome tokens (§3.2b) and the theme switcher itself,
// since a switcher with nothing to switch is not actually a switcher.
export async function AdminNav() {
  const theme = await resolveTheme();

  return (
    <div
      className="flex items-center justify-between px-6 py-3 mb-8 rounded-[var(--r-lg)]"
      style={{ background: "var(--chrome)", color: "var(--chrome-text)" }}
    >
      <BrandMark variant={theme === "light" ? "light" : "dark"} className="h-7" />
      <div className="flex items-center gap-6">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/admin" className="hover:opacity-80" style={{ color: "var(--chrome-muted)" }}>
            Portfolio
          </Link>
          <Link href="/admin/societies" className="hover:opacity-80" style={{ color: "var(--chrome-muted)" }}>
            Societies
          </Link>
          <Link href="/admin/users" className="hover:opacity-80" style={{ color: "var(--chrome-muted)" }}>
            Users
          </Link>
        </nav>
        <ThemeSwitcher current={theme} />
      </div>
    </div>
  );
}
