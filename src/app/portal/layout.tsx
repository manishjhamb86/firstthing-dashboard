import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { effectiveGrants } from "@/lib/portal-access";
import { societyEvents } from "@/lib/portal-notifications";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { resolveTheme } from "@/lib/resolve-theme";
import { PortalShell, type PortalNavEntry } from "./portal-shell";

export const dynamic = "force-dynamic";

/**
 * One shell for every portal page (the customer-portal revamp, 2026-08-29) —
 * previously each page rendered its own PortalShell, which meant each page
 * re-fetched the theme and society, and adding the grant-gated sidebar would
 * have meant repeating the grant resolution eight times.
 *
 * The sidebar shows only GRANTED modules; every page still re-checks its own
 * grant server-side. resolvePortalViewer() is cache()d, so the layout and the
 * page share one Profile lookup per request rather than doubling it.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);

  const [theme, society, events] = await Promise.all([
    resolveTheme(),
    db.society.findUnique({ where: { id: viewer.societyId }, select: { name: true } }),
    // The bell counts what this MEMBER has not seen — feed events newer than
    // their own notificationsSeenAt (null = everything is new). societyEvents
    // is cache()d, so the notifications page shares this per-request.
    societyEvents(viewer.societyId),
  ]);
  if (!society) redirect("/login");

  const seenAt = viewer.notificationsSeenAt;
  const unseen = events.filter((e) => seenAt === null || e.at > seenAt).length;

  const grants = effectiveGrants(viewer.role, viewer.grants);

  const entries: PortalNavEntry[] = [
    { key: "dashboard" as const, href: "/portal", label: "Dashboard", exact: true },
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

  return (
    <PortalShell
      theme={theme}
      email={viewer.email}
      societyName={society.name}
      entries={entries}
      bellCount={unseen}
    >
      {children}
    </PortalShell>
  );
}
