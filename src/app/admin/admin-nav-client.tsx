"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import type { ThemeId } from "@/lib/theme";

const BASE_LINKS = [
  { href: "/admin", label: "Portfolio" },
  { href: "/admin/societies", label: "Societies" },
  { href: "/admin/users", label: "Users" },
];
const PIPELINE_LINK = { href: "/admin/pipeline", label: "Leads" };

// Mobile gets a collapsed toggle rather than a wrapped multi-row bar — an
// earlier flex-wrap fix technically stopped content clipping, but on a
// narrow viewport it grew the header to 2-3 rows and pushed page content
// (e.g. a form) below the fold, which is its own real regression. Below
// `sm`, links + the theme switcher collapse behind a "Menu" toggle so the
// header stays one compact row by default, matching the archived shell's
// proven mobile pattern (archive/src/components/shell/Sidebar.tsx) even
// though this is a top bar, not that component's off-canvas sidebar.
export function AdminNavClient({ theme, showPipeline }: { theme: ThemeId; showPipeline: boolean }) {
  const [open, setOpen] = useState(false);
  const links = showPipeline ? [...BASE_LINKS, PIPELINE_LINK] : BASE_LINKS;

  return (
    <div className="mb-8 rounded-[var(--r-lg)]" style={{ background: "var(--chrome)", color: "var(--chrome-text)" }}>
      <div className="flex items-center justify-between px-4 sm:px-6 py-3">
        <BrandMark variant={theme === "light" ? "light" : "dark"} className="h-7" />

        <div className="hidden sm:flex items-center gap-6">
          <nav className="flex gap-4 text-sm font-medium">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:opacity-80" style={{ color: "var(--chrome-muted)" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <ThemeSwitcher current={theme} />
          <SignOutButton className="text-sm font-medium hover:opacity-80" style={{ color: "var(--chrome-muted)" }} />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle navigation menu"
          className="sm:hidden text-sm font-semibold"
          style={{ color: "var(--chrome-muted)" }}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div
          className="sm:hidden flex flex-col gap-3 px-4 pb-4 pt-3"
          style={{ borderTop: "1px solid var(--chrome-border)" }}
        >
          <nav className="flex flex-col gap-3 text-sm font-medium">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="hover:opacity-80"
                style={{ color: "var(--chrome-muted)" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <ThemeSwitcher current={theme} />
          <SignOutButton
            className="text-sm font-medium text-left hover:opacity-80"
            style={{ color: "var(--chrome-muted)" }}
          />
        </div>
      )}
    </div>
  );
}
