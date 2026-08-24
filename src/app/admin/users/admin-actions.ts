"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { AdminPermission, AdminTeam } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

// FEAT-086: internal (AdminUser) account management, gated by the
// `manage_admins` permission — the exact proven pattern from
// archive/src/app/admin/users/admin-actions.ts (PROJECT_CONTEXT.md),
// rebuilt against the new schema. The self-lockout guards (refuse
// deleting/demoting the last manage_admins holder, refuse self-deletion)
// are the load-bearing part of FEAT-086-AC-3 — a real, hard-to-recover
// failure mode this app has already had a working answer for.

export async function createAdminUser(input: {
  email: string;
  name: string;
  password: string;
  permissions: AdminPermission[];
  team: AdminTeam;
}) {
  const session = await requireAdminPermission("manage_admins");

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!email || !input.password) return { error: "Email and password are required." };
  if (input.password.length < 8) return { error: "Password must be at least 8 characters." };

  const [existingAdmin, existingProfile] = await Promise.all([
    db.adminUser.findUnique({ where: { email } }),
    db.profile.findUnique({ where: { email } }),
  ]);
  if (existingAdmin) return { error: "An admin with this email already exists." };
  if (existingProfile) return { error: "This email already belongs to a portal account." };

  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = await db.adminUser.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      permissions: input.permissions,
      team: input.team,
      createdById: session.user.id,
    },
  });

  logger.info("admin_user.created", {
    actorId: session.user.id,
    newAdminId: created.id,
    permissions: input.permissions,
    team: input.team,
  });
  revalidatePath("/admin/users");
  return {};
}

export async function updateAdminUser(input: {
  id: string;
  name: string;
  permissions: AdminPermission[];
  isActive: boolean;
  team?: AdminTeam;
}) {
  const session = await requireAdminPermission("manage_admins");

  // FEAT-086-AC-3: refuse leaving the system with no one who can manage
  // admins — self-lockout is a real, hard-to-recover failure mode.
  if (!input.permissions.includes("manage_admins") || !input.isActive) {
    const otherActiveManagers = await db.adminUser.count({
      where: { id: { not: input.id }, isActive: true, permissions: { has: "manage_admins" } },
    });
    if (otherActiveManagers === 0) {
      logger.warn("admin_user.lockout_refused", { actorId: session.user.id, targetId: input.id });
      return { error: "At least one active admin must be able to manage admins." };
    }
  }

  await db.adminUser.update({
    where: { id: input.id },
    data: {
      ...(input.team ? { team: input.team } : {}), name: input.name.trim() || null, permissions: input.permissions, isActive: input.isActive },
  });

  logger.info("admin_user.updated", { actorId: session.user.id, targetId: input.id, permissions: input.permissions, isActive: input.isActive });
  revalidatePath("/admin/users");
  return {};
}

export async function deleteAdminUser(id: string) {
  const session = await requireAdminPermission("manage_admins");

  if (id === session.user.id) return { error: "You cannot delete your own admin account." };

  const target = await db.adminUser.findUnique({ where: { id } });
  if (target?.permissions.includes("manage_admins")) {
    const otherActiveManagers = await db.adminUser.count({
      where: { id: { not: id }, isActive: true, deletedAt: null, permissions: { has: "manage_admins" } },
    });
    if (otherActiveManagers === 0) {
      logger.warn("admin_user.lockout_refused", { actorId: session.user.id, targetId: id, act: "delete" });
      return { error: "At least one active admin must be able to manage admins." };
    }
  }

  // Soft delete, never a row removal: this account is the recorded actor on
  // gate passes, releases, rescales and more, and deleting it would either
  // fail on those references or quietly detach them from a name. Removal
  // hides the account and stops it signing in (auth.ts filters deletedAt,
  // and resolveAdmin ends any live session on the next request).
  await db.adminUser.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: session.user.id, isActive: false },
  });
  logger.info("admin_user.removed", { actorId: session.user.id, targetId: id });
  revalidatePath("/admin/users");
  return {};
}

export async function restoreAdminUser(id: string) {
  const session = await requireAdminPermission("manage_admins");
  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) return { error: "That account no longer exists." };
  if (!target.deletedAt) return { error: "That account has not been removed." };

  // Restored deactivated, not straight back into service: whoever restores it
  // should have to decide, as a separate act, that it may sign in again.
  await db.adminUser.update({
    where: { id },
    data: { deletedAt: null, deletedById: null, isActive: false },
  });
  logger.info("admin_user.restored", { actorId: session.user.id, targetId: id });
  revalidatePath("/admin/users");
  return {};
}
