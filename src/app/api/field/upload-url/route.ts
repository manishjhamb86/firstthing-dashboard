import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, S3_BUCKET } from "@/lib/s3";
import { presignInspectionEvidence } from "@/lib/inspection-file";
import { batchPhotoKey, MAX_DAY_PHOTOS } from "@/lib/installation-core";
import { MAX_SUBJECT_PHOTOS, surveyPhotoKey, type PhotoSubject } from "@/lib/survey-core";
import { helpAttachmentKey } from "@/lib/help-report";

/**
 * An upload URL for a photo the phone has been holding (05-field.md §0.3).
 * The photo is tied to the OUTBOX ITEM that filed its inspection, because on
 * the phone the inspection had no server id yet; the receipt of that item says
 * which inspection it became. Same presign, same key, as the back office.
 */
export async function POST(req: Request) {
  const actor = await resolveAdmin();
  if (!actor) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!actor.permissions.includes("manage_survey")) {
    return NextResponse.json({ error: "This account may no longer file field work." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { inspectionItemId?: unknown; fileName?: unknown; contentType?: unknown; purpose?: unknown; plannedDayId?: unknown; index?: unknown }
    | null;
  if (body?.purpose === "installation") return installationPhoto(actor.id, body);
  if (body?.purpose === "survey") return surveyPhoto(actor.id, body as Record<string, unknown>);
  if (body?.purpose === "help") return helpAttachment(actor.id, body as Record<string, unknown>);

  const itemId = typeof body?.inspectionItemId === "string" ? body.inspectionItemId : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const fileName = typeof body?.fileName === "string" ? body.fileName : "photo.jpg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Only a photo can be uploaded here." }, { status: 422 });
  }

  const filed = itemId ? await db.fieldSyncReceipt.findUnique({ where: { id: itemId } }) : null;
  if (!filed || filed.actorId !== actor.id || filed.kind !== "inspection.file") {
    return NextResponse.json({ error: "The inspection this photo belongs to has not been sent yet." }, { status: 422 });
  }
  const inspectionId = (filed.result as { inspectionId?: string }).inspectionId ?? "";
  const inspection = await db.inspection.findUnique({
    where: { id: inspectionId },
    select: { period: true, voidedAt: true, society: { select: { name: true } } },
  });
  if (!inspection) return NextResponse.json({ error: "That inspection no longer exists." }, { status: 422 });
  if (inspection.voidedAt) return NextResponse.json({ error: "This inspection has been voided." }, { status: 422 });

  const { uploadUrl, key } = await presignInspectionEvidence({
    inspectionId,
    societyName: inspection.society.name,
    period: inspection.period,
    fileName,
    contentType,
  });
  logger.info("field.photo_presigned", { actorId: actor.id, inspectionId, key });
  return NextResponse.json({ uploadUrl, key });
}

/**
 * A photo of an installation day's work (FEAT-034-AC-3). The day already
 * exists on the server — it is planned in the back office — so the photo is
 * tied to the planned day directly, and its key is the deterministic one the
 * sync route will accept for that day (installation-core.ts batchPhotoKey).
 */
async function installationPhoto(actorId: string, body: { plannedDayId?: unknown; index?: unknown; contentType?: unknown }) {
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  if (!contentType.startsWith("image/")) return NextResponse.json({ error: "Only a photo can be uploaded here." }, { status: 422 });
  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_DAY_PHOTOS) {
    return NextResponse.json({ error: `A day carries at most ${MAX_DAY_PHOTOS} photos.` }, { status: 422 });
  }
  const plannedDayId = typeof body.plannedDayId === "string" ? body.plannedDayId : "";
  const day = plannedDayId
    ? await db.installationPlannedDay.findUnique({
        where: { id: plannedDayId },
        select: { plannedDate: true, project: { select: { society: { select: { name: true } } } } },
      })
    : null;
  if (!day) return NextResponse.json({ error: "That installation day is no longer planned." }, { status: 422 });

  const key = batchPhotoKey({ societyName: day.project.society.name, plannedDate: day.plannedDate, plannedDayId, index });
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
  logger.info("field.photo_presigned", { actorId, plannedDayId, key });
  return NextResponse.json({ uploadUrl, key });
}

const PHOTO_SUBJECTS: PhotoSubject[] = ["site", "area", "circuit", "pump_unit", "logbook"];

/** A photo taken on the survey, keyed to its survey, subject and number (survey-core.ts surveyPhotoKey). */
async function surveyPhoto(actorId: string, body: Record<string, unknown>) {
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  if (!contentType.startsWith("image/")) return NextResponse.json({ error: "Only a photo can be uploaded here." }, { status: 422 });
  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_SUBJECT_PHOTOS) {
    return NextResponse.json({ error: `At most ${MAX_SUBJECT_PHOTOS} photos here.` }, { status: 422 });
  }
  const subject = String(body.subject ?? "") as PhotoSubject;
  if (!PHOTO_SUBJECTS.includes(subject)) return NextResponse.json({ error: "Unknown photo subject." }, { status: 422 });
  const surveyId = typeof body.surveyId === "string" ? body.surveyId : "";
  const subjectKey = typeof body.subjectKey === "string" ? body.subjectKey.slice(0, 80) : "";
  const survey = surveyId
    ? await db.siteSurvey.findUnique({ where: { id: surveyId }, select: { createdAt: true, pipeline: { select: { society: { select: { name: true } } } } } })
    : null;
  if (!survey) return NextResponse.json({ error: "That survey no longer exists." }, { status: 422 });
  const key = surveyPhotoKey({ societyName: survey.pipeline.society.name, surveyCreatedAt: survey.createdAt, surveyId, subject, subjectKey, index });
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
  logger.info("field.photo_presigned", { actorId, surveyId, subject, key });
  return NextResponse.json({ uploadUrl, key });
}

/**
 * A Help report's screenshot, photo or voice note (21-field-help.md), keyed to
 * the report's outbox item under the PRIVATE Help/ prefix — a screenshot can
 * show a society's figures. The report itself does not exist yet (it is sent
 * after its attachments), so the key is derived from the item's own id and the
 * sync route accepts only keys under that id.
 */
async function helpAttachment(actorId: string, body: Record<string, unknown>) {
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const key = helpAttachmentKey(itemId, Number(body.index), contentType);
  if (typeof key !== "string") return NextResponse.json({ error: key.error }, { status: 422 });
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
  logger.info("field.photo_presigned", { actorId, purpose: "help", key });
  return NextResponse.json({ uploadUrl, key });
}
