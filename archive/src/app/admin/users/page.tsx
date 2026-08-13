import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import UsersTabsClient from "./users-tabs-client";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const permissions = session.user.adminPermissions ?? [];
  const canManageAdmins = permissions.includes("manage_admins");
  const canManageUsers = permissions.includes("manage_users");

  const [admins, users, societies] = await Promise.all([
    canManageAdmins
      ? db.adminUser.findMany({
          orderBy: { createdAt: "desc" },
          include: { createdBy: { select: { email: true } } },
        })
      : Promise.resolve([]),
    canManageUsers
      ? db.profile.findMany({ orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    canManageUsers ? db.society.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <UsersTabsClient
      canManageAdmins={canManageAdmins}
      canManageUsers={canManageUsers}
      currentAdminId={session.user.id}
      admins={admins.map((a) => ({
        id: a.id,
        email: a.email,
        name: a.name,
        isActive: a.isActive,
        permissions: a.permissions,
        createdByEmail: a.createdBy?.email ?? null,
        createdAt: a.createdAt.toISOString(),
      }))}
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        societyId: u.societyId,
        societyName: u.societyName,
        createdAt: u.createdAt.toISOString(),
      }))}
      societies={societies.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
