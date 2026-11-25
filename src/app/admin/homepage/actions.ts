"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { refuseTestimonial } from "@/lib/homepage-content";

// The back office's say over the public homepage (2026-11-25, user-asked).
// Pipeline access, the same as Website enquiries — this is marketing content.

type Result = { error?: string };

async function staff() {
  const admin = await resolveAdmin();
  return admin && admin.permissions.includes("manage_pipeline") ? admin : null;
}

function refresh() {
  revalidatePath("/admin/homepage/testimonials");
  revalidatePath("/admin/homepage/societies");
  revalidatePath("/marketing");
  revalidatePath("/");
}

/** Publish, hold or reject a testimonial. Rejecting needs a reason. */
export async function reviewTestimonial(id: string, status: "published" | "held" | "rejected", note: string): Promise<Result> {
  const admin = await staff();
  if (!admin) {
    logger.warn("testimonial.review_refused", { id, reason: "permission" });
    return { error: "Reviewing testimonials needs pipeline access." };
  }
  const t = await db.testimonial.findUnique({ where: { id }, select: { status: true } });
  if (!t) return { error: "That testimonial is no longer on record." };
  if (status === "rejected" && !note.trim()) return { error: "Say why it is rejected — it is kept with the record." };
  await db.testimonial.update({
    where: { id },
    data: { status, reviewedById: admin.id, reviewedAt: new Date(), reviewNote: note.trim() || null },
  });
  logger.info("testimonial.reviewed", { actorId: admin.id, id, from: t.status, to: status });
  refresh();
  return {};
}

/** Correct a testimonial's words or how it is attributed, and its order. */
export async function updateTestimonial(id: string, input: { quote: string; authorName: string; authorRole: string; place: string; priority: number }): Promise<Result> {
  const admin = await staff();
  if (!admin) return { error: "Editing testimonials needs pipeline access." };
  const refusal = refuseTestimonial({ quote: input.quote, authorName: input.authorName });
  if (refusal) return { error: refusal };
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 999) return { error: "Order is a whole number from 0 to 999." };
  await db.testimonial.update({
    where: { id },
    data: { quote: input.quote.trim(), authorName: input.authorName.trim(), authorRole: input.authorRole.trim() || null, place: input.place.trim() || null, priority: input.priority },
  });
  logger.info("testimonial.edited", { actorId: admin.id, id });
  refresh();
  return {};
}

/** Add one from the back office (a quote given by email or phone). It starts on hold. */
export async function addTestimonial(input: { quote: string; authorName: string; authorRole: string; place: string; societyId: string }): Promise<Result> {
  const admin = await staff();
  if (!admin) return { error: "Adding testimonials needs pipeline access." };
  const refusal = refuseTestimonial({ quote: input.quote, authorName: input.authorName });
  if (refusal) return { error: refusal };
  const t = await db.testimonial.create({
    data: {
      quote: input.quote.trim(),
      authorName: input.authorName.trim(),
      authorRole: input.authorRole.trim() || null,
      place: input.place.trim() || null,
      societyId: input.societyId || null,
      status: "held",
      source: "back_office",
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  logger.info("testimonial.added", { actorId: admin.id, id: t.id });
  refresh();
  return {};
}

/** How a society's savings appear on the homepage: auto-ranked, pinned first, or held off. */
export async function setHomepageSocietyStat(societyId: string, mode: "auto" | "pinned" | "held", priority: number): Promise<Result> {
  const admin = await staff();
  if (!admin) {
    logger.warn("homepage.society_stat_refused", { societyId, reason: "permission" });
    return { error: "Changing the homepage needs pipeline access." };
  }
  if (!Number.isInteger(priority) || priority < 0 || priority > 999) return { error: "Order is a whole number from 0 to 999." };
  const society = await db.society.findUnique({ where: { id: societyId }, select: { id: true } });
  if (!society) return { error: "That society is no longer on record." };
  if (mode === "auto") await db.homepageSocietyStat.deleteMany({ where: { societyId } });
  else
    await db.homepageSocietyStat.upsert({
      where: { societyId },
      create: { societyId, mode, priority, updatedById: admin.id },
      update: { mode, priority, updatedById: admin.id },
    });
  logger.info("homepage.society_stat_set", { actorId: admin.id, societyId, mode, priority });
  refresh();
  return {};
}
