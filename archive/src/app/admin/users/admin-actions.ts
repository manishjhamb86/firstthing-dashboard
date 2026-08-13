"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { AdminPermission } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function createAdmin(input: {
  email: string;
  password: string;
  name: string;
  permissions: AdminPermission[];
}) {
  const session = await requireAdminPermission("manage_admins");

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  if (password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const existing = await db.adminUser.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "An admin with this email already exists." };
  }

  const existingProfile = await db.profile.findUnique({ where: { email } });
  if (existingProfile) {
    return { success: false, error: "This email is already used by a user account." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.adminUser.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      permissions: input.permissions,
      createdById: session.user.id,
    },
  });

  revalidatePath("/admin/users");

  return { success: true };
}

export async function updateAdmin(input: {
  id: string;
  name: string;
  permissions: AdminPermission[];
  isActive: boolean;
}) {
  await requireAdminPermission("manage_admins");

  if (!input.permissions.includes("manage_admins")) {
    const otherActiveManagers = await db.adminUser.count({
      where: {
        id: { not: input.id },
        isActive: true,
        permissions: { has: "manage_admins" },
      },
    });
    if (otherActiveManagers === 0) {
      return {
        success: false,
        error: "At least one active admin must be able to manage admins.",
      };
    }
  }

  await db.adminUser.update({
    where: { id: input.id },
    data: {
      name: input.name.trim() || null,
      permissions: input.permissions,
      isActive: input.isActive,
    },
  });

  revalidatePath("/admin/users");

  return { success: true };
}

export async function resetAdminPassword(input: { id: string; password: string }) {
  await requireAdminPermission("manage_admins");

  if (input.password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  await db.adminUser.update({ where: { id: input.id }, data: { passwordHash } });

  revalidatePath("/admin/users");

  return { success: true };
}

export async function deleteAdmin(id: string) {
  const session = await requireAdminPermission("manage_admins");

  if (id === session.user.id) {
    return { success: false, error: "You cannot delete your own admin account." };
  }

  const target = await db.adminUser.findUnique({ where: { id } });
  if (target?.permissions.includes("manage_admins")) {
    const otherActiveManagers = await db.adminUser.count({
      where: { id: { not: id }, isActive: true, permissions: { has: "manage_admins" } },
    });
    if (otherActiveManagers === 0) {
      return {
        success: false,
        error: "At least one active admin must be able to manage admins.",
      };
    }
  }

  await db.adminUser.delete({ where: { id } });

  revalidatePath("/admin/users");

  return { success: true };
}
