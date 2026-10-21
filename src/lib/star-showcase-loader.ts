import { cache } from "react";
import { db } from "@/lib/db";
import { allPaymentRatings, emptyRating } from "@/lib/payment-rating-loader";
import { loadSocietyStandings } from "@/lib/society-standing-loader";
import type { PaymentRating } from "@/lib/payment-rating";
import { isCandidate, isLive, stillShowable } from "@/lib/star-showcase";

const consentOf = <T extends { withdrawnAt: Date | null }>(rows: T[]) => rows.find((c) => c.withdrawnAt === null) ?? null;

/** Everything the back office's star page reads, one row per society. */
export async function loadShowcaseAdmin(now = new Date()) {
  const [societies, ratings] = await Promise.all([
    db.society.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        location: true,
        closedAt: true,
        markedDefaulterAt: true,
        showcaseConsents: {
          orderBy: { recordedAt: "desc" },
          select: { id: true, givenBy: true, givenOn: true, note: true, recordedAt: true, withdrawnAt: true, withdrawnReason: true, recordedBy: { select: { name: true, email: true } } },
        },
        starListings: {
          orderBy: { proposedAt: "desc" },
          include: {
            proposedBy: { select: { name: true, email: true } },
            decidedBy: { select: { name: true, email: true } },
            withdrawnBy: { select: { name: true, email: true } },
          },
        },
      },
    }),
    allPaymentRatings(now),
  ]);
  return societies.map((s) => {
    const rating = ratings.get(s.id) ?? emptyRating(now);
    const consent = consentOf(s.showcaseConsents);
    const facts = { closed: s.closedAt !== null, markedDefaulter: s.markedDefaulterAt !== null, hasConsent: consent !== null };
    const live = s.starListings.find((l) => isLive(l, now)) ?? null;
    const pending = s.starListings.find((l) => l.status === "proposed") ?? null;
    return {
      society: { id: s.id, name: s.name, location: s.location },
      rating,
      facts,
      consent,
      consents: s.showcaseConsents,
      listings: s.starListings,
      live,
      pending,
      candidate: isCandidate(rating, facts, s.starListings, now),
      /** Why a live listing is not on the portal right now, or null. */
      hiddenReason: live ? stillShowable(rating, facts) : null,
    };
  });
}

export type StarCard = {
  societyId: string;
  name: string;
  location: string;
  stars: number | null;
  summary: string | null;
  since: string;
};

/**
 * The cards other societies see: approved, not expired, consent still in
 * force, and the facts still true today. A listing whose society has since
 * fallen behind simply stops showing — nothing about it is shown instead.
 */
export const publicStarCards = cache(async (now: Date = new Date()): Promise<StarCard[]> => {
  const listings = await db.starListing.findMany({
    where: { status: "approved", expiresAt: { gt: now } },
    orderBy: { decidedAt: "asc" },
    select: {
      societyId: true,
      summary: true,
      showSummary: true,
      decidedAt: true,
      ratingStars: true,
      society: {
        select: {
          name: true,
          location: true,
          closedAt: true,
          markedDefaulterAt: true,
          showcaseConsents: { where: { withdrawnAt: null }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (listings.length === 0) return [];
  const ratings = await allPaymentRatings(now);
  const cards: StarCard[] = [];
  for (const l of listings) {
    const rating = ratings.get(l.societyId) ?? emptyRating(now);
    const facts = {
      closed: l.society.closedAt !== null,
      markedDefaulter: l.society.markedDefaulterAt !== null,
      hasConsent: l.society.showcaseConsents.length > 0,
    };
    if (stillShowable(rating, facts)) continue;
    cards.push({
      societyId: l.societyId,
      name: l.society.name,
      location: l.society.location,
      stars: rating.stars ?? l.ratingStars,
      summary: l.showSummary ? l.summary : null,
      since: (l.decidedAt ?? now).toISOString(),
    });
  }
  return cards;
});

export type ShowcaseStats = {
  societiesServed: number;
  starCount: number;
  /** Of the societies with an invoice due, how many have nothing unpaid past due. */
  fullyPaid: number;
  withInvoicesDue: number;
  asOf: string;
};

/** The figures above the showcase — aggregates only, no society named. */
export async function showcaseStats(now = new Date()): Promise<ShowcaseStats> {
  const [standings, ratings, cards] = await Promise.all([loadSocietyStandings(), allPaymentRatings(now), publicStarCards(now)]);
  const served = [...standings.values()].filter((s) => s.standing === "active").length;
  const due = [...ratings.values()].filter((r: PaymentRating) => r.counted > 0);
  return {
    societiesServed: served,
    starCount: cards.length,
    fullyPaid: due.filter((r) => r.openCount === 0).length,
    withInvoicesDue: due.length,
    asOf: now.toISOString(),
  };
}

/** How many societies the system has raised for review — the notification count. */
export async function showcaseCandidateCount(now = new Date()): Promise<number> {
  const rows = await loadShowcaseAdmin(now);
  return rows.filter((r) => r.candidate).length;
}
