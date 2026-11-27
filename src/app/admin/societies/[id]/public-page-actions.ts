"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import { normaliseSlug, refuseSlug, slugKey } from "@/lib/society-slug";

/**
 * A society's public page settings (2026-11-27): its address, whether it is
 * live, whether the RWA's office-bearers are named on it, and the story
 * paragraph. Operations only — the page speaks for FirsThing in public.
 */
export async function savePublicPage(input: {
  societyId: string;
  slug: string;
  enabled: boolean;
  showLeadership: boolean;
  intro: string;
}): Promise<{ error?: string; saved?: true; slug?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("society.public_page_refused", { actorId: actor.id, actorTeam: actor.team, societyId: input.societyId });
    return { error: "A society's public page is an operations action." };
  }
  const slug = normaliseSlug(input.slug);
  const refusal = refuseSlug(slug);
  if (refusal) return { error: refusal };
  const key = slugKey(slug);
  const society = await db.society.findUnique({
    where: { id: input.societyId },
    select: { id: true, publicSlug: true, publicPageEnabled: true, publicShowLeadership: true, publicPagePublishedAt: true },
  });
  if (!society) return { error: "That society no longer exists." };
  const clash = await db.society.findUnique({ where: { publicSlugKey: key }, select: { id: true, name: true } });
  if (clash && clash.id !== society.id) return { error: `${clash.name} already uses that address.` };
  const intro = input.intro.trim();
  if (intro.length > 1200) return { error: "Keep the story under 1,200 characters." };

  await db.society.update({
    where: { id: society.id },
    data: {
      publicSlug: slug,
      publicSlugKey: key,
      publicPageEnabled: input.enabled,
      publicShowLeadership: input.showLeadership,
      publicIntro: intro || null,
      publicPagePublishedAt: society.publicPagePublishedAt ?? (input.enabled ? new Date() : null),
    },
  });
  logger.info("society.public_page_saved", {
    actorId: actor.id,
    societyId: society.id,
    slugFrom: society.publicSlug,
    slugTo: slug,
    enabled: input.enabled,
    showLeadership: input.showLeadership,
  });
  revalidatePath(`/admin/societies/${society.id}`);
  if (society.publicSlug) revalidatePath(`/${society.publicSlug}`);
  revalidatePath(`/${slug}`);
  return { saved: true, slug };
}
