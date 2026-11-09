"use server";

import { revalidatePath } from "next/cache";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { s3, S3_BUCKET } from "@/lib/s3";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { sweepPumpRoomEmails, applyIngestToMeter } from "@/lib/pump-room-ingest";

const ROOM_TYPES = ["domestic", "stp", "fire"] as const;
type RoomType = (typeof ROOM_TYPES)[number];

/**
 * Assign (and optionally classify) a pump room's society/type — mirrors
 * saveTankAssignment's shape: one action, one transaction, the same
 * society-management gate as every other tank/pump-room assignment.
 */
export async function saveMeterAssignment(input: {
  meterId: string;
  societyId: string | null;
  roomType: RoomType | null;
}): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    logger.warn("pump_room.assign_refused", { actorId: actor.id, meterId: input.meterId, reason: "permission" });
    return { error: "Assigning pump rooms is a society-management action (Manage users)." };
  }
  if (input.roomType !== null && !ROOM_TYPES.includes(input.roomType)) return { error: "That is not a pump room type." };
  const meter = await db.emsPumpMeter.findUnique({ where: { id: input.meterId }, select: { id: true, societyId: true } });
  if (!meter) return { error: "That pump room no longer exists." };
  if (input.societyId) {
    const society = await db.society.findUnique({ where: { id: input.societyId }, select: { id: true } });
    if (!society) return { error: "That society no longer exists." };
  }
  const societyChanged = input.societyId !== meter.societyId;
  await db.emsPumpMeter.update({
    where: { id: meter.id },
    data: {
      societyId: input.societyId,
      ...(societyChanged ? { assignedAt: input.societyId ? new Date() : null, assignedById: input.societyId ? actor.id : null } : {}),
      roomType: input.roomType,
    },
  });
  logger.info("pump_room.assignment_saved", { actorId: actor.id, meterId: meter.id, societyId: input.societyId, societyChanged, roomType: input.roomType });
  revalidatePath("/admin/pump-rooms");
  revalidatePath(`/admin/pump-rooms/${meter.id}`);
  if (input.societyId) revalidatePath(`/admin/societies/${input.societyId}`);
  if (meter.societyId && meter.societyId !== input.societyId) revalidatePath(`/admin/societies/${meter.societyId}`);
  return {};
}

/**
 * Classifies a subject label for the first time, creating the EmsPumpMeter,
 * then immediately backfills every existing `needs_assignment` ingest
 * carrying that exact label, oldest `receivedAt` first — recovering the
 * historical backlog rather than silently losing the days that arrived
 * before classification. Ordering matters: applyIngestToMeter only ever
 * looks backward for a prior day, so out-of-order application would wrongly
 * leave an earlier day looking like it has no predecessor.
 */
export async function createPumpRoomFromIngest(input: {
  subjectLabel: string;
  societyId: string;
  roomType: RoomType;
}): Promise<{ error?: string; meterId?: string; backfilled?: number }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    logger.warn("pump_room.classify_refused", { actorId: actor.id, subjectLabel: input.subjectLabel, reason: "permission" });
    return { error: "Classifying pump rooms is a society-management action (Manage users)." };
  }
  if (!ROOM_TYPES.includes(input.roomType)) return { error: "That is not a pump room type." };
  const society = await db.society.findUnique({ where: { id: input.societyId }, select: { id: true } });
  if (!society) return { error: "That society no longer exists." };

  const existing = await db.emsPumpMeter.findUnique({ where: { vendorSubjectLabel: input.subjectLabel } });
  if (existing) return { error: "That subject has already been classified." };

  const meter = await db.emsPumpMeter.create({
    data: {
      vendorSubjectLabel: input.subjectLabel,
      societyId: input.societyId,
      roomType: input.roomType,
      assignedAt: new Date(),
      assignedById: actor.id,
    },
  });

  const backlog = await db.emsPumpEmailIngest.findMany({
    where: { subjectLabel: input.subjectLabel, status: "needs_assignment" },
    orderBy: { receivedAt: "asc" },
    select: { id: true },
  });
  let backfilled = 0;
  for (const ingest of backlog) {
    try {
      await applyIngestToMeter(ingest.id, meter.id);
      backfilled++;
    } catch (err) {
      logger.warn("pump_room.backfill_failed", { ingestId: ingest.id, meterId: meter.id, error: String(err) });
    }
  }

  logger.info("pump_room.classified", { actorId: actor.id, meterId: meter.id, subjectLabel: input.subjectLabel, societyId: input.societyId, roomType: input.roomType, backfilled });
  revalidatePath("/admin/pump-rooms");
  revalidatePath(`/admin/societies/${input.societyId}`);
  return { meterId: meter.id, backfilled };
}

/** Re-mirror the dedicated mailbox on demand, from the Pump rooms screen. */
export async function sweepPumpRoomEmailsNow(): Promise<{ error?: string; checked?: number; applied?: number; needsAssignment?: number; failed?: number }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    return { error: "Checking for new pump-room emails is a society-management action (Manage users)." };
  }
  const r = await sweepPumpRoomEmails();
  logger.info("pump_room.swept", { actorId: actor.id, ...r });
  revalidatePath("/admin/pump-rooms");
  return r;
}

/** A short-lived link to one ingest's raw file — the private Ingest/ prefix, never rendered directly. */
export async function getPumpRoomIngestUrl(ingestId: string): Promise<{ url: string } | { error: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) return { error: "Reading a pump-room file is a society-management action (Manage users)." };
  const ingest = await db.emsPumpEmailIngest.findUnique({ where: { id: ingestId }, select: { s3Key: true } });
  if (!ingest) return { error: "That file is no longer on record." };
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: ingest.s3Key }));
    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: ingest.s3Key }), { expiresIn: 300 });
    logger.info("pump_room.ingest_file_access", { actorId: actor.id, ingestId });
    return { url };
  } catch {
    return { error: "This file is no longer reachable in storage — the chain is broken here." };
  }
}
