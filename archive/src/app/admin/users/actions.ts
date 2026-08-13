"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function createUser(input: {
  email: string;
  password: string;
  role: Role;
  societyId: number | null;
}) {
  await requireAdminPermission("manage_users");

  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  if (password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const existingProfile = await db.profile.findUnique({ where: { email } });
  if (existingProfile) {
    return { success: false, error: "A user with this email already exists." };
  }

  const existingAdmin = await db.adminUser.findUnique({ where: { email } });
  if (existingAdmin) {
    return { success: false, error: "This email is already used by an admin account." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let societyName: string | null = null;
  if (input.societyId) {
    const society = await db.society.findUnique({ where: { id: input.societyId } });
    societyName = society?.name ?? null;
  }

  await db.profile.create({
    data: {
      email,
      passwordHash,
      role: input.role,
      societyId: input.societyId,
      societyName,
    },
  });

  revalidatePath("/admin/users");

  return { success: true };
}

export async function updateUser(input: {
  id: string;
  role: Role;
  societyId: number | null;
  isActive: boolean;
}) {
  await requireAdminPermission("manage_users");

  let societyName: string | null = null;
  if (input.societyId) {
    const society = await db.society.findUnique({ where: { id: input.societyId } });
    societyName = society?.name ?? null;
  }

  await db.profile.update({
    where: { id: input.id },
    data: {
      role: input.role,
      societyId: input.societyId,
      societyName,
      isActive: input.isActive,
    },
  });

  revalidatePath("/admin/users");

  return { success: true };
}

export async function resetUserPassword(input: { id: string; password: string }) {
  await requireAdminPermission("manage_users");

  if (input.password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  await db.profile.update({ where: { id: input.id }, data: { passwordHash } });

  revalidatePath("/admin/users");

  return { success: true };
}

export async function deleteUser(id: string) {
  await requireAdminPermission("manage_users");

  await db.profile.delete({ where: { id } });

  revalidatePath("/admin/users");

  return { success: true };
}
