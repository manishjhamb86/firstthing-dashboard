import { db } from "@/lib/db";
import { publishedMonthsFor } from "@/lib/published-months-loader";
import { rankHomepageSocieties, type SocietyFigures, type StatSetting } from "@/lib/homepage-content";

/** How many societies the homepage's results section shows. */
export const HOMEPAGE_SOCIETY_LIMIT = 3;

/**
 * Every society with a published (released) month, with its figures and its
 * homepage setting, ranked. The figures are the ones the society's own portal
 * shows — released months only, live versions only — so the homepage can
 * never quote a number the customer has not been shown.
 */
export async function loadHomepageSocieties() {
  const [released, settings] = await Promise.all([
    db.monthlyCalculation.findMany({ where: { releasedAt: { not: null } }, distinct: ["societyId"], select: { societyId: true } }),
    db.homepageSocietyStat.findMany(),
  ]);
  const societies = await db.society.findMany({
    where: { id: { in: released.map((r) => r.societyId) } },
    select: { id: true, name: true, location: true },
  });
  const rows: SocietyFigures[] = [];
  for (const s of societies) {
    const summary = await publishedMonthsFor(s.id);
    rows.push({
      societyId: s.id,
      name: s.name,
      location: s.location,
      savingsPct: summary.sinceStart?.savingsPct ?? null,
      savedValue: summary.sinceStart?.savedValue ?? 0,
      months: summary.sinceStart?.months ?? 0,
    });
  }
  const map = new Map<string, StatSetting>(settings.map((x) => [x.societyId, { mode: x.mode, priority: x.priority }]));
  return rankHomepageSocieties(rows, map, HOMEPAGE_SOCIETY_LIMIT);
}

/** Published testimonials, in the order the back office set. */
export async function loadPublishedTestimonials() {
  return db.testimonial.findMany({
    where: { status: "published" },
    orderBy: [{ priority: "asc" }, { reviewedAt: "desc" }],
    take: 12,
    select: { id: true, quote: true, authorName: true, authorRole: true, place: true, authorPhotoKey: true, buildingPhotoKey: true, society: { select: { name: true } } },
  });
}
