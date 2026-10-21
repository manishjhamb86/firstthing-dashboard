"use server";

// Mark/unmark a society a defaulter (2026-10-21, user-asked). The rule lives
// in src/lib/defaulter.ts; these are thin DB/logging shells around it.
// Operations only (the PER-01 proxy: both manage_pipeline and manage_survey —
// the same gate close-actions.ts uses for rejecting a society), typed
// { error } on refusal, never thrown.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { refuseMarkDefaulter } from "@/lib/defaulter";

type Result = { error?: string; done?: string };

async function requireOps() {
  const admin = await resolveAdmin();
  if (!admin) return null;
  return admin.permissions.includes("manage_pipeline") && admin.permissions.includes("manage_survey") ? admin : null;
}

function revalidateAll(societyId: string) {
  revalidatePath(`/admin/societies/${societyId}`);
  revalidatePath("/admin/societies");
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/defaulters");
  revalidatePath("/admin");
}

export async function markSocietyDefaulter(societyId: string, reason: string): Promise<Result> {
  const admin = await requireOps();
  if (!admin) {
    logger.warn("society.mark_defaulter_refused", { societyId, why: "not_operations" });
    return { error: "Marking a society a defaulter is an operations action." };
  }
  const refusal = refuseMarkDefaulter(reason);
  if (refusal) {
    logger.warn("society.mark_defaulter_refused", { societyId, actorId: admin.id, why: refusal });
    return { error: refusal };
  }
  const society = await db.society.findUnique({ where: { id: societyId }, select: { markedDefaulterAt: true } });
  if (!society) return { error: "That society no longer exists." };
  if (society.markedDefaulterAt) return { error: "This society is already marked a defaulter." };
  await db.society.update({
    where: { id: societyId },
    data: { markedDefaulterAt: new Date(), markedDefaulterById: admin.id, markedDefaulterReason: reason.trim() },
  });
  logger.info("society.marked_defaulter", { societyId, actorId: admin.id, reason: reason.trim() });
  revalidateAll(societyId);
  return { done: "Society marked a defaulter — its notifications moved to the defaulter section." };
}

export async function unmarkSocietyDefaulter(societyId: string): Promise<Result> {
  const admin = await requireOps();
  if (!admin) {
    logger.warn("society.unmark_defaulter_refused", { societyId, why: "not_operations" });
    return { error: "Unmarking a society is an operations action." };
  }
  const society = await db.society.findUnique({ where: { id: societyId }, select: { markedDefaulterAt: true } });
  if (!society?.markedDefaulterAt) return { error: "This society is not marked a defaulter." };
  await db.society.update({
    where: { id: societyId },
    data: { markedDefaulterAt: null, markedDefaulterById: null, markedDefaulterReason: null },
  });
  logger.info("society.unmarked_defaulter", { societyId, actorId: admin.id });
  revalidateAll(societyId);
  return { done: "Defaulter mark removed — its notifications are back in the main window." };
}
