"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toTitleCase } from "@/lib/format-text";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }
}

export async function createSociety(input: {
  name: string;
  city: string;
  email: string;
  password: string;
}) {
  await requireAdmin();

  const name = toTitleCase(input.name);
  const city = input.city.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name || !email || !password) {
    return { success: false, error: "Society name, email, and password are required." };
  }

  const existing = await db.profile.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "Email already exists" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const society = await db.$transaction(async (tx) => {
    const newSociety = await tx.society.create({ data: { name, city } });
    await tx.profile.create({
      data: {
        email,
        passwordHash,
        role: "customer",
        societyId: newSociety.id,
        societyName: newSociety.name,
      },
    });
    return newSociety;
  });

  revalidatePath("/admin/societies");

  return { success: true, societyId: society.id, email, societyName: society.name };
}

// Minimal society creation with no linked customer login — used by the
// AI-extraction "unmatched society" quick-create flow (e.g. from the
// invoices form), where an admin just needs a Society row to file a
// document against, not a full onboarding (city/login/password). Adding a
// customer login for it later is still possible from the society's own
// edit page.
export async function createSocietyQuick(name: string) {
  await requireAdmin();

  const formatted = toTitleCase(name);
  if (!formatted) {
    return { success: false as const, error: "Society name is required." };
  }

  const existing = await db.society.findFirst({ where: { name: formatted } });
  if (existing) {
    return { success: true as const, societyId: existing.id, name: existing.name };
  }

  const society = await db.society.create({ data: { name: formatted } });

  revalidatePath("/admin/societies");

  return { success: true as const, societyId: society.id, name: society.name };
}

export async function updateSociety(input: {
  id: number;
  name: string;
  city: string;
  totalLights: number;
  savingsPercentage: number;
}) {
  await requireAdmin();

  await db.society.update({
    where: { id: input.id },
    data: {
      name: toTitleCase(input.name),
      city: input.city,
      totalLights: input.totalLights,
      savingsPercentage: input.savingsPercentage,
    },
  });

  revalidatePath("/admin/societies");
  revalidatePath(`/admin/societies/${input.id}`);

  return { success: true };
}

export async function deleteSociety(id: number) {
  await requireAdmin();

  // Preserves the legacy Supabase behavior of deleting the linked customer
  // login along with the society, rather than the schema's default
  // onDelete: SetNull (see PROJECT_CONTEXT.md "Society deletion cascade").
  // Every other child table cascades automatically via the schema's FKs.
  await db.$transaction([
    db.profile.deleteMany({ where: { societyId: id } }),
    db.society.delete({ where: { id } }),
  ]);

  revalidatePath("/admin/societies");

  return { success: true };
}

export async function updateSocietyLogin(input: {
  societyId: number;
  email?: string;
  password?: string;
}) {
  await requireAdmin();

  const { societyId } = input;
  const email = input.email?.trim().toLowerCase();
  const password = input.password;

  if (!email && !password) {
    return { success: false, error: "Provide an email or password to update" };
  }

  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return { success: false, error: "Invalid email address" };
  }

  if (password && password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const customerProfile = await db.profile.findFirst({
    where: { societyId, role: "customer" },
  });

  if (!customerProfile) {
    return { success: false, error: "No customer account is linked to this society" };
  }

  const data: { email?: string; passwordHash?: string } = {};

  if (email && email !== customerProfile.email?.toLowerCase()) {
    data.email = email;
  }

  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (Object.keys(data).length === 0) {
    return { success: true, email: customerProfile.email };
  }

  await db.profile.update({ where: { id: customerProfile.id }, data });

  revalidatePath(`/admin/societies/${societyId}`);

  return {
    success: true,
    email: data.email ?? customerProfile.email,
    passwordUpdated: Boolean(password),
  };
}
