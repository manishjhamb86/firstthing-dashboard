import type { AdminPermission } from "@prisma/client";
import { auth } from "./auth";

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
