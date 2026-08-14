"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { PortalAuthority } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

// FEAT-086 (portal-side accounts) + FEAT-108-AC-8 (empty state + creation
// offer when a society has no portal accounts yet) — ops creates the first
// office-bearer/committee/manager login for a society. Gated by
// `manage_users`, the same permission that gates internal-user account
// management in admin-actions.ts.

export async function createPortalAccount(input: {
  societyId: string;
  email: string;
  name: string;
  password: string;
  portalAuthority: PortalAuthority;
}) {
  const session = await requireAdminPermission("manage_users");

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!email || !input.password) return { error: "Email and password are required." };
  if (input.password.length < 8) return { error: "Password must be at least 8 characters." };

  const [existingProfile, existingAdmin] = await Promise.all([
    db.profile.findUnique({ where: { email } }),
    db.adminUser.findUnique({ where: { email } }),
  ]);
  if (existingProfile) return { error: "A portal account with this email already exists." };
  if (existingAdmin) return { error: "This email already belongs to an admin account." };

  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = await db.profile.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      portalAuthority: input.portalAuthority,
      societyId: input.societyId,
    },
  });

  logger.info("portal_account.created", {
    actorId: session.user.id,
    societyId: input.societyId,
    profileId: created.id,
    portalAuthority: input.portalAuthority,
  });
  revalidatePath(`/admin/societies/${input.societyId}`);
  return {};
}

export async function deactivatePortalAccount(id: string, societyId: string) {
  const session = await requireAdminPermission("manage_users");

  // Mirrors FEAT-108-AC-4's rule at the admin-management edge too: don't
  // leave a society with zero active office-bearers via deactivation.
  const target = await db.profile.findUnique({ where: { id } });
  if (target?.portalAuthority === "office_bearer") {
    const otherActiveBearers = await db.profile.count({
      where: { id: { not: id }, societyId, isActive: true, portalAuthority: "office_bearer" },
    });
    if (otherActiveBearers === 0) {
      logger.warn("portal_account.lockout_refused", { actorId: session.user.id, societyId, targetId: id });
      return { error: "This society would be left with no office-bearer. Designate a new one first." };
    }
  }

  await db.profile.update({ where: { id }, data: { isActive: false } });
  logger.info("portal_account.deactivated", { actorId: session.user.id, societyId, targetId: id });
  revalidatePath(`/admin/societies/${societyId}`);
  return {};
}
