"use server";

// Facility management companies (2026-09-25) — thin shells around
// src/lib/facility-management.ts. Same gate as society members: the people
// who keep a society's contacts keep its facility management records too.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { fmNameKey, planSpanChange, refuseFmCompany } from "@/lib/facility-management";
import { normaliseMobile } from "@/lib/society-members";

type Result<T = object> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T);

async function requireFmStaff() {
  const a = await resolveAdmin();
  return a && (a.permissions.includes("manage_users") || a.permissions.includes("manage_pipeline")) ? a : null;
}
const REFUSED = "Keeping facility management records needs Manage users or Manage pipeline.";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type FmCompanyInput = { name: string; gstin: string; contact: string; phone: string; email: string; address: string; notes: string };

export async function createFmCompany(input: FmCompanyInput): Promise<Result<{ id: string; name: string }>> {
  const a = await requireFmStaff();
  if (!a) return { error: REFUSED };
  const refusal = refuseFmCompany(input);
  if (refusal) return { error: refusal };
  const nameKey = fmNameKey(input.name);
  const dup = await db.facilityManagementCompany.findUnique({ where: { nameKey } });
  if (dup) return { error: `${dup.name} is already on the list.`, id: dup.id, name: dup.name };
  const c = await db.facilityManagementCompany.create({
    data: {
      name: input.name.trim(),
      nameKey,
      gstin: input.gstin.trim().toUpperCase() || null,
      contact: input.contact.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim().toLowerCase() || null,
      address: input.address.trim() || null,
      notes: input.notes.trim() || null,
      createdById: a.id,
    },
  });
  logger.info("fm.company_created", { actorId: a.id, companyId: c.id, name: c.name });
  revalidatePath("/admin/facility-management");
  return { id: c.id, name: c.name };
}

export async function updateFmCompany(id: string, input: FmCompanyInput & { active: boolean }): Promise<Result> {
  const a = await requireFmStaff();
  if (!a) return { error: REFUSED };
  const refusal = refuseFmCompany(input);
  if (refusal) return { error: refusal };
  const nameKey = fmNameKey(input.name);
  const clash = await db.facilityManagementCompany.findUnique({ where: { nameKey } });
  if (clash && clash.id !== id) return { error: `${clash.name} is already on the list — renaming this one to match would make two records for one company.` };
  await db.facilityManagementCompany.update({
    where: { id },
    data: {
      name: input.name.trim(),
      nameKey,
      gstin: input.gstin.trim().toUpperCase() || null,
      contact: input.contact.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim().toLowerCase() || null,
      address: input.address.trim() || null,
      notes: input.notes.trim() || null,
      active: input.active,
    },
  });
  logger.info("fm.company_updated", { actorId: a.id, companyId: id });
  revalidatePath("/admin/facility-management");
  revalidatePath(`/admin/facility-management/${id}`);
  return {};
}

/** Which company runs this society's facilities, from `since`. Null records that none does any more. */
export async function setSocietyFmCompany(societyId: string, companyId: string | null, since: string, reason: string): Promise<Result> {
  const a = await requireFmStaff();
  if (!a) return { error: REFUSED };
  if (!ISO.test(since)) return { error: "Enter the date the change took effect." };
  const open = await db.societyFmEngagement.findFirst({ where: { societyId, endedOn: null } });
  const plan = planSpanChange(open, companyId, new Date(`${since}T00:00:00Z`));
  if (plan.kind === "refuse") return { error: plan.error };
  if (plan.kind === "none") return {};
  if (plan.kind === "correct") {
    if (plan.companyId) await db.societyFmEngagement.update({ where: { id: plan.id }, data: { companyId: plan.companyId } });
    else await db.societyFmEngagement.delete({ where: { id: plan.id } });
    logger.info("fm.society_company_corrected", { actorId: a.id, societyId, to: companyId });
    revalidatePath(`/admin/societies/${societyId}`);
    revalidatePath("/admin/facility-management");
    return {};
  }
  await db.$transaction(async (tx) => {
    if (plan.close) await tx.societyFmEngagement.update({ where: { id: plan.close.id }, data: { endedOn: plan.close.endedOn, endReason: reason.trim() || null } });
    if (plan.open) await tx.societyFmEngagement.create({ data: { societyId, companyId: plan.open.companyId, startedOn: plan.open.startedOn, recordedById: a.id } });
  });
  logger.info("fm.society_company_set", { actorId: a.id, societyId, from: open?.companyId ?? null, to: companyId, since });
  revalidatePath(`/admin/societies/${societyId}`);
  revalidatePath("/admin/facility-management");
  return {};
}

/**
 * A person's employer, from `since` — called for a society member who works
 * for a facility management company. The person is their mobile: a current
 * employment elsewhere ends the day before, which is how a move between
 * companies keeps its history. Null ends the current employment.
 */
export async function setMemberEmployment(memberId: string, companyId: string | null, since: string): Promise<Result> {
  const a = await requireFmStaff();
  if (!a) return { error: REFUSED };
  if (!ISO.test(since)) return { error: "Enter the date." };
  const m = await db.societyMember.findUnique({ where: { id: memberId }, include: { position: { select: { name: true } } } });
  if (!m) return { error: "That member no longer exists." };
  const mobile = normaliseMobile(m.mobile);
  if (!mobile) return { error: "This member's mobile is not a valid Indian mobile, so they cannot be tracked across companies." };
  const open = await db.fmEmployment.findFirst({ where: { mobile, endedOn: null } });
  const plan = planSpanChange(open, companyId, new Date(`${since}T00:00:00Z`));
  if (plan.kind === "refuse") return { error: plan.error };
  if (plan.kind === "none") {
    // Same company: keep the span, but make sure it points at this member record.
    if (open && open.societyMemberId !== memberId) await db.fmEmployment.update({ where: { id: open.id }, data: { societyMemberId: memberId } });
    return {};
  }
  if (plan.kind === "correct") {
    if (plan.companyId) await db.fmEmployment.update({ where: { id: plan.id }, data: { companyId: plan.companyId, societyMemberId: memberId } });
    else await db.fmEmployment.delete({ where: { id: plan.id } });
    logger.info("fm.employment_corrected", { actorId: a.id, memberId, to: companyId });
    revalidatePath(`/admin/societies/${m.societyId}/members`);
    revalidatePath("/admin/facility-management");
    return {};
  }
  const toName = plan.open ? (await db.facilityManagementCompany.findUnique({ where: { id: plan.open.companyId }, select: { name: true } }))?.name : null;
  await db.$transaction(async (tx) => {
    if (plan.close) await tx.fmEmployment.update({ where: { id: plan.close.id }, data: { endedOn: plan.close.endedOn, endReason: toName ? `Moved to ${toName}` : "Left the company" } });
    if (plan.open)
      await tx.fmEmployment.create({
        data: {
          companyId: plan.open.companyId,
          personName: m.name,
          mobile,
          email: m.email,
          designation: m.position?.name ?? null,
          startedOn: plan.open.startedOn,
          societyMemberId: memberId,
          recordedById: a.id,
        },
      });
  });
  logger.info("fm.employment_set", { actorId: a.id, memberId, mobile: `…${mobile.slice(-4)}`, from: open?.companyId ?? null, to: companyId, since });
  revalidatePath(`/admin/societies/${m.societyId}/members`);
  revalidatePath("/admin/facility-management");
  return {};
}
