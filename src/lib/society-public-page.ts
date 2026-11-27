import { cache } from "react";
import { db } from "@/lib/db";
import { publicS3Url } from "@/lib/s3";
import { slugKey } from "@/lib/society-slug";
import { publishedMonthsFor } from "@/lib/published-months-loader";
import { loadSocietyStandings } from "@/lib/society-standing-loader";
import { loadSocietyInstalledLights } from "@/lib/society-lights";
import { loadSocietyPumpSavings } from "@/lib/pump-savings-loader";
import { cleanHiddenSections, type PublicSectionKey } from "@/lib/public-page-sections";

/**
 * What a society's public page shows (2026-11-27, user-specified from the
 * "Featured Community" example). Public, so it carries only what a society's
 * RWA would show its residents — what FirsThing has done there, in energy
 * terms. No rupee amount anywhere (the user's rule), no phone numbers, and
 * leadership names only when the society has said they may be shown.
 * Everything is read from the records; nothing is sample text.
 */
export type SocietyPublicPage = {
  societyId: string;
  slug: string;
  enabled: boolean;
  /** Sections the back office has hidden; the page leaves them out. */
  hidden: PublicSectionKey[];
  /** Whether RWA members are named (publicShowLeadership). */
  showLeadership: boolean;
  name: string;
  location: string;
  flatCount: number | null;
  intro: string | null;
  /** YYYY-MM-DD — billing start, else the agreement's signature. */
  partnerSince: string | null;
  recognisedOn: Date;
  lights: { total: number; full: number; demo: number };
  tanks: number;
  pumpRoom: { beforeKwhPerKl: number; nowKwhPerKl: number | null; savedKwh: number; since: Date } | null;
  savings: { months: number; savedKwh: number; savingsPct: number | null } | null;
  testimonial: { quote: string; authorName: string; authorRole: string | null; authorPhotoUrl: string | null } | null;
  buildingPhotoUrl: string | null;
  leadership: { name: string; position: string }[];
};

/** A visit to /<slug>: null when there is no live page there. A hidden page
 *  (not yet made visible, 2026-11-28) opens only for staff, as a preview. */
export const loadSocietyPublicPage = cache(async (rawSlug: string, staff = false): Promise<{ page: SocietyPublicPage; hidden: boolean } | { redirectTo: string } | null> => {
  const typed = decodeURIComponent(rawSlug);
  const key = slugKey(typed);
  if (!key) return null;
  const s = await db.society.findUnique({ where: { publicSlugKey: key }, select: { id: true, status: true, publicSlug: true, publicPageEnabled: true } });
  if (!s || !s.publicSlug || s.status === "terminated") return null;
  if (!s.publicPageEnabled && !staff) return null;
  // One address on screen: /hydepark lands on /hyde-park if that is how it is stored.
  if (typed !== s.publicSlug) return { redirectTo: `/${s.publicSlug}` };
  const page = await loadPublicPageForSociety(s.id);
  return page ? { page, hidden: !s.publicPageEnabled } : null;
});

/**
 * Everything the page would show for one society, whether or not it is live —
 * the public route and the back office's editor read this one function, so
 * the editor's "what this section shows now" is the page itself.
 * Leadership names are read regardless of the switch, so the editor can list
 * them; the public route leaves them out while the switch is off.
 */
export const loadPublicPageForSociety = cache(async (societyId: string): Promise<SocietyPublicPage | null> => {
  const s = await db.society.findUnique({
    where: { id: societyId },
    select: {
      id: true, name: true, location: true, flatCount: true,
      publicSlug: true, publicPageEnabled: true, publicShowLeadership: true, publicIntro: true, publicPagePublishedAt: true, publicHiddenSections: true, createdAt: true,
    },
  });
  if (!s || !s.publicSlug) return null;

  const [standings, lights, tanks, pump, published, testimonial, members] = await Promise.all([
    loadSocietyStandings(),
    loadSocietyInstalledLights(s.id),
    db.waterTank.count({ where: { societyId: s.id, hasLevelSignal: true } }),
    loadSocietyPumpSavings(s.id).catch(() => null),
    publishedMonthsFor(s.id),
    db.testimonial.findFirst({
      // Published is the approval — the same rule as the homepage, so a
      // testimonial added in the back office shows too, not only one a
      // member submitted (with its consent) from the portal.
      where: { societyId: s.id, status: "published" },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      select: { quote: true, authorName: true, authorRole: true, authorPhotoKey: true, buildingPhotoKey: true },
    }),
    db.societyMember.findMany({
      where: { societyId: s.id, endedOn: null },
      select: { name: true, position: { select: { name: true, sortOrder: true } } },
    }),
  ]);
  const st = standings.get(s.id);
  const since = published.sinceStart;
  return {
      societyId: s.id,
      slug: s.publicSlug,
      enabled: s.publicPageEnabled,
      hidden: cleanHiddenSections(s.publicHiddenSections),
      showLeadership: s.publicShowLeadership,
      name: s.name,
      location: s.location,
      flatCount: s.flatCount,
      intro: s.publicIntro,
      partnerSince: st?.billingStart ?? st?.signedOn ?? null,
      recognisedOn: s.publicPagePublishedAt ?? s.createdAt,
      lights,
      tanks,
      pumpRoom: pump
        ? { beforeKwhPerKl: pump.baseline.kwhPerKl, nowKwhPerKl: pump.now?.kwhPerKl ?? null, savedKwh: pump.summary.overall.savedKwh, since: pump.baseline.savingsFrom }
        : null,
      savings: since && since.savedKwh > 0 ? { months: since.months, savedKwh: since.savedKwh, savingsPct: since.savingsPct } : null,
      testimonial: testimonial
        ? {
            quote: testimonial.quote,
            authorName: testimonial.authorName,
            authorRole: testimonial.authorRole,
            authorPhotoUrl: testimonial.authorPhotoKey ? publicS3Url(testimonial.authorPhotoKey) : null,
          }
        : null,
      buildingPhotoUrl: testimonial?.buildingPhotoKey ? publicS3Url(testimonial.buildingPhotoKey) : null,
      leadership: members
        .sort((a, b) => a.position.sortOrder - b.position.sortOrder || a.name.localeCompare(b.name))
        .map((m) => ({ name: m.name, position: m.position.name })),
  };
});
