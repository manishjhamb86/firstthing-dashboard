"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { buildDocumentKey } from "@/lib/document-keys";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { s3, S3_BUCKET } from "@/lib/s3";

// The society's own upload path, deliberately separate from
// src/app/admin/uploads.ts rather than a permission branch inside it.
//
// FEAT-035 requires a photo to dispute a batch, and the person disputing is a
// portal account — so an admin-permission-gated presign cannot serve it. Two
// actions with two different authorization sources is clearer than one action
// that has to decide which kind of caller it has, and it keeps the admin
// action's rule ("derive the permission from the docType, never trust the
// caller") intact.
//
// The docType is fixed here, not a parameter: this action exists for exactly
// one purpose, so a portal session can never presign a KYC or agreement key.
export async function getDisputeUploadUrl(input: { batchId: string; extension: string; contentType: string }) {
  const viewer = await resolvePortalViewer();
  if (!viewer) throw new Error("Your session is no longer valid — please sign in again.");

  const batch = await db.installationBatch.findUnique({
    where: { id: input.batchId },
    include: { project: { include: { society: true } } },
  });
  // INV-05 — the batch has to be this society's, checked server-side against
  // the row rather than assumed from whatever id the client sent.
  if (!batch || batch.project.societyId !== viewer.societyId) {
    logger.warn("upload.dispute_presign_refused", { actorId: viewer.id, batchId: input.batchId });
    throw new Error("That work belongs to another society.");
  }
  if (batch.project.onlookerId !== viewer.id) {
    logger.warn("upload.dispute_presign_refused", { actorId: viewer.id, batchId: input.batchId, reason: "not-onlooker" });
    throw new Error("Only the named onlooker can dispute a day's work.");
  }

  const now = new Date();
  const key = buildDocumentKey({
    society: batch.project.society.name,
    month: now.toISOString().slice(0, 7),
    docType: "batchDispute",
    dateLabel: now.toISOString().slice(0, 10),
    identifier: batch.id.slice(-6),
    extension: input.extension,
  });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: 300 },
  );

  logger.info("upload.presigned", { actorId: viewer.id, docType: "batchDispute", key });
  return { uploadUrl, key };
}
