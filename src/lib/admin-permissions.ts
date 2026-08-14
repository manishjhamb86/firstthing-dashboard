import type { AdminPermission } from "@prisma/client";
import { auth } from "./auth";

// Reuses the exact proven pattern from archive/src/lib/admin-permissions.ts
// (see PROJECT_CONTEXT.md) — a named-permission gate, checked server-side on
// every Server Action, not just used to decide what a screen renders.
export async function requireAdminPermission(permission: AdminPermission) {
  const session = await auth();
  if (
    !session?.user ||
    session.user.role !== "admin" ||
    !session.user.adminPermissions?.includes(permission)
  ) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return session;
}
