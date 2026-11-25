"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { logger } from "@/lib/logger";
import { refuseTestimonial } from "@/lib/homepage-content";

/**
 * A society member's testimonial (2026-11-25, user-asked). It waits for the
 * back office to review; nothing shows publicly until it is published. The
 * society is the viewer's own, from their row (INV-05), never the request.
 */
export async function submitTestimonial(input: { quote: string; authorName: string; authorRole: string; consent: boolean }): Promise<{ error?: string }> {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) return { error: "Your session has ended. Sign in again." };
  const refusal = refuseTestimonial({ ...input, needsConsent: true });
  if (refusal) return { error: refusal };
  const recent = await db.testimonial.count({ where: { submittedByProfileId: viewer.id, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } });
  if (recent >= 3) return { error: "You have sent three today — thank you! Please try again tomorrow." };
  const society = await db.society.findUnique({ where: { id: viewer.societyId }, select: { name: true } });
  const t = await db.testimonial.create({
    data: {
      quote: input.quote.trim(),
      authorName: input.authorName.trim(),
      authorRole: input.authorRole.trim() || null,
      societyId: viewer.societyId,
      place: society?.name ?? null,
      status: "pending",
      source: "portal",
      submittedByProfileId: viewer.id,
      consentAt: new Date(),
    },
  });
  logger.info("testimonial.submitted", { profileId: viewer.id, societyId: viewer.societyId, id: t.id });
  revalidatePath("/portal/testimonial");
  revalidatePath("/admin/homepage/testimonials");
  return {};
}
