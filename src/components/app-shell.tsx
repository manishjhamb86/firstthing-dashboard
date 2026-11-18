"use client";

import type { ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Droplets,
  Building2,
  Target,
  Receipt,
  Zap,
  LifeBuoy,
  Settings,
  Package,
  ListChecks,
  ShieldCheck,
  Flag,
} from "lucide-react";
import { DemoModeToggle } from "@/components/demo-mode-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { JumpTo } from "@/components/jump-to";
import { NavShell, type NavEntry, type NavGroup, type NavItem } from "@/components/nav-shell";
import { isSuperAdmin } from "@/lib/super-admin";
import { SETTINGS_ROUTES, settingsSections } from "@/lib/settings-sections";
import type { JumpPage, JumpSociety } from "@/lib/jump-search";
import type { ThemeId } from "@/lib/theme";

/** Things waiting on this viewer, per approvals queue — read in the layout. */
export type ApprovalCounts = { corrections: number; dates: number; visits: number; release: number };

// The admin surface's nav. The chrome itself lives in NavShell, which the
// society portal also wears (2026-08-26) — this file is now just which items
// an admin sees, and the permission flags that decide them.
//
// Reorganised 2026-11-19 (user-asked: "most used prioritised to top, no
// duplicates, each submenu under the correct menu"; designed on the canvas
// "Admin navigation" first). The viewer's own work first (Home, Founders'
// page, Tasks, Schedule, Approvals), then the workspace by how often it is
// used, then Settings as one page. Every approval queue sits under Approvals;
// after-sale work under Service; Societies keeps only society records.
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
  showFounders,
  showVisitApprovals = false,
  showRelease = false,
  approvals = { corrections: 0, dates: 0, visits: 0, release: 0 },
  jumpSocieties = [],
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
  /** Manish and Yogesh only (view_founder_dashboard) — the one page that reads across every domain's own narrower gate. */
  showFounders: boolean;
  showVisitApprovals?: boolean;
  /** The accountant's release queue (release_billing only). */
  showRelease?: boolean;
  approvals?: ApprovalCounts;
  jumpSocieties?: JumpSociety[];
  children: ReactNode;
}) {
  // CMP-19: two levels. A group renders only when the viewer can see at
  // least one of its items, so nobody gets an empty header.
  const group = (id: string, label: string, icon: NavGroup["icon"], entries: Array<NavItem | false>, badge?: number): NavEntry[] => {
    const visible = entries.filter((e): e is NavItem => e !== false);
    return visible.length > 0 ? [{ id, label, icon, items: visible, badge }] : [];
  };
  // Bound to one named account (2026-10-20): integration credentials and the
  // data-correction switch. Hiding the links is the courtesy half; the pages
  // and their actions re-check the same account independently.
  const superAdmin = isSuperAdmin(email);
  const settings = settingsSections({
    manageAdmins: showUsers,
    billing: showBilling,
    pipeline: showPipeline,
    field: showField,
    superAdmin,
  });

  const corrections = approvals.corrections;
  const dates = approvals.dates;
  const visits = showVisitApprovals ? approvals.visits : 0;
  const release = showRelease ? approvals.release : 0;

  const items: NavEntry[] = [
    { href: "/admin", label: "Home", icon: LayoutDashboard, exact: true },
    // Manish and Yogesh only (view_founder_dashboard, 2026-10-22) — under
    // their home screen, since they open it as often.
    ...(showFounders ? [{ href: "/admin/founders", label: "Founders\u2019 page", icon: Flag }] : []),
    // Everyone's own work — not permission-gated.
    { href: "/admin/tasks", label: "Tasks", icon: ListChecks },
    { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
    // Every queue of decisions, in one place (2026-11-19). Corrections and
    // date changes are readable by any admin so a requester can follow
    // theirs; the count is only what waits on THIS viewer.
    ...group(
      "approvals",
      "Approvals",
      ShieldCheck,
      [
        { href: "/admin/approvals", label: "Corrections", icon: ShieldCheck, badge: corrections },
        { href: "/admin/timeline/requests", label: "Date changes", icon: ShieldCheck, badge: dates },
        showVisitApprovals && { href: "/admin/visits/approvals", label: "Visit sign-off", icon: ShieldCheck, badge: visits },
        showRelease && { href: "/admin/billing/release-queue", label: "Bill release", icon: ShieldCheck, badge: release },
      ],
      corrections + dates + visits + release,
    ),
    { divider: "workspace" },
    ...group("societies", "Societies", Building2, [
      { href: "/admin/societies", label: "All societies", icon: Building2 },
      { href: "/admin/defaulters", label: "Defaulters", icon: Building2 },
      { href: "/admin/star-societies", label: "Star partners", icon: Building2 },
      // Asks which society first and scopes everything to it (2026-09-20).
      showPipeline && { href: "/admin/documents", label: "Documents", icon: Building2 },
      { href: "/admin/timeline", label: "Timeline", icon: Building2 },
      (showUsers || showPipeline) && { href: "/admin/facility-management", label: "Facility management", icon: Building2 },
    ]),
    // Two tabs, not one: a circuit chasing a benchmark and a society holding
    // one are different questions (2026-08-21). Live first: checked daily.
    ...group("lighting", "Lighting", Zap, [
      showMonitoring && { href: "/admin/live-monitoring", label: "Live monitoring", icon: Zap },
      showMonitoring && { href: "/admin/demo-monitoring", label: "Demo monitoring", icon: Zap },
      showMeters && { href: "/admin/meters", label: "Meters", icon: Zap },
      showReadings && { href: "/admin/readings", label: "Monthly uploads", icon: Zap },
      // Moved here from Settings (2026-10-17, user-caught).
      showCatalog && { href: "/admin/device-catalog", label: "Device catalog", icon: Zap },
    ]),
    // Looking after live societies (2026-11-19): visits, monthly
    // inspections, what societies raise, and what the field team raises.
    ...group("service", "Service", LifeBuoy, [
      { href: "/admin/visits", label: "Customer visits", icon: LifeBuoy },
      showField && { href: "/admin/inspections", label: "Inspections", icon: LifeBuoy },
      showSupport && { href: "/admin/tickets", label: "Society requests", icon: LifeBuoy },
      { href: "/admin/help", label: "Team help desk", icon: LifeBuoy },
    ]),
    ...group("deals", "Deals", Target, [
      showPipeline && { href: "/admin/pipeline", label: "Leads & pipeline", icon: Target },
      // The public homepage's "Request an Assessment" form (2026-10-16).
      showPipeline && { href: "/admin/marketing-enquiries", label: "Website enquiries", icon: Target },
      // The field team's own list — they do not get the deal (2026-08-24).
      showField && { href: "/admin/field", label: "Field work", icon: Target },
    ]),
    ...group("billing", "Billing", Receipt, [
      // Where each month starts: report → bill → email (2026-11-18).
      showBilling && { href: "/admin/billing/close", label: "Monthly close", icon: Receipt },
      showBilling && { href: "/admin/billing/intake", label: "Invoice intake", icon: Receipt },
      showBilling && { href: "/admin/billing", label: "Billing board", icon: Receipt },
      showBilling && { href: "/admin/billing/deviations", label: "Deviations", icon: Receipt },
      showBilling && { href: "/admin/retail-customers", label: "Retail customers", icon: Receipt },
    ]),
    ...group("water", "Water", Droplets, [
      showTanks && { href: "/admin/water-tanks", label: "Water tanks", icon: Droplets },
      showTanks && { href: "/admin/pump-rooms", label: "Pump rooms", icon: Droplets },
    ]),
    ...group("inventory", "Inventory", Package, [
      (showField || showPipeline) && { href: "/admin/inventory", label: "Stock", icon: Package, exact: true },
      (showField || showPipeline) && { href: "/admin/inventory/receive", label: "Receive stock", icon: Package },
      (showField || showPipeline) && { href: "/admin/inventory/scan", label: "Scan", icon: Package },
    ]),
    ...(settings.length > 0
      ? ([{ divider: "settings" }, { href: "/admin/settings", label: "Settings", icon: Settings, alsoMatches: SETTINGS_ROUTES }] as NavEntry[])
      : []),
  ];

  // What jump-to offers: exactly the pages this sidebar offers, plus each
  // Settings page, plus Notifications (reached by the bell, not the menu).
  // Keywords carry the old labels so a habit still finds its page.
  const OLD_NAMES: Record<string, string> = {
    "/admin": "portfolio dashboard",
    "/admin/tickets": "support tickets complaints",
    "/admin/marketing-enquiries": "marketing enquiries assessment",
    "/admin/defaulters": "defaulter societies",
    "/admin/approvals": "pending approvals",
    "/admin/timeline/requests": "date change requests",
    "/admin/visits/approvals": "visit approvals",
    "/admin/billing/release-queue": "release queue",
    "/admin/societies": "societies",
  };
  const jumpPages: JumpPage[] = [
    ...items.flatMap((e): JumpPage[] => {
      if ("divider" in e) return [];
      if ("items" in e) return e.items.map((i) => ({ label: i.label, href: i.href, group: e.label, keywords: OLD_NAMES[i.href] }));
      return [{ label: e.label, href: e.href, keywords: OLD_NAMES[e.href] }];
    }),
    { label: "Notifications", href: "/admin/notifications" },
    ...settings.flatMap((s) => s.links.map((l) => ({ label: l.label, href: l.href, group: `Settings · ${s.title}` }))),
  ];

  return (
    <NavShell
      theme={theme}
      email={email}
      items={items}
      jump={<JumpTo pages={jumpPages} societies={jumpSocieties} />}
      homeHref="/admin"
      footerNote="FirsThing · verified savings"
      extras={<NotificationBell count={unreadCount} />}
      settings={demoAvailable ? <DemoModeToggle on={demoMode} surface="content" /> : undefined}
      // On a phone the toggle lives in the account menu, so the header still
      // has to say the mode it is in — the toggle is the only thing that does.
      mobileStatus={
        demoAvailable && demoMode ? (
          <span
            className="rounded-[var(--r-pill)] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
            style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
          >
            Demo
          </span>
        ) : undefined
      }
    >
      {/* No demo ribbon here. Two stacked amber bars — this one and whatever
          the page itself is warning about — is one too many, and the toggle in
          the header carries the same signal (user's call, 2026-08-21). */}
      {children}
    </NavShell>
  );
}
