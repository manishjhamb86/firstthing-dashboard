"use client";

import type { ReactNode } from "react";
import { NavShell, type NavItem } from "@/components/nav-shell";
import { NotificationBell } from "@/components/notification-bell";
import type { ThemeId } from "@/lib/theme";
import { PORTAL_NAV_ICONS } from "./portal-nav-entries";

/**
 * The society portal's chrome — the same NavShell the back office wears,
 * with the member's own GRANTED modules in the sidebar (customer portal
 * revamp, 2026-08-29).
 *
 * This deliberately breaks the older "every item renders whether or not the
 * society has anything behind it" rule, because the reason a tab is absent
 * changed: it used to mean "no data yet" (a page problem — INV-06 empty
 * states), and now it means "not yours to see" (an access decision the
 * office-bearer made). A menu of modules someone may not open is not a menu
 * they can learn, it is a list of refusals. The pages still re-check the
 * grant server-side — the sidebar is a courtesy, never the boundary.
 *
 * Items arrive as serializable keys from the server layout (which is where
 * the grants are resolved, DB-fresh); the icon LOOKUP happens here, from
 * the plain `portal-nav-entries.ts` module — never define the icon map in
 * this file again, see that module's own comment for why.
 */
export type PortalNavKey = keyof typeof PORTAL_NAV_ICONS;

export type PortalNavEntry = {
  key: PortalNavKey;
  href: string;
  label: string;
  exact?: boolean;
};

export function PortalShell({
  theme,
  email,
  societyName,
  entries,
  bellCount,
  children,
}: {
  theme: ThemeId;
  email: string;
  /** Named in the sidebar, so whose data this is never has to be inferred. */
  societyName: string;
  entries: PortalNavEntry[];
  /** Open, society-scoped alerts — what the bell is FOR, not a message count. */
  bellCount: number;
  children: ReactNode;
}) {
  const items: NavItem[] = entries.map((e) => ({
    href: e.href,
    label: e.label,
    icon: PORTAL_NAV_ICONS[e.key],
    exact: e.exact,
  }));

  // Up to 3 destinations on the phone tab bar: Home, always, plus whichever
  // of the highest-priority modules this viewer actually holds — a limited
  // member with no electricity grant gets their next-best two rather than a
  // bar with an empty slot. Labels stay the sidebar's own ("Electricity",
  // not the mockup's "Savings") so the tab bar and the "More" sheet never
  // name the same destination two different things.
  const TAB_PRIORITY: PortalNavKey[] = ["electricity", "documents", "billing", "water", "inventory", "support", "admin"];
  const primary = TAB_PRIORITY.map((key) => entries.find((e) => e.key === key))
    .filter((e): e is PortalNavEntry => e !== undefined)
    .slice(0, 2);
  const mobileTabBar: NavItem[] = [
    { href: "/portal", label: "Home", icon: PORTAL_NAV_ICONS.dashboard, exact: true },
    ...primary.map((e) => ({ href: e.href, label: e.label, icon: PORTAL_NAV_ICONS[e.key], exact: e.exact })),
  ];

  return (
    <NavShell
      theme={theme}
      email={email}
      items={items}
      navLabel={societyName}
      footerNote="FirsThing · your society's portal"
      extras={<NotificationBell count={bellCount} href="/portal/notifications" surface="content" />}
      mobileTabBar={mobileTabBar}
    >
      {children}
    </NavShell>
  );
}
