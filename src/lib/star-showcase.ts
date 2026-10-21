// The star partner showcase's rules (2026-10-21). Pure — the actions and the
// loaders are DB shells around these, so "who may be shown" is decided in one
// place and the approval re-check, the portal and the back office agree.
//
// The user's calls: shown only with the committee's recorded consent; the
// system flags a society that qualifies and an admin approves it; an admin
// may also propose one by hand, which a DIFFERENT admin must approve; a
// society's low rating is never shown to anyone but itself.

import { qualifiesToEnter, type PaymentRating } from "@/lib/payment-rating";

/** An approved listing lasts this long, then must be approved again. */
export const SHOWCASE_DAYS = 90;
/** A candidate an admin turned down is not raised again for this long. */
export const REJECTION_QUIET_DAYS = 90;

const DAY = 86_400_000;

export function showcaseExpiry(from: Date): Date {
  return new Date(from.getTime() + SHOWCASE_DAYS * DAY);
}

export type ShowcaseSocietyFacts = {
  /** Society.closedAt — rejected or terminated as a whole. */
  closed: boolean;
  /** Society.markedDefaulterAt set. */
  markedDefaulter: boolean;
  hasConsent: boolean;
};

/**
 * Whether a listed society may still be shown today. Approval proved the
 * facts once; this keeps the card true afterwards. A society shown with no
 * rating yet (a manual listing for a new society) stays showable until it
 * has an unpaid bill past due.
 */
export function stillShowable(r: PaymentRating, f: ShowcaseSocietyFacts): string | null {
  if (f.closed) return "The society's engagement has ended.";
  if (f.markedDefaulter) return "The society is marked a defaulter.";
  if (!f.hasConsent) return "The committee's consent has been withdrawn.";
  if (r.openCount > 0) return `${r.openCount} unpaid invoice${r.openCount === 1 ? " is" : "s are"} past due.`;
  if (r.stars !== null && r.stars < 4) return `The payment rating has fallen to ${r.stars} star${r.stars === 1 ? "" : "s"}.`;
  return null;
}

export function isLive(l: { status: string; expiresAt: Date | null }, now: Date): boolean {
  return l.status === "approved" && l.expiresAt !== null && l.expiresAt > now;
}

/**
 * Why the system would raise this society for review — or null. It qualifies
 * when it earns 5 stars with nothing past due, is not closed or marked a
 * defaulter, holds no live or pending listing, and was not turned down in
 * the last REJECTION_QUIET_DAYS.
 */
export function isCandidate(
  r: PaymentRating,
  f: Omit<ShowcaseSocietyFacts, "hasConsent">,
  listings: Array<{ status: string; expiresAt: Date | null; decidedAt: Date | null }>,
  now: Date,
): boolean {
  if (f.closed || f.markedDefaulter || !qualifiesToEnter(r)) return false;
  if (listings.some((l) => l.status === "proposed" || isLive(l, now))) return false;
  const quietFrom = now.getTime() - REJECTION_QUIET_DAYS * DAY;
  return !listings.some((l) => l.status === "rejected" && l.decidedAt && l.decidedAt.getTime() > quietFrom);
}

/**
 * Refuses an approval, in words, or returns null. The same rule for an
 * auto-flagged candidate and a manual proposal, re-run against fresh rows at
 * the moment of approval.
 */
export function refuseApproval(input: {
  origin: "auto" | "manual";
  rating: PaymentRating;
  facts: ShowcaseSocietyFacts;
  approverId: string;
  proposedById: string | null;
}): string | null {
  const { origin, rating, facts } = input;
  if (origin === "manual" && input.proposedById === input.approverId) {
    return "You proposed this society, so another admin has to approve it.";
  }
  if (!facts.hasConsent) return "Record the committee's consent before approving — a society is shown only with its agreement.";
  if (origin === "auto" && !qualifiesToEnter(rating)) {
    return "The society no longer qualifies: it needs 5 stars with nothing unpaid past due.";
  }
  return stillShowable(rating, facts);
}

export function refuseConsent(givenBy: string, givenOn: Date, now: Date): string | null {
  if (!givenBy.trim()) return "Say who on the committee agreed, as they signed.";
  if (Number.isNaN(givenOn.getTime())) return "Enter the date the committee agreed.";
  if (givenOn.getTime() > now.getTime()) return "The date the committee agreed cannot be in the future.";
  return null;
}
