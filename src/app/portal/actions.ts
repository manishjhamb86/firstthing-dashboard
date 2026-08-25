"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { PortalAuthority } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  checkAccountCreate,
  checkAccountDeactivate,
  checkOfficeBearerTransfer,
} from "@/lib/portal-authority";
import { resolvePortalViewer } from "@/lib/portal-viewer";

// FEAT-108-AC-5 (office-bearer transfers the designation to another account
// of the same society) — this is R0's stand-in "binding act" for GATE-04,
// since accepting an offer (FEAT-108-AC-1/2) needs the Offer entity, which
// doesn't exist until a later milestone. The authorization decision itself
// lives in src/lib/portal-authority.ts (unit-tested, NFR-05's first slice) —
// this action is just the Next.js/DB shell around it.
export async function transferOfficeBearer(targetProfileId: string): Promise<{ error?: string }> {
  // Resolved from the Profile row, not the session's claims — an authority
  // transferred away mid-session must stop being exercisable immediately,
  // which a JWT minted at login cannot express. See src/lib/portal-viewer.ts.
  const viewer = await resolvePortalViewer();
  if (!viewer) return { error: "Your session is no longer valid — please sign in again." };

  const target = await db.profile.findUnique({ where: { id: targetProfileId } });

  const check = checkOfficeBearerTransfer(
    { id: viewer.id, role: viewer.role, societyId: viewer.societyId },
    target,
  );

  if (!check.ok) {
    logger.warn("gate04.binding_act_refused", {
      actorId: viewer.id,
      actorRole: viewer.role,
      actorSocietyId: viewer.societyId,
      targetProfileId,
      targetSocietyId: target?.societyId ?? null,
      act: "transfer_office_bearer",
      reason: check.reason,
    });
    return { error: check.error };
  }

  // The schema's portalAuthority is a single value per account (MS-01 scope,
  // not yet a set) — FEAT-108-AC-5's "previous one keeps its other
  // authorities" is provisionally satisfied by demoting the outgoing
  // office-bearer to `committee` rather than clearing their access outright.
  // Real multi-authority-per-account modeling, if ever needed, is a later
  // schema decision, not guessed here.
  await db.$transaction([
    db.profile.update({ where: { id: viewer.id }, data: { portalAuthority: "committee" } }),
    db.profile.update({ where: { id: target!.id }, data: { portalAuthority: "office_bearer" } }),
  ]);

  logger.info("portal.office_bearer_transferred", {
    societyId: viewer.societyId,
    fromProfileId: viewer.id,
    toProfileId: target!.id,
  });

  revalidatePath("/portal");
  return {};
}

// ── FEAT-108-AC-9 — the society adds and removes its own accounts ─────────
//
// Adding: a NEW account for this viewer's own society, at an authority a
// society may hand out (committee or manager — never the office-bearer
// designation, which is transferred, not issued). Removing: deactivation,
// never deletion — a portal account has ACTED (it approves installation
// days, and FEAT-108-AC-3 records the authority it held at that moment), so
// the row has to survive or those records point at nothing.
//
// The password is set here and shown once, because there is no email
// provider in this build: ADR-008 is still Proposed and notification
// delivery is R1. An invite link is the better answer and is what should
// replace this the moment email exists.

export async function createSocietyAccount(input: {
  email: string;
  name: string;
  password: string;
  authority: string;
}): Promise<{ error?: string; created?: { email: string } }> {
  const viewer = await resolvePortalViewer();
  if (!viewer) return { error: "Your session is no longer valid. Sign in again." };

  const verdict = checkAccountCreate(
    { id: viewer.id, role: viewer.role, societyId: viewer.societyId },
    input,
  );
  if (!verdict.ok) {
    logger.warn("portal_account.create_refused", {
      actorId: viewer.id,
      societyId: viewer.societyId,
      reason: verdict.reason,
    });
    return { error: verdict.error };
  }

  const email = input.email.trim().toLowerCase();
  const [existingProfile, existingAdmin] = await Promise.all([
    db.profile.findUnique({ where: { email } }),
    db.adminUser.findUnique({ where: { email } }),
  ]);
  // Deliberately the same message for both: whether an address belongs to an
  // internal account is not this viewer's business to learn.
  if (existingProfile || existingAdmin) {
    return { error: "That email address is already in use." };
  }

  const created = await db.profile.create({
    data: {
      email,
      name: input.name.trim() || null,
      passwordHash: await bcrypt.hash(input.password, 10),
      portalAuthority: input.authority as PortalAuthority,
      // INV-05: the society comes from the VIEWER's row, never from the
      // request — there is no societyId in the input for a reason.
      societyId: viewer.societyId,
    },
  });

  logger.info("portal_account.created", {
    actorId: viewer.id,
    societyId: viewer.societyId,
    profileId: created.id,
    portalAuthority: input.authority,
    via: "portal",
  });
  revalidatePath("/portal/committee");
  return { created: { email } };
}

export async function deactivateSocietyAccount(
  targetProfileId: string,
): Promise<{ error?: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer) return { error: "Your session is no longer valid. Sign in again." };

  const target = await db.profile.findUnique({
    where: { id: targetProfileId },
    select: { id: true, societyId: true, isActive: true, portalAuthority: true, email: true },
  });

  const verdict = checkAccountDeactivate(
    { id: viewer.id, role: viewer.role, societyId: viewer.societyId },
    target,
  );
  if (!verdict.ok) {
    logger.warn("portal_account.deactivate_refused", {
      actorId: viewer.id,
      societyId: viewer.societyId,
      targetId: targetProfileId,
      reason: verdict.reason,
    });
    return { error: verdict.error };
  }

  await db.profile.update({ where: { id: targetProfileId }, data: { isActive: false } });
  logger.info("portal_account.deactivated", {
    actorId: viewer.id,
    societyId: viewer.societyId,
    targetId: targetProfileId,
    via: "portal",
  });
  revalidatePath("/portal/committee");
  return {};
}
