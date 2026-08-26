"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import type { ThemeId } from "@/lib/theme";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

/**
 * The application chrome — a sectioned sidebar on a chrome surface and a
 * content-surface header carrying the theme switcher and the signed-in
 * identity (the NextAdmin/Modernize anatomy adopted 2026-08-17).
 *
 * It is shared rather than admin-only because the society portal now wears
 * the same shell (the user's ask, 2026-08-26: "give the portal user page the
 * same look as admin panel, similar left side menu"). The portal previously
 * had a row of pill tabs, which is a different navigation idiom on the same
 * product — and it had already overflowed a phone once. The only things that
 * differ between the two surfaces are the items, the section label and the
 * extras beside the theme switcher, so those are the props.
 */
export function NavShell({
  theme,
  email,
  items,
  navLabel = "Menu",
  footerNote,
  extras,
  children,
}: {
  theme: ThemeId;
  email: string;
  items: NavItem[];
  /** The sidebar's section heading — the society's name, on the portal. */
  navLabel?: string;
  footerNote: string;
  /** Anything that sits beside the theme switcher (the demo toggle, on admin). */
  extras?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Sidebar/menu panel sit on chrome; the header sits on content surface.
  const sidebarBrandVariant = theme === "light" ? "light" : "dark";
  const headerBrandVariant = theme === "dark" ? "dark" : "light";
  const initial = (email[0] ?? "?").toUpperCase();

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
  }

  const navLinks = (onNavigate?: () => void) =>
    items.map((item) => {
      const active = isActive(item);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className="flex items-center gap-3 rounded-[var(--r-md)] px-3.5 py-2.5 text-sm font-medium transition-colors"
          style={{
            background: active ? "var(--chrome-active)" : "transparent",
            color: active ? "var(--chrome-accent)" : "var(--chrome-muted)",
          }}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden />
          {item.label}
        </Link>
      );
    });

  const identity = (
    <div className="flex items-center gap-3">
      {extras}
      <ThemeSwitcher current={theme} surface="content" />
      <div aria-hidden className="h-6 w-px hidden sm:block" style={{ background: "var(--border)" }} />
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
        >
          {initial}
        </span>
        <div className="hidden sm:block leading-tight">
          <p className="text-[13px] font-semibold truncate max-w-[180px]" title={email}>
            {email}
          </p>
          <SignOutButton className="text-xs font-medium hover:opacity-80" style={{ color: "var(--text-muted)" }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] flex-col"
        style={{ background: "var(--chrome)", borderRight: "1px solid var(--chrome-border)" }}
      >
        <div className="px-6 pt-7 pb-6">
          <BrandMark variant={sidebarBrandVariant} className="h-7" />
        </div>
        <nav className="flex-1 px-4" aria-label="Main">
          <p
            className="px-3.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] truncate"
            style={{ color: "var(--chrome-subtle)" }}
            title={navLabel}
          >
            {navLabel}
          </p>
          <div className="space-y-1">{navLinks()}</div>
        </nav>
        <p className="px-6 py-5 text-[11px]" style={{ color: "var(--chrome-subtle)" }}>
          {footerNote}
        </p>
      </aside>

      <div className="lg:pl-[264px]">
        <header
          className="app-header sticky top-0 z-20"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            boxShadow: "0 1px 3px rgba(42, 53, 71, 0.04)",
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label="Toggle navigation menu"
                className="lg:hidden flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] border"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {open ? <X size={18} strokeWidth={1.75} /> : <Menu size={18} strokeWidth={1.75} />}
              </button>
              <span className="lg:hidden">
                <BrandMark variant={headerBrandVariant} className="h-6" />
              </span>
            </div>
            {identity}
          </div>

          {open && (
            <div
              className="lg:hidden px-4 pb-4 pt-2 space-y-1"
              style={{ background: "var(--chrome)", borderTop: "1px solid var(--chrome-border)" }}
            >
              {navLinks(() => setOpen(false))}
            </div>
          )}
        </header>

        <main>
          <div className="mx-auto max-w-[1600px] p-5 sm:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
