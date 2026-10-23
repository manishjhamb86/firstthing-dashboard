import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ROLE_HOME, isRole } from "@/lib/roles";

// Role-routing lives here, not a hardcoded "/admin" (an MS-01 relic from
// when admin was the only role) — MS-02 added portal roles, so a hardcoded
// destination would land a non-admin session on a route it doesn't have,
// relying on proxy.ts's redirect-on-mismatch to correct it. That correction
// happens, but only after a real request round trip, and a client-side
// transition into it doesn't always keep the browser's URL bar in sync —
// better to never route someone to a role they don't hold in the first place.
export default async function RootPage() {
  const session = await auth();
  if (!session?.user || !isRole(session.user.role)) redirect("/login");
  // Founders land on their own page (2026-10-23, user-asked), everyone else
  // on their role's ordinary home. Read straight from the JWT, same as
  // ROLE_HOME itself just below — a one-time navigation guess, not an
  // authorization decision: requireAdminPage("view_founder_dashboard") on
  // /admin/founders independently re-checks the DB-resolved permission and
  // bounces a stale/revoked session back to /admin rather than looping.
  if (session.user.role === "admin" && session.user.adminPermissions?.includes("view_founder_dashboard")) {
    redirect("/admin/founders");
  }
  redirect(ROLE_HOME[session.user.role]);
}
