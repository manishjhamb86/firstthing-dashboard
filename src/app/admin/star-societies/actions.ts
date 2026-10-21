"use server";

// Star partner societies (2026-10-21) — thin DB/logging shells around
// src/lib/star-showcase.ts and src/lib/payment-rating.ts. Every refusal is a
// typed { error } with a log line, never a throw.
//
// Who does what:
//   - recording or withdrawing a committee's consent, and proposing a society
//     by hand: operations (both manage_pipeline and manage_survey) or any
//     holder of approve_showcase;
//   - approving or rejecting: approve_showcase only, and never one's own
//     manual proposal.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { societyPaymentRating } from "@/lib/payment-rating-loader";
import { starSummary } from "@/lib/payment-rating";
import { isLive, refuseApproval, refuseConsent, showcaseExpiry } from "@/lib/star-showcase";

type Result = { error?: string; done?: string };

type Admin = NonNullable<Awaited<ReturnType<typeof resolveAdmin>>>;
const isOps = (a: Admin) => a.permissions.includes("manage_pipeline") && a.permissions.includes("manage_survey");
const canApprove = (a: Admin) => a.permissions.includes("approve_showcase");

function revalidateAll() {
  revalidatePath("/admin/star-societies");
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  revalidatePath("/portal");
  revalidatePath("/portal/star-societies");
}

async function societyFacts(societyId: string) {
  const s = await db.society.findUnique({
    where: { id: societyId },
    select: {
      closedAt: true,
      markedDefaulterAt: true,
      showcaseConsents: { where: { withdrawnAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!s) return null;
  return { closed: s.closedAt !== null, markedDefaulter: s.markedDefaulterAt !== null, hasConsent: s.showcaseConsents.length > 0 };
}

/** An approved row past its expiry blocks a new live row (one live listing per society) — close it first. */
async function closeExpired(societyId: string, now: Date) {
  await db.starListing.updateMany({ where: { societyId, status: "approved", expiresAt: { lte: now } }, data: { status: "expired" } });
}

export async function recordShowcaseConsent(input: { societyId: string; givenBy: string; givenOn: string; note: string }): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin || !(isOps(admin) || canApprove(admin))) {
    logger.warn("showcase.consent_refused", { societyId: input.societyId, actorId: admin?.id, why: "not_permitted" });
    return { error: "Recording a committee's consent is an operations action." };
  }
  const givenOn = new Date(`${input.givenOn}T00:00:00Z`);
  const refusal = refuseConsent(input.givenBy, givenOn, new Date());
  if (refusal) {
    logger.warn("showcase.consent_refused", { societyId: input.societyId, actorId: admin.id, why: refusal });
    return { error: refusal };
  }
  const existing = await db.showcaseConsent.findFirst({ where: { societyId: input.societyId, withdrawnAt: null }, select: { id: true } });
  if (existing) return { error: "Consent is already on record for this society. Withdraw it first to record a new one." };
  await db.showcaseConsent.create({
    data: {
      societyId: input.societyId,
      givenBy: input.givenBy.trim(),
      givenOn,
      note: input.note.trim() || null,
      recordedById: admin.id,
    },
  });
  logger.info("showcase.consent_recorded", { societyId: input.societyId, actorId: admin.id });
  revalidateAll();
  return { done: "Consent recorded." };
}

/** Withdrawing consent also takes the society off the showcase at once. */
export async function withdrawShowcaseConsent(consentId: string, reason: string): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin || !(isOps(admin) || canApprove(admin))) {
    logger.warn("showcase.consent_withdraw_refused", { consentId, actorId: admin?.id, why: "not_permitted" });
    return { error: "Withdrawing consent is an operations action." };
  }
  if (!reason.trim()) return { error: "Say why the consent is being withdrawn." };
  const consent = await db.showcaseConsent.findUnique({ where: { id: consentId }, select: { societyId: true, withdrawnAt: true } });
  if (!consent || consent.withdrawnAt) return { error: "That consent is no longer in force." };
  const now = new Date();
  const ended = await db.$transaction(async (tx) => {
    await tx.showcaseConsent.update({
      where: { id: consentId },
      data: { withdrawnAt: now, withdrawnById: admin.id, withdrawnReason: reason.trim() },
    });
    const r = await tx.starListing.updateMany({
      where: { societyId: consent.societyId, status: { in: ["proposed", "approved"] } },
      data: { status: "withdrawn", withdrawnAt: now, withdrawnById: admin.id, withdrawnReason: `Consent withdrawn: ${reason.trim()}` },
    });
    return r.count;
  });
  logger.info("showcase.consent_withdrawn", { societyId: consent.societyId, actorId: admin.id, listingsEnded: ended });
  revalidateAll();
  return { done: ended > 0 ? "Consent withdrawn — the society is off the showcase." : "Consent withdrawn." };
}

/** Approve a society the system raised (origin auto). */
export async function approveCandidate(societyId: string, showSummary: boolean, note: string): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin || !canApprove(admin)) {
    logger.warn("showcase.approve_refused", { societyId, actorId: admin?.id, why: "no_permission" });
    return { error: "Approving a star partner needs the “Approve star societies” permission." };
  }
  const now = new Date();
  const [facts, rating, listings] = await Promise.all([
    societyFacts(societyId),
    societyPaymentRating(societyId, now),
    db.starListing.findMany({ where: { societyId }, select: { status: true, expiresAt: true } }),
  ]);
  if (!facts) return { error: "That society no longer exists." };
  if (listings.some((l) => l.status === "proposed" || isLive(l, now))) return { error: "This society is already on the showcase or awaiting a decision." };
  const refusal = refuseApproval({ origin: "auto", rating, facts, approverId: admin.id, proposedById: null });
  if (refusal) {
    logger.warn("showcase.approve_refused", { societyId, actorId: admin.id, why: refusal });
    return { error: refusal };
  }
  await closeExpired(societyId, now);
  await db.starListing.create({
    data: {
      societyId,
      origin: "auto",
      status: "approved",
      ratingStars: rating.stars,
      avgDaysLate: rating.avgDaysLate,
      invoiceCount: rating.counted,
      summary: starSummary(rating),
      showSummary,
      proposedAt: now,
      decidedById: admin.id,
      decidedAt: now,
      decisionNote: note.trim() || null,
      expiresAt: showcaseExpiry(now),
    },
  });
  logger.info("showcase.approved", { societyId, actorId: admin.id, origin: "auto", stars: rating.stars });
  revalidateAll();
  return { done: "Approved — the society is on the showcase for 90 days." };
}

/** Turn a raised candidate down; it is not raised again for 90 days. */
export async function rejectCandidate(societyId: string, note: string): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin || !canApprove(admin)) {
    logger.warn("showcase.reject_refused", { societyId, actorId: admin?.id, why: "no_permission" });
    return { error: "Turning a candidate down needs the “Approve star societies” permission." };
  }
  if (!note.trim()) return { error: "Say why — the next reviewer will read it." };
  const now = new Date();
  const rating = await societyPaymentRating(societyId, now);
  await db.starListing.create({
    data: {
      societyId,
      origin: "auto",
      status: "rejected",
      ratingStars: rating.stars,
      avgDaysLate: rating.avgDaysLate,
      invoiceCount: rating.counted,
      summary: starSummary(rating),
      proposedAt: now,
      decidedById: admin.id,
      decidedAt: now,
      decisionNote: note.trim(),
    },
  });
  logger.info("showcase.rejected", { societyId, actorId: admin.id, origin: "auto" });
  revalidateAll();
  return { done: "Not shown. It will not be raised again for 90 days." };
}

/** Propose a society by hand; a different admin decides. */
export async function proposeStarSociety(societyId: string, note: string, showSummary: boolean): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin || !(isOps(admin) || canApprove(admin))) {
    logger.warn("showcase.propose_refused", { societyId, actorId: admin?.id, why: "not_permitted" });
    return { error: "Proposing a star partner is an operations action." };
  }
  if (!note.trim()) return { error: "Say why this society should be shown." };
  const now = new Date();
  const [facts, rating, listings] = await Promise.all([
    societyFacts(societyId),
    societyPaymentRating(societyId, now),
    db.starListing.findMany({ where: { societyId }, select: { status: true, expiresAt: true } }),
  ]);
  if (!facts) return { error: "That society no longer exists." };
  if (listings.some((l) => l.status === "proposed" || isLive(l, now))) return { error: "This society is already on the showcase or awaiting a decision." };
  if (facts.closed || facts.markedDefaulter) return { error: "A closed society, or one marked a defaulter, cannot be proposed." };
  if (rating.openCount > 0) return { error: `It has ${rating.openCount} unpaid invoice${rating.openCount === 1 ? "" : "s"} past due.` };
  if (rating.stars !== null && rating.stars < 4) return { error: `Its payment rating is ${rating.stars} star${rating.stars === 1 ? "" : "s"}; a star partner needs at least 4.` };
  await closeExpired(societyId, now);
  await db.starListing.create({
    data: {
      societyId,
      origin: "manual",
      status: "proposed",
      ratingStars: rating.stars,
      avgDaysLate: rating.avgDaysLate,
      invoiceCount: rating.counted,
      summary: starSummary(rating),
      showSummary,
      proposedById: admin.id,
      proposedAt: now,
      proposalNote: note.trim(),
    },
  });
  logger.info("showcase.proposed", { societyId, actorId: admin.id });
  revalidateAll();
  return { done: "Proposed — another admin with approval rights decides." };
}

/** Approve or reject a manual proposal. */
export async function decideProposal(listingId: string, decision: "approve" | "reject", note: string): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin || !canApprove(admin)) {
    logger.warn("showcase.decide_refused", { listingId, actorId: admin?.id, why: "no_permission" });
    return { error: "Deciding needs the “Approve star societies” permission." };
  }
  const listing = await db.starListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "proposed") return { error: "That proposal has already been decided." };
  if (listing.proposedById === admin.id) {
    logger.warn("showcase.decide_refused", { listingId, actorId: admin.id, why: "own_proposal" });
    return { error: "You proposed this society, so another admin has to decide." };
  }
  const now = new Date();
  if (decision === "reject") {
    if (!note.trim()) return { error: "Say why — the proposer will read it." };
    await db.starListing.update({ where: { id: listingId }, data: { status: "rejected", decidedById: admin.id, decidedAt: now, decisionNote: note.trim() } });
    logger.info("showcase.rejected", { listingId, societyId: listing.societyId, actorId: admin.id, origin: "manual" });
    revalidateAll();
    return { done: "Proposal rejected." };
  }
  const [facts, rating] = await Promise.all([societyFacts(listing.societyId), societyPaymentRating(listing.societyId, now)]);
  if (!facts) return { error: "That society no longer exists." };
  const refusal = refuseApproval({ origin: "manual", rating, facts, approverId: admin.id, proposedById: listing.proposedById });
  if (refusal) {
    // Missing consent can still be fixed, so the proposal stays open. Any
    // other refusal means the facts changed since it was proposed (a bill
    // fell past due, the rating dropped, the society closed): the proposal
    // is closed as superseded, with the reason, rather than left to rot.
    if (!facts.hasConsent) {
      logger.warn("showcase.decide_refused", { listingId, actorId: admin.id, why: refusal });
      return { error: refusal };
    }
    await db.starListing.update({ where: { id: listingId }, data: { status: "superseded", decidedById: admin.id, decidedAt: now, decisionNote: refusal } });
    logger.info("showcase.superseded", { listingId, societyId: listing.societyId, actorId: admin.id, why: refusal });
    revalidateAll();
    return { error: `${refusal} The proposal has been closed.` };
  }
  await db.starListing.update({
    where: { id: listingId },
    data: {
      status: "approved",
      ratingStars: rating.stars,
      avgDaysLate: rating.avgDaysLate,
      invoiceCount: rating.counted,
      summary: starSummary(rating),
      decidedById: admin.id,
      decidedAt: now,
      decisionNote: note.trim() || null,
      expiresAt: showcaseExpiry(now),
    },
  });
  logger.info("showcase.approved", { listingId, societyId: listing.societyId, actorId: admin.id, origin: "manual" });
  revalidateAll();
  return { done: "Approved — the society is on the showcase for 90 days." };
}

/** Take a society off the showcase before its expiry. */
export async function withdrawStarListing(listingId: string, reason: string): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin || !(isOps(admin) || canApprove(admin))) {
    logger.warn("showcase.withdraw_refused", { listingId, actorId: admin?.id, why: "not_permitted" });
    return { error: "Taking a society off the showcase is an operations action." };
  }
  if (!reason.trim()) return { error: "Say why it is being taken off." };
  const listing = await db.starListing.findUnique({ where: { id: listingId }, select: { status: true, societyId: true } });
  if (!listing || !["approved", "proposed"].includes(listing.status)) return { error: "That listing is not live." };
  await db.starListing.update({
    where: { id: listingId },
    data: { status: "withdrawn", withdrawnAt: new Date(), withdrawnById: admin.id, withdrawnReason: reason.trim() },
  });
  logger.info("showcase.withdrawn", { listingId, societyId: listing.societyId, actorId: admin.id });
  revalidateAll();
  return { done: "Taken off the showcase." };
}

/** Whether the card shows its generated line — the text is never edited, only shown or hidden. */
export async function setStarSummaryShown(listingId: string, shown: boolean): Promise<Result> {
  const admin = await resolveAdmin();
  if (!admin || !(isOps(admin) || canApprove(admin))) return { error: "That is an operations action." };
  const listing = await db.starListing.findUnique({ where: { id: listingId }, select: { status: true } });
  if (!listing || !["approved", "proposed"].includes(listing.status)) return { error: "That listing is not live." };
  await db.starListing.update({ where: { id: listingId }, data: { showSummary: shown } });
  logger.info("showcase.summary_toggled", { listingId, actorId: admin.id, shown });
  revalidateAll();
  return { done: shown ? "The line is shown on the card." : "The line is hidden." };
}
