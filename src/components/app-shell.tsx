"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Target,
  Activity,
  SignalHigh,
  Gauge,
  HardHat,
  Lightbulb,
  Receipt,
  Users,
  Menu,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { DemoModeToggle } from "@/components/demo-mode-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import type { ThemeId } from "@/lib/theme";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

// Theme-experiment shell (2026-08-17): the NextAdmin/Modernize anatomy, not
// just their palette — a content-surface top header carrying the theme
// switcher and the signed-in identity, and a sectioned sidebar whose active
// item is a full pill. The sidebar speaks chrome tokens (navy in Slate,
// white in Light, black in Dark); the header speaks content tokens, which
// is exactly how NextAdmin pairs a white header with a navy sidebar.
export function AppShell({
  theme,
  email,
  showPipeline,
  showField,
  showMonitoring,
  showReadings,
  showCatalog,
  showUsers,
  showBilling,
  demoMode = false,
  demoAvailable = false,
  children,
}: {
  theme: ThemeId;
  email: string;
  demoMode?: boolean;
  /** DEMO_MODE is set in the environment, so the toggle may render. */
  demoAvailable?: boolean;
  showPipeline: boolean;
  showField: boolean;
  showMonitoring: boolean;
  showReadings: boolean;
  showCatalog: boolean;
  showUsers: boolean;
  showBilling: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    { href: "/admin", label: "Portfolio", icon: LayoutDashboard, exact: true },
    // Everyone has appointments — meetings for sales, visits for the field —
    // so this is not permission-gated (the user's call, 2026-08-25: one
    // schedule module, visible to everyone as their own calendar).
    { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/admin/societies", label: "Societies", icon: Building2 },
    ...(showPipeline ? [{ href: "/admin/pipeline", label: "Leads & pipeline", icon: Target }] : []),
    // Two tabs, not one: a circuit chasing a benchmark and a society holding
    // one are different questions with different cadences (2026-08-21).
    // The field team's own list — they do not get the deal (2026-08-24).
    ...(showField ? [{ href: "/admin/field", label: "Field work", icon: HardHat }] : []),
    ...(showMonitoring
      ? [{ href: "/admin/demo-monitoring", label: "Demo monitoring", icon: Activity }]
      : []),
    ...(showMonitoring
      ? [{ href: "/admin/live-monitoring", label: "Live monitoring", icon: SignalHigh }]
      : []),
    ...(showReadings ? [{ href: "/admin/readings", label: "Readings", icon: Gauge }] : []),
    ...(showCatalog ? [{ href: "/admin/device-catalog", label: "Device catalog", icon: Lightbulb }] : []),
    ...(showBilling ? [{ href: "/admin/billing", label: "Billing", icon: Receipt }] : []),
    ...(showUsers ? [{ href: "/admin/users", label: "Admin users", icon: Users }] : []),
  ];

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
      {demoAvailable && <DemoModeToggle on={demoMode} surface="content" />}
      <ThemeSwitcher current={theme} surface="content" />
      <div
        aria-hidden
        className="h-6 w-px hidden sm:block"
        style={{ background: "var(--border)" }}
      />
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
          <SignOutButton
            className="text-xs font-medium hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* sidebar — chrome surface, NextAdmin anatomy */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] flex-col"
        style={{ background: "var(--chrome)", borderRight: "1px solid var(--chrome-border)" }}
      >
        <div className="px-6 pt-7 pb-6">
          <BrandMark variant={sidebarBrandVariant} className="h-7" />
        </div>
        <nav className="flex-1 px-4" aria-label="Main">
          <p
            className="px-3.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "var(--chrome-subtle)" }}
          >
            Menu
          </p>
          <div className="space-y-1">{navLinks()}</div>
        </nav>
        <p className="px-6 py-5 text-[11px]" style={{ color: "var(--chrome-subtle)" }}>
          FirsThing · verified savings
        </p>
      </aside>

      <div className="lg:pl-[264px]">
        {/* header — content surface, like NextAdmin's white bar over a navy rail */}
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

          {/* mobile nav panel — chrome, matching the sidebar it stands in for */}
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
          {/* No demo ribbon here. Two stacked amber bars — this one and whatever
              the page itself is warning about — is one too many, and the
              toggle in the header carries the same signal (user's call,
              2026-08-21). It pulses while demo mode is on, so a screenshot
              still shows the mode it was taken in. */}
          <div className="mx-auto max-w-[1600px] p-5 sm:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
