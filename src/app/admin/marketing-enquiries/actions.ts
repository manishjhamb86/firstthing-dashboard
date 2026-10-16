"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";

/**
 * Following up on the public homepage's lead-capture form (2026-10-16).
 * Gated to manage_pipeline — this is sales territory (PER-07, the same
 * permission that gates the deal pipeline itself), not society management.
 * Resolved from the row, typed errors, a log line per outcome: the standing
 * action shape this codebase uses everywhere.
 */
export async function markEnquiryFollowedUp(
  enquiryId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_pipeline")) {
    logger.warn("admin.marketing_enquiry_followup_refused", { actorId: admin.id, enquiryId, reason: "permission" });
    return { error: "Following up on a marketing enquiry is sales work (Manage pipeline)." };
  }

  const trimmed = note.trim();
  // Same rule as the ticket desk's own resolve: a closed row with no stated
  // outcome is indistinguishable from one closed to tidy a list.
  if (!trimmed) return { error: "Say what came of it." };

  const enquiry = await db.marketingEnquiry.findUnique({ where: { id: enquiryId }, select: { id: true } });
  if (!enquiry) return { error: "That enquiry no longer exists." };

  await db.marketingEnquiry.update({
    where: { id: enquiry.id },
    data: { followedUpAt: new Date(), followedUpById: admin.id, followedUpNote: trimmed },
  });
  logger.info("admin.marketing_enquiry_followed_up", { enquiryId: enquiry.id, actorId: admin.id });
  revalidatePath("/admin/marketing-enquiries");
  return { ok: true };
}

/** Undo a follow-up marked by mistake — the same "Undo"/"Reopen" symmetry every other list in this codebase offers. */
export async function reopenEnquiry(enquiryId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_pipeline")) {
    logger.warn("admin.marketing_enquiry_reopen_refused", { actorId: admin.id, enquiryId, reason: "permission" });
    return { error: "Following up on a marketing enquiry is sales work (Manage pipeline)." };
  }

  const enquiry = await db.marketingEnquiry.findUnique({ where: { id: enquiryId }, select: { id: true } });
  if (!enquiry) return { error: "That enquiry no longer exists." };

  await db.marketingEnquiry.update({
    where: { id: enquiry.id },
    data: { followedUpAt: null, followedUpById: null, followedUpNote: null },
  });
  logger.info("admin.marketing_enquiry_reopened", { enquiryId: enquiry.id, actorId: admin.id });
  revalidatePath("/admin/marketing-enquiries");
  return { ok: true };
}
