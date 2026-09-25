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
  FileText,
  LifeBuoy,
  ClipboardCheck,
  Settings,
} from "lucide-react";
import { DemoModeToggle } from "@/components/demo-mode-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { NavShell, type NavEntry, type NavGroup, type NavItem } from "@/components/nav-shell";
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
  showSupport,
  demoMode = false,
  demoAvailable = false,
  unreadCount = 0,
  children,
}: {
  theme: ThemeId;
  email: string;
  demoMode?: boolean;
  /** DEMO_MODE is set in the environment, so the toggle may render. */
  demoAvailable?: boolean;
  /** Open, unacknowledged alerts — read in the layout; this is a client component. */
  unreadCount?: number;
  showPipeline: boolean;
  showField: boolean;
  showMonitoring: boolean;
  showTanks: boolean;
  showMeters: boolean;
  showReadings: boolean;
  showCatalog: boolean;
  showUsers: boolean;
  showBilling: boolean;
  showSupport: boolean;
  children: ReactNode;
}) {
  // CMP-19 (2026-09-15, user-asked: "too many menu tabs… few main sections
  // and sub sections"): two levels, grouped by the operator's domain. A group
  // renders only when the viewer can see at least one of its items — a field
  // account sees Portfolio, Schedule, Deals, Societies and no empty headers.
  const group = (id: string, label: string, icon: NavGroup["icon"], entries: Array<NavItem | false>): NavEntry[] => {
    const visible = entries.filter((e): e is NavItem => e !== false);
    return visible.length > 0 ? [{ id, label, icon, items: visible }] : [];
  };

  const items: NavEntry[] = [
    { href: "/admin", label: "Portfolio", icon: LayoutDashboard, exact: true },
    // Everyone has appointments — meetings for sales, visits for the field —
    // so this is not permission-gated (the user's call, 2026-08-25: one
    // schedule module, visible to everyone as their own calendar).
    { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
    ...group("deals", "Deals", Target, [
      showPipeline && { href: "/admin/pipeline", label: "Leads & pipeline", icon: Target },
      // The field team's own list — they do not get the deal (2026-08-24).
      showField && { href: "/admin/field", label: "Field work", icon: HardHat },
    ]),
    ...group("societies", "Societies", Building2, [
      { href: "/admin/societies", label: "Societies", icon: Building2 },
      // The monthly per-society motion-sensor checklist (2026-09-12) — field
      // work, same gate as gate passes and benchmark rescale entry.
      showField && { href: "/admin/inspections", label: "Inspections", icon: ClipboardCheck },
      // One place to file any document, whatever kind it is (2026-08-26).
      // Sits here rather than under Deals (2026-09-20): the screen asks which
      // society first and scopes everything else to it, so it reads as a
      // society surface, not a deal one.
      showPipeline && { href: "/admin/documents", label: "Documents", icon: FileText },
      showSupport && { href: "/admin/tickets", label: "Support tickets", icon: LifeBuoy },
    ]),
    // Two tabs, not one: a circuit chasing a benchmark and a society holding
    // one are different questions with different cadences (2026-08-21).
    ...group("lighting", "Lighting", Zap, [
      showMonitoring && { href: "/admin/demo-monitoring", label: "Demo monitoring", icon: Activity },
      showMonitoring && { href: "/admin/live-monitoring", label: "Live monitoring", icon: SignalHigh },
      // The eWeLink meter mirror: an account's devices, assigned to what they
      // serve — a circuit.
      showMeters && { href: "/admin/meters", label: "Meters", icon: Zap },
      // Named for what it is, not for what it holds: next to "Meters" the
      // old label "Readings" read as a synonym for it (2026-09-20).
      showReadings && { href: "/admin/readings", label: "Monthly uploads", icon: Gauge },
    ]),
    // Water tank monitoring (2026-08-25) — mirrors the Smart Life account,
    // society-management's to run. Its own service line, its own group.
    ...group("water", "Water", Droplets, [
      showTanks && { href: "/admin/water-tanks", label: "Water tanks", icon: Droplets },
    ]),
    ...group("billing", "Billing", Receipt, [
      // Intake FIRST (2026-09-20): CON-47 made invoice-first the primary
      // monthly path — the platform reads the bill back rather than computing
      // it — so this is where the month actually enters.
      showBilling && { href: "/admin/billing/intake", label: "Invoice intake", icon: Receipt },
      showBilling && { href: "/admin/billing", label: "Billing board", icon: Receipt },
      // Accountant-only (requireAccountant, FEAT-054-AC-4) — shown under the
      // same broad showBilling boolean as Deviations (ops-only, the other
      // direction), matching this group's own established pattern of each
      // page doing its own tighter gate and redirect.
      showBilling && { href: "/admin/billing/release-queue", label: "Release queue", icon: Receipt },
      showBilling && { href: "/admin/billing/deviations", label: "Deviations", icon: Receipt },
      // Retail sales (2026-09-25) — customers FirsThing sells items to directly.
      showBilling && { href: "/admin/retail-customers", label: "Retail customers", icon: Receipt },
    ]),
    ...group("settings", "Settings", Settings, [
      showCatalog && { href: "/admin/device-catalog", label: "Device catalog", icon: Lightbulb },
      showUsers && { href: "/admin/users", label: "Admin users", icon: Users },
    ]),
  ];

  return (
    <NavShell
      theme={theme}
      email={email}
      items={items}
      footerNote="FirsThing · verified savings"
      extras={
        <>
          {demoAvailable && <DemoModeToggle on={demoMode} surface="content" />}
          <NotificationBell count={unreadCount} />
        </>
      }
    >
      {/* No demo ribbon here. Two stacked amber bars — this one and whatever
          the page itself is warning about — is one too many, and the toggle in
          the header carries the same signal (user's call, 2026-08-21). */}
      {children}
    </NavShell>
  );
}
