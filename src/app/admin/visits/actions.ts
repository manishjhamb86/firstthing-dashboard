"use server";

import { revalidatePath } from "next/cache";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { CustomerVisitPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { resolveAdmin } from "@/lib/admin-permissions";
import { istWallClock } from "@/lib/field-today";
import { buildDocumentKey } from "@/lib/document-keys";
import { distanceMetres, refuseReview, refuseVisit } from "@/lib/customer-visits";

/**
 * Customer visits' acts (2026-11-18). Any signed-in admin logs their own
 * visits; only someone else holding approve_visits approves one. Every
 * refusal is a typed error and a log line; nothing is ever deleted.
 */

const PATHS = ["/admin/visits", "/admin/visits/approvals", "/admin/founders"];
const refresh = (id?: string) => {
  for (const p of PATHS) revalidatePath(p);
  if (id) revalidatePath(`/admin/visits/${id}`);
};

export type VisitFormInput = {
  societyId: string;
  /** YYYY-MM-DDTHH:mm, as typed — wall clock. */
  visitedAt: string;
  purpose: CustomerVisitPurpose;
  agenda: string;
  outcome: string;
  metName: string;
  metRole: string;
  rating: number | null;
  interests: string[];
  followUps: string;
  photoKeys: string[];
  location: { latitude: number; longitude: number; accuracyM: number | null } | null;
};

function parsed(input: VisitFormInput) {
  const visitedAt = new Date(`${input.visitedAt}:00Z`);
  return {
    societyId: input.societyId,
    visitedAt,
    purpose: input.purpose,
    agenda: input.agenda,
    outcome: input.outcome,
    rating: input.purpose === "feedback_upsell" ? input.rating : null,
    interests: input.purpose === "feedback_upsell" ? [...new Set(input.interests)] : [],
    photoKeys: input.photoKeys.filter((k) => typeof k === "string" && k.startsWith("Documents/")),
  };
}

async function locationFields(societyId: string, loc: VisitFormInput["location"]) {
  if (!loc || !Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) {
    return { latitude: null, longitude: null, locationAccuracyM: null, distanceM: null };
  }
  const society = await db.society.findUnique({ where: { id: societyId }, select: { latitude: true, longitude: true } });
  const distanceM =
    society?.latitude != null && society.longitude != null
      ? distanceMetres({ lat: loc.latitude, lng: loc.longitude }, { lat: society.latitude, lng: society.longitude })
      : null;
  return { latitude: loc.latitude, longitude: loc.longitude, locationAccuracyM: loc.accuracyM, distanceM };
}

export async function getVisitPhotoUploadUrl(input: { societyId: string; visitedAt: string; fileName: string; contentType: string }): Promise<{ uploadUrl: string; key: string } | { error: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!input.contentType.startsWith("image/")) return { error: "Only a photo can be added here." };
  const society = await db.society.findUnique({ where: { id: input.societyId }, select: { name: true } });
  if (!society) return { error: "Choose the society first." };
  const period = /^\d{4}-\d{2}/.test(input.visitedAt) ? input.visitedAt.slice(0, 7) : istWallClock(new Date()).toISOString().slice(0, 7);
  const extension = (input.fileName.split(".").pop() ?? "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  const key = buildDocumentKey({
    society: society.name,
    month: period,
    docType: "customerVisit",
    dateLabel: input.visitedAt.slice(0, 10),
    identifier: `${admin.id.slice(-6)}${Date.now().toString(36)}`,
    extension,
  });
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }), { expiresIn: 300 });
  return { uploadUrl, key };
}

export async function logVisit(input: VisitFormInput): Promise<{ error?: string; id?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const v = parsed(input);
  const refusal = refuseVisit(v, istWallClock(new Date()));
  if (refusal) {
    logger.warn("visit.log_refused", { actorId: admin.id, societyId: input.societyId, reason: refusal });
    return { error: refusal };
  }
  const society = await db.society.findUnique({ where: { id: v.societyId }, select: { id: true } });
  if (!society) return { error: "That society no longer exists." };
  const created = await db.customerVisit.create({
    data: {
      ...v,
      period: input.visitedAt.slice(0, 7),
      metName: input.metName.trim() || null,
      metRole: input.metRole.trim() || null,
      followUps: input.followUps.trim() || null,
      agenda: v.agenda.trim(),
      outcome: v.outcome.trim(),
      ...(await locationFields(v.societyId, input.location)),
      loggedById: admin.id,
    },
    select: { id: true },
  });
  logger.info("visit.logged", { actorId: admin.id, visitId: created.id, societyId: v.societyId, purpose: v.purpose, located: !!input.location });
  refresh(created.id);
  return { id: created.id };
}

/** The manager corrects a visit still waiting, or one sent back — it goes back for approval. */
export async function updateVisit(id: string, input: VisitFormInput): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const visit = await db.customerVisit.findUnique({ where: { id }, select: { loggedById: true, status: true, voidedAt: true, latitude: true } });
  if (!visit) return { error: "That visit no longer exists." };
  if (visit.loggedById !== admin.id) {
    logger.warn("visit.update_refused", { actorId: admin.id, visitId: id, reason: "not_logger" });
    return { error: "Only the person who logged a visit can change it." };
  }
  if (visit.voidedAt) return { error: "This visit was withdrawn." };
  if (visit.status === "approved") return { error: "An approved visit cannot be changed." };
  const v = parsed(input);
  const refusal = refuseVisit(v, istWallClock(new Date()));
  if (refusal) return { error: refusal };
  await db.customerVisit.update({
    where: { id },
    data: {
      ...v,
      period: input.visitedAt.slice(0, 7),
      metName: input.metName.trim() || null,
      metRole: input.metRole.trim() || null,
      followUps: input.followUps.trim() || null,
      agenda: v.agenda.trim(),
      outcome: v.outcome.trim(),
      // A correction keeps the location from when the visit was first logged.
      ...(visit.latitude === null && input.location ? await locationFields(v.societyId, input.location) : {}),
      status: "pending",
    },
  });
  logger.info("visit.updated", { actorId: admin.id, visitId: id, resubmitted: visit.status === "sent_back" });
  refresh(id);
  return {};
}

async function review(id: string, decision: "approved" | "sent_back", note: string | null) {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  const visit = await db.customerVisit.findUnique({ where: { id }, select: { loggedById: true, status: true, voidedAt: true } });
  if (!visit) return { error: "That visit no longer exists." };
  const refusal = refuseReview({ actorId: admin.id, loggedById: visit.loggedById, canApprove: admin.permissions.includes("approve_visits"), status: visit.status, voided: visit.voidedAt !== null });
  if (refusal) {
    logger.warn("visit.review_refused", { actorId: admin.id, visitId: id, decision, reason: refusal });
    return { error: refusal };
  }
  // Compare-and-set on the status, so two approvers cannot both decide it.
  const r = await db.customerVisit.updateMany({
    where: { id, status: "pending", voidedAt: null },
    data: { status: decision, reviewedById: admin.id, reviewedAt: new Date(), reviewNote: note },
  });
  if (r.count === 0) return { error: "Someone else reviewed this visit just now." };
  logger.info(decision === "approved" ? "visit.approved" : "visit.sent_back", { actorId: admin.id, visitId: id });
  refresh(id);
  return {};
}

export async function approveVisit(id: string): Promise<{ error?: string }> {
  return review(id, "approved", null);
}

export async function sendBackVisit(id: string, note: string): Promise<{ error?: string }> {
  if (!note.trim()) return { error: "Say why it is being sent back." };
  return review(id, "sent_back", note.trim());
}

export async function approveVisits(ids: string[]): Promise<{ approved: number; problems: string[] }> {
  let approved = 0;
  const problems: string[] = [];
  for (const id of ids.slice(0, 100)) {
    const r = await review(id, "approved", null);
    if (r.error) problems.push(r.error);
    else approved += 1;
  }
  return { approved, problems: [...new Set(problems)] };
}

/** Withdraw a visit: the manager, before it is approved; an approver, at any time. Kept on record with the reason. */
export async function withdrawVisit(id: string, reason: string): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!reason.trim()) return { error: "Say why the visit is being withdrawn." };
  const visit = await db.customerVisit.findUnique({ where: { id }, select: { loggedById: true, status: true, voidedAt: true } });
  if (!visit) return { error: "That visit no longer exists." };
  if (visit.voidedAt) return {};
  const mine = visit.loggedById === admin.id && visit.status !== "approved";
  if (!mine && !admin.permissions.includes("approve_visits")) {
    logger.warn("visit.withdraw_refused", { actorId: admin.id, visitId: id });
    return { error: "Only the person who logged it (before approval) or a visit approver can withdraw a visit." };
  }
  await db.customerVisit.update({ where: { id }, data: { voidedAt: new Date(), voidedById: admin.id, voidReason: reason.trim() } });
  logger.info("visit.withdrawn", { actorId: admin.id, visitId: id });
  refresh(id);
  return {};
}
