"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X, type LucideIcon } from "lucide-react";
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
 * CMP-19 (2026-09-15) — a named group of items, two levels only. The group
 * holding the current page opens; the rest start collapsed; a click toggles
 * and the choice is remembered per viewer. `id` is the storage key and must
 * be stable across renames.
 */
export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

const OPEN_GROUP_KEY = "ft.nav.openGroup";

/** The one group the viewer last opened by hand; "" means they folded everything. */
function readOpenGroup(): string | null {
  try {
    return window.localStorage.getItem(OPEN_GROUP_KEY);
  } catch {
    return null;
  }
}

function writeOpenGroup(id: string) {
  try {
    window.localStorage.setItem(OPEN_GROUP_KEY, id);
  } catch {
    /* a private window or blocked storage — the toggle still works for this page */
  }
}

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
  items: NavEntry[];
  /** The sidebar's section heading — the society's name, on the portal. */
  navLabel?: string;
  footerNote: string;
  /** Anything that sits beside the theme switcher (the demo toggle, on admin). */
  extras?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  // A navigation should always close whatever popover is open — otherwise
  // the identity dropdown from one page is still open, invisibly, on the
  // next, and the next tap on the avatar looks like it does nothing.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIdentityOpen(false);
  }

  // Sidebar/menu panel sit on chrome; the header sits on content surface.
  const sidebarBrandVariant = theme === "light" ? "light" : "dark";
  const headerBrandVariant = theme === "dark" ? "dark" : "light";
  const initial = (email[0] ?? "?").toUpperCase();

  const allItems = items.flatMap((e) => (isGroup(e) ? e.items : [e]));

  function matches(item: NavItem) {
    return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
  }

  // The most specific matching item is the active one — /admin/billing and
  // /admin/billing/deviations both prefix-match a deviation page, and only
  // the deeper one should light.
  function isActive(item: NavItem) {
    if (!matches(item)) return false;
    return !allItems.some((other) => other !== item && matches(other) && other.href.length > item.href.length);
  }

  // ONE group open at a time (user's call, 2026-09-15: several unfolded at
  // once "defeats the whole purpose"). The open group is the one holding the
  // current page until the viewer opens another, which folds it; the choice
  // is remembered per viewer and re-read after mount so the server and first
  // client render agree (a storage read in a useState initializer is the
  // hydration mismatch this codebase already hit once).
  const activeGroupId = items.find((e): e is NavGroup => isGroup(e) && e.items.some(isActive))?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // On a fresh load the group holding the current page wins; the
    // remembered choice only carries a fold/open made while staying put.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser storage after mount; there is no render-time source for it
    setOpenId(activeGroupId ?? readOpenGroup());
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; route changes are handled by the render-time adjustment below
  }, []);
  // A navigation into another group opens that group and folds the rest.
  const [lastActive, setLastActive] = useState(activeGroupId);
  if (activeGroupId !== lastActive) {
    setLastActive(activeGroupId);
    if (activeGroupId) {
      setOpenId(activeGroupId);
      writeOpenGroup(activeGroupId);
    }
  }

  function groupOpen(group: NavGroup): boolean {
    if (!hydrated) return group.id === activeGroupId;
    return (openId ?? activeGroupId) === group.id;
  }

  function toggleGroup(group: NavGroup) {
    const next = groupOpen(group) ? "" : group.id;
    setOpenId(next);
    writeOpenGroup(next);
  }

  const linkFor = (item: NavItem, onNavigate?: () => void, nested = false) => {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-[var(--r-md)] py-2.5 text-sm font-medium transition-colors ${nested ? "pl-9 pr-3.5" : "px-3.5"}`}
        style={{
          background: active ? "var(--chrome-active)" : "transparent",
          color: active ? "var(--chrome-accent)" : "var(--chrome-muted)",
        }}
      >
        {!nested && <Icon size={18} strokeWidth={1.75} aria-hidden />}
        {item.label}
      </Link>
    );
  };

  const navLinks = (onNavigate?: () => void) =>
    items.map((entry) => {
      if (!isGroup(entry)) return linkFor(entry, onNavigate);
      const open = groupOpen(entry);
      const withinActive = entry.items.some(isActive);
      const Icon = entry.icon;
      return (
        <div key={entry.id}>
          <button
            type="button"
            onClick={() => toggleGroup(entry)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3.5 py-2.5 text-sm font-medium transition-colors"
            style={{ color: withinActive ? "var(--chrome-text)" : "var(--chrome-muted)" }}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden />
            <span className="flex-1 text-left">{entry.label}</span>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              aria-hidden
              className="transition-transform"
              style={{ transform: open ? "rotate(180deg)" : "none", color: "var(--chrome-subtle)" }}
            />
          </button>
          {open && <div className="mt-0.5 space-y-0.5">{entry.items.map((item) => linkFor(item, onNavigate, true))}</div>}
        </div>
      );
    });

  const identity = (
    <div className="flex items-center gap-3">
      {extras}
      <ThemeSwitcher current={theme} surface="content" />
      <div aria-hidden className="h-6 w-px hidden sm:block" style={{ background: "var(--border)" }} />
      <div className="relative flex items-center gap-2.5">
        {/*
          Below `sm` the email + Sign out block used to be `hidden sm:block`
          — genuinely unreachable, not just visually tight: the avatar next
          to it was `aria-hidden` and carried no handler, so a mobile viewer
          had NO way to sign out or see who they were signed in as at all
          (user-caught, 2026-09-12). It is a real toggle button below `sm`
          now, opening a small dropdown carrying the same two facts; `sm`
          and up keep the original always-visible layout untouched, since
          nothing was broken there.
        */}
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold sm:pointer-events-none"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
          onClick={() => setIdentityOpen((v) => !v)}
          aria-expanded={identityOpen}
          aria-haspopup="true"
          aria-label={`Account menu — signed in as ${email}`}
        >
          {initial}
        </button>
        <div className="hidden sm:block leading-tight">
          <p className="text-[13px] font-semibold truncate max-w-[180px]" title={email}>
            {email}
          </p>
          <SignOutButton className="text-xs font-medium hover:opacity-80" style={{ color: "var(--text-muted)" }} />
        </div>
        {identityOpen && (
          <div
            className="sm:hidden absolute right-0 top-full z-30 mt-2 w-56 rounded-[var(--r-md)] border p-3"
            style={{ background: "var(--surface)", borderColor: "var(--border)", boxShadow: "var(--e2)" }}
          >
            <p className="text-[13px] font-semibold truncate" title={email}>
              {email}
            </p>
            <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
              <SignOutButton
                className="text-[13px] font-medium hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          </div>
        )}
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
        {/* min-h-0 + overflow-y-auto: a fixed, full-height flex column does not
            scroll on its own, so with several groups open the last items were
            clipped below the viewport (user-caught, 2026-09-15). The nav
            scrolls; the brand and the footer stay put. */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-4 pb-4" aria-label="Main">
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

      <div className="app-shell-content lg:pl-[264px]">
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
              className="lg:hidden px-4 pb-4 pt-2 space-y-1 max-h-[calc(100vh-64px)] overflow-y-auto"
              style={{ background: "var(--chrome)", borderTop: "1px solid var(--chrome-border)" }}
            >
              {navLinks(() => setOpen(false))}
            </div>
          )}
        </header>

        <main>
          <div className="app-shell-main mx-auto max-w-[1600px] p-5 sm:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
