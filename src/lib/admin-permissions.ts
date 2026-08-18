import { cache } from "react";
import { redirect } from "next/navigation";
import type { AdminPermission } from "@prisma/client";
import { auth } from "./auth";
import { db } from "./db";
import { logger } from "./logger";

// The JWT proves *who* signed in. It does not prove that the account still
// exists, is still active, or still holds the permission it held at login —
// all three change after a token is minted, and a stateless JWT cannot know
// it (the same staleness class already documented for portalAuthority in
// PROJECT_CONTEXT.md's MS-02 section, decided here rather than deferred
// again). Left unchecked it produced three real failures, not one:
//
//   1. A deleted admin kept a working session, and the first write using
//      session.user.id as a foreign key died with a raw constraint violation
//      surfaced as a Next.js runtime error page.
//   2. /admin/users' "Inactive" toggle did not actually revoke access — an
//      admin deactivated mid-session kept full admin until token expiry.
//   3. A permission revoked on that same screen likewise took effect only at
//      the next login.
//
// Next's own guidance is a Data Access Layer whose session check sits as
// close to the data as possible, memoized with React's cache()
// (node_modules/next/dist/docs/01-app/02-guides/authentication.md,
// "Creating a Data Access Layer") — which is exactly this. cache() means the
// several gates that fire during one request share a single lookup, the same
// trade resolveTheme() already makes.
export const resolveAdmin = cache(async () => {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") return null;

  const admin = await db.adminUser.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, permissions: true, isActive: true, deletedAt: true },
  });

  // A removed account's live session stops working on its very next request,
  // the same rule already applied to deactivation — the token proves who
  // signed in, the row proves what they may do now.
  if (admin?.deletedAt) {
    logger.warn("auth.stale_session", { userId: admin.id, reason: "admin_removed" });
    return null;
  }
  if (!admin) {
    logger.warn("auth.stale_session", { userId: session.user.id, reason: "admin_deleted" });
    return null;
  }
  if (!admin.isActive) {
    logger.warn("auth.stale_session", { userId: admin.id, reason: "admin_deactivated" });
    return null;
  }
  return admin;
});

type AdminSession = {
  user: { id: string; email: string; name: string | null; role: "admin"; adminPermissions: AdminPermission[] };
};

function toSession(admin: NonNullable<Awaited<ReturnType<typeof resolveAdmin>>>): AdminSession {
  return {
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: "admin",
      adminPermissions: admin.permissions,
    },
  };
}

// Reuses the named-permission shape proven in archive/src/lib/admin-permissions.ts
// (see PROJECT_CONTEXT.md) — checked server-side on every Server Action, not
// just used to decide what a screen renders. Permissions now come from the
// row, so a revocation applies to the next request rather than the next login.
export async function requireAdminPermission(permission: AdminPermission): Promise<AdminSession> {
  const admin = await resolveAdmin();
  if (!admin) throw new Error("Unauthorized");
  if (!admin.permissions.includes(permission)) {
    logger.warn("auth.permission_denied", { userId: admin.id, permission });
    throw new Error("Unauthorized");
  }
  return toSession(admin);
}

export async function requireAdmin(): Promise<AdminSession> {
  const admin = await resolveAdmin();
  if (!admin) throw new Error("Unauthorized");
  return toSession(admin);
}

// A stale session cannot simply be redirected to /login — proxy.ts still
// sees a valid JWT and bounces it straight back, which is an infinite loop
// (found in the browser, not by tsc). It has to be ended first.
export const STALE_SESSION_EXIT = "/api/session-ended";

// Page-surface equivalent. Server Actions throw (there is no sensible screen
// to send a rejected mutation to), but a page whose viewer no longer has an
// account should land on /login rather than render an error — otherwise a
// deactivated admin still *sees* the admin area until their token expires,
// which is the same defect as #2 above wearing a different hat.
export async function requireAdminPage(permission?: AdminPermission): Promise<AdminSession> {
  const admin = await resolveAdmin();
  if (!admin) redirect(STALE_SESSION_EXIT);
  if (permission && !admin.permissions.includes(permission)) redirect("/admin");
  return toSession(admin);
}
