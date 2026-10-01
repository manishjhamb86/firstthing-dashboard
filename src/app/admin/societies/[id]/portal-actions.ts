"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { PortalAuthority } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission, resolveAdmin } from "@/lib/admin-permissions";
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

// The back office's own reset, for when the society's own "shown once"
// handover (portal/actions.ts) was missed, lost, or never happened — a
// member locked out with no way back in otherwise (user-asked, 2026-10-01).
// Same "typed, never generated, shown back once" shape as the portal's own
// self-service account creation, so the two don't read as two conventions.
export async function resetPortalPassword(id: string, societyId: string, newPassword: string) {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session has ended. Sign in again." };
  if (!admin.permissions.includes("manage_users")) {
    return { error: "Resetting a portal account's password is operations' own action." };
  }
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  const target = await db.profile.findUnique({ where: { id }, select: { id: true, societyId: true, email: true } });
  if (!target || target.societyId !== societyId) return { error: "That account is no longer on record." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.profile.update({ where: { id }, data: { passwordHash } });
  logger.info("portal_account.password_reset", { actorId: admin.id, societyId, targetId: id });
  revalidatePath(`/admin/societies/${societyId}`);
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
