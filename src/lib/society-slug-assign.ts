import { db } from "@/lib/db";
import { RESERVED_SLUG_KEYS, slugFromName, slugKey } from "@/lib/society-slug";

/**
 * The public-page fields for a society being created (2026-11-27): an
 * address from its name, made unique with "-2", "-3"… the same way the
 * backfill migration did it. Spread into the create's data.
 */
export async function newPublicPageFields(name: string): Promise<{ publicSlug: string; publicSlugKey: string; publicPagePublishedAt: Date }> {
  let base = slugFromName(name);
  if (RESERVED_SLUG_KEYS.has(slugKey(base))) base = `${base}-society`;
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const key = slugKey(slug);
    const taken = await db.society.findUnique({ where: { publicSlugKey: key }, select: { id: true } });
    if (!taken) return { publicSlug: slug, publicSlugKey: key, publicPagePublishedAt: new Date() };
  }
  const slug = `${base}-${Date.now().toString(36)}`;
  return { publicSlug: slug, publicSlugKey: slugKey(slug), publicPagePublishedAt: new Date() };
}
