"use server";

// Society members & positions (2026-09-25) — thin shells around
// src/lib/society-members.ts. Recording who is on a society's committee is
// the society-facing (manage_users) or sales (manage_pipeline) team's work;
// giving someone a portal login stays manage_users, as it always was.

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { PortalAuthority } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { sanitizeGrants } from "@/lib/portal-access";
import { normaliseMobile, positionKey, refuseEnd, refuseMember, temporaryPassword, type MemberInput } from "@/lib/society-members";

type Result<T = object> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T);

async function requireMembersStaff() {
  const a = await resolveAdmin();
  return a && (a.permissions.includes("manage_users") || a.permissions.includes("manage_pipeline")) ? a : null;
}
const REFUSED = "Recording society members needs society-management or pipeline access.";

function day(s: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
}
function refresh(societyId: string) {
  revalidatePath(`/admin/societies/${societyId}/members`);
  revalidatePath(`/admin/societies/${societyId}`);
}

/** The chosen position, or a new one added to the list (matched case-insensitively). */
async function resolvePosition(input: MemberInput): Promise<string> {
  if (input.positionId) return input.positionId;
  const nameKey = positionKey(input.newPosition);
  const pos = await db.memberPosition.upsert({
    where: { nameKey },
    create: { name: input.newPosition.trim().replace(/\s+/g, " "), nameKey },
    update: { active: true },
  });
  return pos.id;
}

/** A current member of this society already on this mobile, other than `exceptId`. */
async function sameMobile(societyId: string, mobile: string, exceptId?: string) {
  return db.societyMember.findFirst({
    where: { societyId, mobile, endedOn: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
}

export async function addMember(societyId: string, input: MemberInput & { startedOn: string; notes: string; profileId?: string }): Promise<Result<{ id: string }>> {
  const admin = await requireMembersStaff();
  if (!admin) return { error: REFUSED };
  const refusal = refuseMember(input);
  if (refusal) return { error: refusal };
  const mobile = normaliseMobile(input.mobile)!;
  const dup = await sameMobile(societyId, mobile);
  if (dup) return { error: `${dup.name} is already a current member on this mobile number.` };
  if (input.profileId) {
    const p = await db.profile.findUnique({ where: { id: input.profileId }, select: { societyId: true } });
    if (!p || p.societyId !== societyId) return { error: "That portal account is not this society's." };
    const linked = await db.societyMember.findUnique({ where: { profileId: input.profileId } });
    if (linked) return { error: "That portal account is already linked to a member." };
  }
  const positionId = await resolvePosition(input);
  const m = await db.societyMember.create({
    data: {
      societyId,
      name: input.name.trim(),
      mobile,
      email: input.email.trim().toLowerCase() || null,
      positionId,
      startedOn: day(input.startedOn),
      notes: input.notes.trim() || null,
      profileId: input.profileId || null,
      createdById: admin.id,
    },
  });
  logger.info("society_member.added", { actorId: admin.id, societyId, memberId: m.id, positionId });
  refresh(societyId);
  return { id: m.id };
}

/** Correct what a member's record says — a correction, not a change of person. */
export async function updateMember(memberId: string, input: MemberInput & { startedOn: string; notes: string }): Promise<Result> {
  const admin = await requireMembersStaff();
  if (!admin) return { error: REFUSED };
  const m = await db.societyMember.findUnique({ where: { id: memberId } });
  if (!m) return { error: "That member no longer exists." };
  const refusal = refuseMember(input);
  if (refusal) return { error: refusal };
  const mobile = normaliseMobile(input.mobile)!;
  if (!m.endedOn) {
    const dup = await sameMobile(m.societyId, mobile, m.id);
    if (dup) return { error: `${dup.name} is already a current member on this mobile number.` };
  }
  const positionId = await resolvePosition(input);
  await db.societyMember.update({
    where: { id: memberId },
    data: { name: input.name.trim(), mobile, email: input.email.trim().toLowerCase() || null, positionId, startedOn: day(input.startedOn), notes: input.notes.trim() || null },
  });
  logger.info("society_member.corrected", { actorId: admin.id, memberId });
  refresh(m.societyId);
  return {};
}

async function deactivateLinkedPortal(profileId: string | null, actorId: string) {
  if (!profileId) return;
  const p = await db.profile.findUnique({ where: { id: profileId }, select: { portalAuthority: true, isActive: true } });
  if (!p?.isActive) return;
  await db.profile.update({ where: { id: profileId }, data: { isActive: false } });
  logger.info("portal_account.deactivated_with_member", { actorId, profileId });
}

/** They stopped holding the position — kept on record, off the current list. */
export async function endMember(memberId: string, input: { endedOn: string; reason: string; deactivatePortal: boolean }): Promise<Result> {
  const admin = await requireMembersStaff();
  if (!admin) return { error: REFUSED };
  const m = await db.societyMember.findUnique({ where: { id: memberId } });
  if (!m) return { error: "That member no longer exists." };
  if (m.endedOn) return { error: "They are already a past member." };
  const refusal = refuseEnd({ ...input, startedOn: m.startedOn, now: new Date() });
  if (refusal) return { error: refusal };
  if (input.deactivatePortal && m.profileId) {
    const p = await db.profile.findUnique({ where: { id: m.profileId }, select: { portalAuthority: true, isActive: true } });
    if (p?.isActive && p.portalAuthority === "office_bearer")
      return { error: "Their portal account holds the office-bearer designation — transfer it to someone else first, or keep their account." };
  }
  await db.societyMember.update({ where: { id: memberId }, data: { endedOn: day(input.endedOn), endReason: input.reason.trim(), endedById: admin.id } });
  if (input.deactivatePortal) await deactivateLinkedPortal(m.profileId, admin.id);
  logger.info("society_member.ended", { actorId: admin.id, memberId, reason: input.reason.trim() });
  refresh(m.societyId);
  return {};
}

/** Someone new takes over the position: the old member is ended and linked to their successor. */
export async function replaceMember(
  memberId: string,
  input: { endedOn: string; reason: string; deactivatePortal: boolean; successor: MemberInput & { notes: string } },
): Promise<Result> {
  const admin = await requireMembersStaff();
  if (!admin) return { error: REFUSED };
  const m = await db.societyMember.findUnique({ where: { id: memberId } });
  if (!m) return { error: "That member no longer exists." };
  if (m.endedOn) return { error: "They are already a past member." };
  const endRefusal = refuseEnd({ endedOn: input.endedOn, reason: input.reason, startedOn: m.startedOn, now: new Date() });
  if (endRefusal) return { error: endRefusal };
  const refusal = refuseMember(input.successor);
  if (refusal) return { error: `The new member: ${refusal.charAt(0).toLowerCase()}${refusal.slice(1)}` };
  const mobile = normaliseMobile(input.successor.mobile)!;
  const dup = await sameMobile(m.societyId, mobile, m.id);
  if (dup) return { error: `${dup.name} is already a current member on this mobile number.` };
  if (input.deactivatePortal && m.profileId) {
    const p = await db.profile.findUnique({ where: { id: m.profileId }, select: { portalAuthority: true, isActive: true } });
    if (p?.isActive && p.portalAuthority === "office_bearer")
      return { error: "Their portal account holds the office-bearer designation — transfer it to someone else first, or keep their account." };
  }
  const positionId = await resolvePosition(input.successor);
  const endedOn = day(input.endedOn)!;
  const successor = await db.$transaction(async (tx) => {
    const s = await tx.societyMember.create({
      data: {
        societyId: m.societyId,
        name: input.successor.name.trim(),
        mobile,
        email: input.successor.email.trim().toLowerCase() || null,
        positionId,
        startedOn: endedOn,
        notes: input.successor.notes.trim() || null,
        createdById: admin.id,
      },
    });
    await tx.societyMember.update({ where: { id: m.id }, data: { endedOn, endReason: input.reason.trim(), endedById: admin.id, replacedById: s.id } });
    return s;
  });
  if (input.deactivatePortal) await deactivateLinkedPortal(m.profileId, admin.id);
  logger.info("society_member.replaced", { actorId: admin.id, memberId, successorId: successor.id });
  refresh(m.societyId);
  return {};
}

/** Give a member a portal login from their record — restricted to the chosen modules. */
export async function createMemberPortalAccess(
  memberId: string,
  input: { authority: PortalAuthority; grants: string[] },
): Promise<Result<{ email: string; password: string }>> {
  const admin = await resolveAdmin();
  if (!admin || !admin.permissions.includes("manage_users")) return { error: "Creating portal logins needs society-management access." };
  const m = await db.societyMember.findUnique({ where: { id: memberId } });
  if (!m) return { error: "That member no longer exists." };
  if (m.endedOn) return { error: "They are a past member — portal access is for current members." };
  if (m.profileId) return { error: "They already have a portal login." };
  if (!m.email) return { error: "Add their email first — it is their login." };
  if (!["office_bearer", "committee", "manager"].includes(input.authority)) return { error: "Choose their authority." };
  const grants = sanitizeGrants(input.grants);
  if (!grants) return { error: "Unknown access selected." };
  if (input.authority === "office_bearer") {
    const existing = await db.profile.findFirst({ where: { societyId: m.societyId, portalAuthority: "office_bearer", isActive: true }, select: { name: true, email: true } });
    if (existing)
      return { error: `${existing.name ?? existing.email} already holds the office-bearer designation — it moves by transfer, so give this member committee or manager authority.` };
  }
  const [p, a] = await Promise.all([db.profile.findUnique({ where: { email: m.email } }), db.adminUser.findUnique({ where: { email: m.email } })]);
  if (p || a) return { error: "That email already has a login — use another, or link the existing account." };
  const password = temporaryPassword();
  const profile = await db.profile.create({
    data: {
      email: m.email,
      name: m.name,
      passwordHash: await bcrypt.hash(password, 10),
      portalAuthority: input.authority,
      grants,
      societyId: m.societyId,
    },
  });
  await db.societyMember.update({ where: { id: m.id }, data: { profileId: profile.id } });
  logger.info("portal_account.created_from_member", { actorId: admin.id, memberId, profileId: profile.id, authority: input.authority, grants });
  refresh(m.societyId);
  return { email: m.email, password };
}

// ---------------------------------------------------------------------------
// Positions — the managed list
// ---------------------------------------------------------------------------

export async function createPosition(name: string): Promise<Result> {
  const admin = await requireMembersStaff();
  if (!admin) return { error: REFUSED };
  const nameKey = positionKey(name);
  if (!nameKey) return { error: "Name the position." };
  const existing = await db.memberPosition.findUnique({ where: { nameKey } });
  if (existing) return { error: `"${existing.name}" is already on the list.` };
  await db.memberPosition.create({ data: { name: name.trim().replace(/\s+/g, " "), nameKey } });
  logger.info("member_position.created", { actorId: admin.id, name: name.trim() });
  revalidatePath("/admin/settings/positions");
  return {};
}

export async function setPositionActive(id: string, active: boolean): Promise<Result> {
  const admin = await requireMembersStaff();
  if (!admin) return { error: REFUSED };
  await db.memberPosition.update({ where: { id }, data: { active } });
  logger.info("member_position.set_active", { actorId: admin.id, id, active });
  revalidatePath("/admin/settings/positions");
  return {};
}
