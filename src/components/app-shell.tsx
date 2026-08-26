"use client";

import type { ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Droplets,
  Building2,
  Target,
  Activity,
  SignalHigh,
  Gauge,
  HardHat,
  Lightbulb,
  Receipt,
  Users,
  Zap,
} from "lucide-react";
import { DemoModeToggle } from "@/components/demo-mode-toggle";
import { NavShell, type NavItem } from "@/components/nav-shell";
import type { ThemeId } from "@/lib/theme";

// The admin surface's nav. The chrome itself lives in NavShell, which the
// society portal also wears (2026-08-26) — this file is now just which items
// an admin sees, and the permission flags that decide them.
export function AppShell({
  theme,
  email,
  showPipeline,
  showField,
  showMonitoring,
  showTanks,
  showMeters,
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
  showTanks: boolean;
  showMeters: boolean;
  showReadings: boolean;
  showCatalog: boolean;
  showUsers: boolean;
  showBilling: boolean;
  children: ReactNode;
}) {
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
    // Water tank monitoring (2026-08-25) — mirrors the Smart Life account,
    // society-management's to run, so it follows the monitoring cluster.
    ...(showTanks ? [{ href: "/admin/water-tanks", label: "Water tanks", icon: Droplets }] : []),
    // The eWeLink meter mirror sits beside the tank mirror: same shape of
    // job (an account's devices, assigned to what they serve), different
    // vendor and a different assignment target — a circuit, not a society.
    ...(showMeters ? [{ href: "/admin/meters", label: "Meters", icon: Zap }] : []),
    ...(showReadings ? [{ href: "/admin/readings", label: "Readings", icon: Gauge }] : []),
    ...(showCatalog ? [{ href: "/admin/device-catalog", label: "Device catalog", icon: Lightbulb }] : []),
    ...(showBilling ? [{ href: "/admin/billing", label: "Billing", icon: Receipt }] : []),
    ...(showUsers ? [{ href: "/admin/users", label: "Admin users", icon: Users }] : []),
  ];

  return (
    <NavShell
      theme={theme}
      email={email}
      items={items}
      footerNote="FirsThing · verified savings"
      extras={demoAvailable ? <DemoModeToggle on={demoMode} surface="content" /> : null}
    >
      {/* No demo ribbon here. Two stacked amber bars — this one and whatever
          the page itself is warning about — is one too many, and the toggle in
          the header carries the same signal (user's call, 2026-08-21). */}
      {children}
    </NavShell>
  );
}
