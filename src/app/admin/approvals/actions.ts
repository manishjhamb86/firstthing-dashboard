"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isSuperAdmin } from "@/lib/super-admin";
import { logger } from "@/lib/logger";
import { PENDING_APPROVAL_DISPATCH } from "./dispatch";
import { isPendingApprovalKind } from "@/lib/pending-approval";

type Outcome = { ok?: true; error?: string };

const PATH = "/admin/approvals";

/**
 * Re-invokes the owning action with the stored args, from the approver's own
 * session — the same function that would have run had the requester BEEN
 * the named account, so every validation it does runs again, against
 * CURRENT state. A refusal here means something moved underneath the
 * request (a different correction landed first, the thing being corrected
 * no longer exists) — the row stays pending with the refusal attached, not
 * silently marked approved.
 */
export async function approvePendingApproval(id: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!isSuperAdmin(admin.email)) {
    logger.warn("pending_approval.decide_refused", { actorId: admin.id, id, reason: "not_super_admin" });
    return { error: "Approving is restricted to one account." };
  }
  const row = await db.pendingApproval.findUnique({ where: { id } });
  if (!row) return { error: "That request is no longer on record." };
  if (row.status !== "pending") return { error: "This request has already been decided." };
  if (!isPendingApprovalKind(row.kind)) return { error: "This request's own action no longer exists." };

  const result = await PENDING_APPROVAL_DISPATCH[row.kind](row.args);
  const err = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : null;
  if (err) {
    await db.pendingApproval.update({ where: { id }, data: { appliedError: err } });
    logger.warn("pending_approval.apply_failed", { actorId: admin.id, id, kind: row.kind, error: err });
    return { error: err };
  }
  await db.pendingApproval.update({ where: { id }, data: { status: "approved", decidedById: admin.id, decidedAt: new Date(), appliedError: null } });
  logger.info("pending_approval.approved", { actorId: admin.id, id, kind: row.kind, requestedById: row.requestedById });
  revalidatePath(PATH);
  return { ok: true };
}

export async function rejectPendingApproval(id: string, note: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!isSuperAdmin(admin.email)) {
    logger.warn("pending_approval.decide_refused", { actorId: admin.id, id, reason: "not_super_admin" });
    return { error: "Rejecting is restricted to one account." };
  }
  if (!note.trim()) return { error: "Say why it is rejected — the requester reads this." };
  const row = await db.pendingApproval.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!row) return { error: "That request is no longer on record." };
  if (row.status !== "pending") return { error: "This request has already been decided." };
  await db.pendingApproval.update({ where: { id }, data: { status: "rejected", decidedById: admin.id, decidedAt: new Date(), decisionNote: note.trim() } });
  logger.info("pending_approval.rejected", { actorId: admin.id, id });
  revalidatePath(PATH);
  return { ok: true };
}

/** Only the person who raised it can take it back. */
export async function withdrawPendingApproval(id: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const row = await db.pendingApproval.findUnique({ where: { id }, select: { id: true, status: true, requestedById: true } });
  if (!row) return { error: "That request is no longer on record." };
  if (row.status !== "pending") return { error: "This request has already been decided." };
  if (row.requestedById !== admin.id) return { error: "Only the person who raised this request can withdraw it." };
  await db.pendingApproval.update({ where: { id }, data: { status: "withdrawn", decidedById: admin.id, decidedAt: new Date() } });
  logger.info("pending_approval.withdrawn", { actorId: admin.id, id });
  revalidatePath(PATH);
  return { ok: true };
}
