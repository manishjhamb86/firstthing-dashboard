"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, Target, Activity, Gauge, Lightbulb, Users, Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import type { ThemeId } from "@/lib/theme";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

// The sidebar nav is 05a-theme-system.md §3.7's own component ("sidebar nav
// with counts"), replacing the top bar the previous shell shipped as an
// explicit placeholder. Chrome tokens throughout — in Slate/Dark the shell
// is dark, in Light it's white; content-side tokens never appear here.
export function AppShell({
  theme,
  email,
  showPipeline,
  showMonitoring,
  showReadings,
  showCatalog,
  showUsers,
  children,
}: {
  theme: ThemeId;
  email: string;
  showPipeline: boolean;
  showMonitoring: boolean;
  showReadings: boolean;
  showCatalog: boolean;
  showUsers: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    { href: "/admin", label: "Portfolio", icon: LayoutDashboard, exact: true },
    { href: "/admin/societies", label: "Societies", icon: Building2 },
    ...(showPipeline ? [{ href: "/admin/pipeline", label: "Leads & pipeline", icon: Target }] : []),
    ...(showMonitoring ? [{ href: "/admin/monitoring", label: "Monitoring", icon: Activity }] : []),
    ...(showReadings ? [{ href: "/admin/readings", label: "Readings", icon: Gauge }] : []),
    ...(showCatalog ? [{ href: "/admin/device-catalog", label: "Device catalog", icon: Lightbulb }] : []),
    ...(showUsers ? [{ href: "/admin/users", label: "Admin users", icon: Users }] : []),
  ];

  const brandVariant = theme === "light" ? "light" : "dark";

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
          className="flex items-center gap-2.5 rounded-[var(--r-md)] px-3 py-2 text-[13px] font-medium transition-colors"
          style={{
            background: active ? "var(--chrome-active)" : "transparent",
            color: active ? "var(--chrome-accent)" : "var(--chrome-muted)",
          }}
        >
          <Icon size={16} strokeWidth={1.75} aria-hidden />
          {item.label}
        </Link>
      );
    });

  return (
    <div className="min-h-screen">
      {/* desktop sidebar */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col"
        style={{ background: "var(--chrome)", borderRight: "1px solid var(--chrome-border)" }}
      >
        <div className="px-5 pt-6 pb-5">
          <BrandMark variant={brandVariant} className="h-7" />
        </div>
        <nav className="flex-1 px-3 space-y-0.5" aria-label="Main">
          {navLinks()}
        </nav>
        <div className="px-5 py-5 space-y-4" style={{ borderTop: "1px solid var(--chrome-border)" }}>
          <ThemeSwitcher current={theme} />
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs" style={{ color: "var(--chrome-subtle)" }} title={email}>
              {email}
            </p>
            <SignOutButton
              className="text-xs font-semibold hover:opacity-80 shrink-0"
              style={{ color: "var(--chrome-muted)" }}
            />
          </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <div
        className="lg:hidden sticky top-0 z-20"
        style={{ background: "var(--chrome)", borderBottom: "1px solid var(--chrome-border)" }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <BrandMark variant={brandVariant} className="h-6" />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle navigation menu"
            className="flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: "var(--chrome-muted)" }}
          >
            {open ? <X size={18} strokeWidth={1.75} /> : <Menu size={18} strokeWidth={1.75} />}
            {open ? "Close" : "Menu"}
          </button>
        </div>
        {open && (
          <div className="px-3 pb-4 pt-1 space-y-0.5" style={{ borderTop: "1px solid var(--chrome-border)" }}>
            {navLinks(() => setOpen(false))}
            <div className="flex items-center justify-between gap-3 px-3 pt-4">
              <ThemeSwitcher current={theme} />
              <SignOutButton
                className="text-sm font-medium hover:opacity-80"
                style={{ color: "var(--chrome-muted)" }}
              />
            </div>
          </div>
        )}
      </div>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-5xl p-5 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
