"use client";

import type { ReactNode } from "react";
import { Droplets, LayoutDashboard, Lightbulb, Users, Gauge } from "lucide-react";
import { NavShell, type NavItem } from "@/components/nav-shell";
import type { ThemeId } from "@/lib/theme";

/**
 * The society portal's chrome — the same shell the back office wears
 * (NavShell), with the society's own four sections in the sidebar.
 *
 * It used to be a bare header plus a row of pill tabs. That was a second
 * navigation idiom inside one product, and it had already overflowed a phone
 * once (the fourth tab sat 60px off-screen at 390px). The user asked for the
 * admin panel's look and its left-hand menu, 2026-08-26; this is that.
 *
 * Every item renders whether or not the society has anything behind it yet —
 * a menu whose entries appear and vanish as data arrives is a menu nobody can
 * learn. The pages carry the empty states instead (INV-06).
 */
const ITEMS: NavItem[] = [
  { href: "/portal", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/portal/tanks", label: "Water tanks", icon: Droplets },
  { href: "/portal/lighting", label: "Lighting", icon: Lightbulb },
  { href: "/portal/meters", label: "Meters", icon: Gauge },
  { href: "/portal/committee", label: "Committee", icon: Users },
];

export function PortalShell({
  theme,
  email,
  societyName,
  children,
}: {
  theme: ThemeId;
  email: string;
  /** Named in the sidebar, so whose data this is never has to be inferred. */
  societyName: string;
  children: ReactNode;
}) {
  return (
    <NavShell
      theme={theme}
      email={email}
      items={ITEMS}
      navLabel={societyName}
      footerNote="FirsThing · your society's portal"
    >
      {children}
    </NavShell>
  );
}
