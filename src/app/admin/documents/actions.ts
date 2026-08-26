"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildDocumentKey, type DocType } from "@/lib/document-keys";
import { buildRawReadingKey } from "@/lib/ingest-keys";
import { documentType, validateDocumentUpload } from "@/lib/document-catalog";
import { extensionOf } from "@/lib/file-signature";
import { logger } from "@/lib/logger";
import { recordKycDocument } from "@/app/admin/pipeline/[id]/kyc/actions";
import { recordCircuitRawUpload } from "@/app/admin/societies/[id]/circuits/[circuitId]/reading-actions";
import type { KycDocumentType } from "@prisma/client";

type Presigned = { uploadUrl: string; key: string };

/**
 * Validate, then presign — in that order, and both on the server.
 *
 * The client runs the same check for a fast message, but a client check is a
 * courtesy: this is the one that decides. The browser sends only the first
 * few KB of the file, which is all the evidence needed to know what it
 * really is, so the bytes still go straight to S3 rather than through this
 * process (the presigned-PUT pattern this codebase has used since 2026-08-05).
 *
 * Refuses by returning, never by throwing: a thrown Server Action reaches the
 * browser as an opaque digest in a production build, so the operator would be
 * told nothing at all.
 */
export async function presignDocument(input: {
  docTypeId: string;
  contextId: string;
  period: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  /** First 4 KB, base64. The only part of an upload that cannot be mistyped. */
  headBase64: string;
}): Promise<Presigned | { error: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };

  const spec = documentType(input.docTypeId);
  if (!spec) return { error: "Choose a document type first." };
  if (!spec.uploadHere) {
    return { error: `A ${spec.label.toLowerCase()} is filed on ${spec.handledAt}.` };
  }
  // Permission comes from the TYPE, server-side — a client choosing a type it
  // has no permission for is simply refused rather than trusted.
  if (!actor.permissions.includes(spec.permission)) {
    logger.warn("document.upload_refused", { actorId: actor.id, docTypeId: spec.id, reason: "permission" });
    return { error: `Uploading a ${spec.label.toLowerCase()} needs the ${spec.permission.replace("_", " ")} permission.` };
  }
  if (spec.needsPeriod && !/^\d{4}-\d{2}$/.test(input.period)) {
    // INV-04 — always an explicit selection, never inferred from the file.
    return { error: "Choose the period this document belongs to (YYYY-MM)." };
  }

  const verdict = validateDocumentUpload({
    docTypeId: spec.id,
    fileName: input.fileName,
    byteSize: input.byteSize,
    head: Buffer.from(input.headBase64, "base64"),
  });
  if (!verdict.ok) {
    logger.warn("document.rejected", {
      actorId: actor.id,
      docTypeId: spec.id,
      fileName: input.fileName,
      reason: verdict.reason,
    });
    return { error: verdict.reason };
  }

  if (spec.context === "circuit") {
    const circuit = await db.circuit.findFirst({
      where: { id: input.contextId, voidedAt: null },
      include: { society: { select: { name: true } } },
    });
    if (!circuit) return { error: "Choose the circuit this export belongs to." };
    // Raw vendor files live under the private Ingest/ prefix, never in the
    // public Documents/ tree — the separation MS-07 established deliberately.
    const key = buildRawReadingKey({
      society: circuit.society.name,
      period: input.period,
      circuitId: circuit.id,
      fileName: input.fileName,
      uploadedAt: new Date(),
    });
    return await presign(key, input.contentType, actor.id, spec.id);
  }

  if (spec.context === "society") {
    const society = await db.society.findUnique({ where: { id: input.contextId }, select: { name: true } });
    if (!society) return { error: "Choose the society this document belongs to." };
    const key = buildDocumentKey({
      society: society.name,
      month: input.period,
      docType: spec.id as DocType,
      dateLabel: input.period,
      extension: extensionOf(input.fileName) || "bin",
    });
    return await presign(key, input.contentType, actor.id, spec.id);
  }

  const pipeline = await db.pipeline.findUnique({
    where: { id: input.contextId },
    include: { society: { select: { name: true } } },
  });
  if (!pipeline) return { error: "Choose the deal this document belongs to." };
  const key = buildDocumentKey({
    society: pipeline.society.name,
    month: input.period,
    docType: spec.id as DocType,
    dateLabel: input.period,
    extension: extensionOf(input.fileName) || "bin",
  });
  return await presign(key, input.contentType, actor.id, spec.id);
}

async function presign(key: string, contentType: string, actorId: string, docTypeId: string): Promise<Presigned> {
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  logger.info("document.presigned", { actorId, docTypeId, key });
  return { uploadUrl, key };
}

/**
 * Once the bytes are in S3, hand the file to the operation its type owns —
 * the same actions the dedicated screens call, not a second implementation.
 * Two paths writing the same rows drift, and the drift shows up as a record
 * that depends on which screen somebody used.
 */
export async function finalizeDocument(input: {
  docTypeId: string;
  contextId: string;
  s3Key: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  period?: string;
}): Promise<{ error?: string; message?: string; href?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  const spec = documentType(input.docTypeId);
  if (!spec || !spec.uploadHere) return { error: "That document type is not filed from here." };

  if (spec.id === "meterReadings") {
    const result = await recordCircuitRawUpload({
      circuitId: input.contextId,
      s3Key: input.s3Key,
      fileName: input.fileName,
      contentType: input.contentType,
      byteSize: input.byteSize,
    });
    if ("error" in result) return { error: result.error };
    const circuit = await db.circuit.findUnique({
      where: { id: input.contextId },
      select: { societyId: true },
    });
    logger.info("document.filed", { actorId: actor.id, docTypeId: spec.id, rawFileId: result.rawFileId });
    return {
      message: "Uploaded. Open the circuit to review the days before anything is stored.",
      href: circuit ? `/admin/societies/${circuit.societyId}/circuits/${input.contextId}` : undefined,
    };
  }

  if (spec.context === "society") {
    await db.storedDocument.create({
      data: {
        docType: spec.id,
        societyId: input.contextId,
        period: input.period ?? "",
        s3Key: input.s3Key,
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: input.byteSize,
        uploadedById: actor.id,
      },
    });
    logger.info("document.filed", { actorId: actor.id, docTypeId: spec.id, societyId: input.contextId });
    return {
      message: `${spec.label} filed against the society.`,
      href: `/admin/societies/${input.contextId}`,
    };
  }

  const kycType: KycDocumentType =
    spec.id === "kycGstCertificate" ? "gst_certificate" : "electricity_bill";
  const result = await recordKycDocument(input.contextId, {
    type: kycType,
    s3Key: input.s3Key,
    fileName: input.fileName,
    receiptChannel: "in_person",
  });
  if (result && "error" in result && result.error) return { error: result.error };
  logger.info("document.filed", { actorId: actor.id, docTypeId: spec.id, pipelineId: input.contextId });
  return {
    message: "Filed against the society's KYC checklist, awaiting verification.",
    href: `/admin/pipeline/${input.contextId}/kyc`,
  };
}
