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
  return (
    <NavShell
      theme={theme}
      email={email}
      items={items}
      navLabel={societyName}
      footerNote="FirsThing · your society's portal"
      extras={<NotificationBell count={bellCount} href="/portal/notifications" surface="content" />}
    >
      {children}
    </NavShell>
  );
}
