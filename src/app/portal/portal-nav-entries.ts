import type { PortalGrant } from "@prisma/client";
import {
  Boxes,
  Droplets,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { PortalNavEntry } from "./portal-shell";

/**
 * The icon per module — a PLAIN module (no "use client"), deliberately, so
 * both the sidebar (a client component, portal-shell.tsx) and the
 * dashboard's own mobile quick-actions row (a Server Component, page.tsx)
 * can import it directly. A Server Component importing a value FROM a
 * "use client" file breaks even for something as inert as an icon
 * component reference — Next treats every export of a client file as an
 * opaque client reference, which resolves to `undefined` as a JSX element
 * type on the server (found 2026-09-12, the exact "Element type is
 * invalid... got undefined" crash). Living here instead of in
 * portal-shell.tsx is what portal-shell.tsx's own long-standing comment
 * already explained the REVERSE of — icon lookup was kept client-side so a
 * Server Component never had to pass a component reference INTO the
 * client; the same rule cuts the other way when a Server Component wants
 * to render one itself.
 */
export const PORTAL_NAV_ICONS = {
  dashboard: LayoutDashboard,
  electricity: Zap,
  water: Droplets,
  documents: FileText,
  inventory: Boxes,
  support: LifeBuoy,
  admin: ShieldCheck,
} as const;

/**
 * The society's own granted modules as nav entries — everything BUT the
 * dashboard itself, since this list's two callers both already have their
 * own way to the dashboard (the sidebar's own top entry; the dashboard page
 * simply doesn't need a link to itself).
 *
 * Factored out so the sidebar (`layout.tsx`) and the dashboard's mobile
 * quick-actions row (`page.tsx`) read one list rather than two hand-written
 * copies that can drift — the exact shape this codebase has hit as a bug
 * more than once (a label restating an ordering defined elsewhere, a rule
 * duplicated instead of shared).
 */
export function portalNavEntries(grants: Set<PortalGrant>): PortalNavEntry[] {
  return [
    ...(grants.has("electricity")
      ? [{ key: "electricity" as const, href: "/portal/electricity", label: "Electricity" }]
      : []),
    ...(grants.has("water_tanks")
      ? [{ key: "water" as const, href: "/portal/tanks", label: "Water tanks" }]
      : []),
    ...(grants.has("documents")
      ? [{ key: "documents" as const, href: "/portal/documents", label: "Documents" }]
      : []),
    ...(grants.has("inventory")
      ? [{ key: "inventory" as const, href: "/portal/inventory", label: "Inventory" }]
      : []),
    ...(grants.has("tickets_view")
      ? [{ key: "support" as const, href: "/portal/support", label: "Support" }]
      : []),
    ...(grants.has("society_admin")
      ? [{ key: "admin" as const, href: "/portal/admin", label: "Society admin" }]
      : []),
  ];
}
