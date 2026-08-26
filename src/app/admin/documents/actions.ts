"use server";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildDocumentKey, type DocType } from "@/lib/document-keys";
import { buildRawReadingKey } from "@/lib/ingest-keys";
import { documentType, validateDocumentUpload } from "@/lib/document-catalog";
import { extractDocument, EXTRACTABLE_TYPES } from "@/lib/document-extract";
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
  /** SHA-256 of the whole file, computed in the browser — see below. */
  clientSha256?: string;
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
    // Refuse an identical re-upload HERE rather than after it lands: this
    // app's credentials cannot delete an S3 object, so a file accepted and
    // then discarded would sit in the bucket forever with nothing pointing
    // at it. The browser's hash is enough for this check — it only decides
    // whether to accept an upload, and the authoritative hash is taken from
    // the stored object afterwards.
    if (input.clientSha256) {
      const same = await db.storedDocument.findFirst({
        where: {
          societyId: input.contextId,
          docType: spec.id,
          period: input.period,
          contentSha256: input.clientSha256,
          voidedAt: null,
        },
        select: { version: true },
      });
      if (same) {
        return {
          error: `That is the same file as version ${same.version} already on record — nothing to file. Upload it only if it has actually changed.`,
        };
      }
    }
    // Every version gets its own object. Reusing one key would overwrite the
    // previous version's bytes, which is the one thing versioning exists to
    // prevent — the row would say v1 and v2 while the bucket held only v2.
    const next = await nextVersion(input.contextId, spec.id, input.period);
    const key = buildDocumentKey({
      society: society.name,
      month: input.period,
      docType: spec.id as DocType,
      dateLabel: input.period,
      identifier: `v${next}`,
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

async function nextVersion(societyId: string, docType: string, period: string): Promise<number> {
  // Counts VOIDED versions too: a withdrawn v2 must not let a later upload
  // become v2 again, or the history would read as if it had been rewritten.
  const latest = await db.storedDocument.findFirst({
    where: { societyId, docType, period },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

/** The hash of what actually landed, not of what the browser said it sent. */
async function sha256OfStoredObject(key: string): Promise<string> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const bytes = await obj.Body!.transformToByteArray();
  return createHash("sha256").update(bytes).digest("hex");
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
    const period = input.period ?? "";
    const contentSha256 = await sha256OfStoredObject(input.s3Key);

    // Re-checked against the AUTHORITATIVE hash, not the browser's: the
    // presign check is a courtesy that keeps junk out of the bucket, this is
    // the one that keeps a duplicate out of the history.
    const identical = await db.storedDocument.findFirst({
      where: { societyId: input.contextId, docType: spec.id, period, contentSha256, voidedAt: null },
      select: { version: true },
    });
    if (identical) {
      return { error: `That is the same file as version ${identical.version} already on record — nothing was filed.` };
    }

    const version = await nextVersion(input.contextId, spec.id, period);
    const filed = await db.storedDocument.create({
      data: {
        docType: spec.id,
        societyId: input.contextId,
        period,
        version,
        contentSha256,
        s3Key: input.s3Key,
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: input.byteSize,
        uploadedById: actor.id,
      },
    });
    logger.info("document.filed", {
      actorId: actor.id,
      docTypeId: spec.id,
      societyId: input.contextId,
      version,
      documentId: filed.id,
    });
    return {
      message:
        version === 1
          ? `${spec.label} filed against the society.`
          : `${spec.label} filed as version ${version}. Version ${version - 1} is kept as it was.`,
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


/**
 * Withdraw a version that should not have been filed.
 *
 * Soft, always. The bytes cannot be removed from S3 by this app's own
 * credentials, so a hard delete would tell the operator the file was gone
 * while it sat in the bucket — and a version that was filed and withdrawn is
 * itself a fact worth keeping. The version NUMBER is never reused either:
 * a later upload becomes the next number up, so the history reads as what
 * happened rather than as though it had been rewritten.
 */
export async function voidDocumentVersion(input: {
  documentId: string;
  reason: string;
}): Promise<{ error?: string; done?: true }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_pipeline")) {
    return { error: "Withdrawing a document needs the manage pipeline permission." };
  }
  const reason = input.reason.trim();
  if (!reason) return { error: "Say why this version is being withdrawn." };

  const doc = await db.storedDocument.findUnique({ where: { id: input.documentId } });
  if (!doc) return { error: "That document is no longer on record." };
  if (doc.voidedAt) return { error: "That version has already been withdrawn." };

  await db.storedDocument.update({
    where: { id: doc.id },
    data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason },
  });
  logger.info("document.version_withdrawn", {
    actorId: actor.id,
    documentId: doc.id,
    docType: doc.docType,
    version: doc.version,
  });
  revalidatePath("/admin/documents");
  revalidatePath(`/admin/societies/${doc.societyId}`);
  return { done: true };
}

/**
 * Read a filed document with the model, and keep the proposal.
 *
 * Nothing is written to a circuit here — this only fills in
 * DocumentExtraction.proposed, which a person then reviews. The model's own
 * questions come back with it, unanswered.
 */
export async function readStoredDocument(documentId: string): Promise<{ error?: string; ok?: true }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_pipeline")) {
    return { error: "Reading a document needs the manage pipeline permission." };
  }
  const doc = await db.storedDocument.findUnique({ where: { id: documentId } });
  if (!doc) return { error: "That document is no longer on record." };
  if (doc.voidedAt) return { error: "That version has been withdrawn." };
  if (!EXTRACTABLE_TYPES.has(doc.docType)) return { error: "There are no figures to read out of that document type." };

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: doc.s3Key }));
    const bytes = await obj.Body!.transformToByteArray();
    const proposed = await extractDocument({
      base64: Buffer.from(bytes).toString("base64"),
      mimeType: doc.contentType || "application/pdf",
    });
    await db.documentExtraction.upsert({
      where: { documentId: doc.id },
      create: { documentId: doc.id, status: "proposed", proposed, extractedAt: new Date() },
      update: { status: "proposed", proposed, modelError: null, extractedAt: new Date() },
    });
    logger.info("document.read", {
      actorId: actor.id,
      documentId: doc.id,
      fixtures: proposed.fixtures.length,
      readings: proposed.dailyReadings.length,
      questions: proposed.clarifications.length,
    });
    revalidatePath(`/admin/documents/${doc.id}`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.documentExtraction.upsert({
      where: { documentId: doc.id },
      create: { documentId: doc.id, status: "failed", modelError: message },
      update: { status: "failed", modelError: message },
    });
    logger.warn("document.read_failed", { actorId: actor.id, documentId: doc.id, error: message });
    return { error: `Could not read that document: ${message}` };
  }
}

export type ConfirmedFixture = {
  label: string;
  count: number;
  watts: number;
  hoursPerDay: number;
  /** False means it shares the circuit but was not part of the retrofit. */
  retrofitted: boolean;
};

/**
 * Build the circuit the report describes.
 *
 * This is the backfill path for a society commissioned before this system
 * existed: there is no survey to have selected the circuit (FEAT-007), so the
 * report is the record it comes from instead. What is NOT invented here: no
 * baseline, no benchmark, no meter dates. Those come from the readings, which
 * go through CON-45's review like any other — a figure printed in a report is
 * evidence of what happened, not evidence this system can recompute.
 *
 * A fixture the catalog does not have is PROPOSED rather than created
 * outright, so its wattage lands in operations' queue exactly as one typed by
 * a surveyor would.
 */
export async function createCircuitFromDocument(input: {
  documentId: string;
  lightType: string;
  /** Where on site — the operator's words, not the file's name. */
  location?: string;
  representedLightCount: number;
  fixtures: ConfirmedFixture[];
  /** The operator's answers to the model's questions, kept with the record. */
  answers: Record<string, string>;
}): Promise<{ error?: string; circuitId?: string; proposedTypes?: string[] }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_survey")) {
    return { error: "Creating a circuit is a field-survey action." };
  }

  const doc = await db.storedDocument.findUnique({ where: { id: input.documentId } });
  if (!doc || doc.voidedAt) return { error: "That document is no longer on record." };

  const lightType = input.lightType.trim();
  if (!lightType) return { error: "Say which light type this circuit represents (CON-11)." };
  const usable = input.fixtures.filter((f) => f.count > 0 && f.watts > 0 && f.hoursPerDay > 0);
  if (usable.length === 0) return { error: "Record at least one fixture line — the inventory is what everything downstream compares against." };
  const metered = usable.filter((f) => f.retrofitted).reduce((n, f) => n + f.count, 0);
  if (metered === 0) return { error: "At least one fixture has to be the one being retrofitted." };
  if (!Number.isFinite(input.representedLightCount) || input.representedLightCount < metered) {
    return { error: `Represented count must be at least the ${metered} lights on this circuit (CON-11).` };
  }

  // Match the catalog by name; propose what is missing rather than inventing
  // a catalog entry nobody approved.
  const proposedTypes: string[] = [];
  const lineTypeIds: string[] = [];
  for (const f of usable) {
    const name = f.label.trim();
    let type = await db.deviceType.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, role: "original", deletedAt: null },
    });
    if (!type) {
      type = await db.deviceType.create({
        data: {
          name,
          role: "original",
          defaultWattage: f.watts,
          status: "proposed",
          inCatalog: false,
          proposedById: actor.id,
          proposedNote: `Read from ${doc.fileName}`,
        },
      });
      proposedTypes.push(name);
    }
    lineTypeIds.push(type.id);
  }

  const circuit = await db.$transaction(async (tx) => {
    const primary = usable.find((f) => f.retrofitted)!;
    const created = await tx.circuit.create({
      data: {
        societyId: doc.societyId,
        serviceLine: "lighting",
        lightType,
        // The area the operator gave, not the filename. A file name in the
        // location field reads as a place and is not one (user-reported
        // 2026-08-26); the document's own provenance is on every device line.
        location: input.location?.trim() || null,
        meteredLightCount: metered,
        representedLightCount: input.representedLightCount,
        // The circuit's headline wattage is the retrofitted fixture's — the
        // one the saving is attributable to.
        wattage: primary.watts,
        // CON-10 metadata, taken from the fixture being retrofitted rather
        // than left blank when the document plainly states it.
        workingHours: primary.hoursPerDay,
        // CON-16's checklist decides whether to RUN a demo. This circuit's
        // demo happened years ago — re-litigating its eligibility would be
        // asking whether to do something already done, and it would send the
        // operator to a survey page that does not exist for a circuit no
        // survey produced. Recorded as not assessed, and why.
        eligibilityChecklist: {
          backfilled: true,
          source: doc.fileName,
          note: "Commissioned before this system existed — CON-16 eligibility was never assessed, and is not re-assessed for a circuit already in service.",
        },
        state: "eligible",
        createdById: actor.id,
      },
    });
    await tx.circuitDevice.createMany({
      data: usable.map((f, i) => ({
        circuitId: created.id,
        deviceTypeId: lineTypeIds[i],
        count: f.count,
        wattage: f.watts,
        hoursPerDay: f.hoursPerDay,
        excludedFromCalculation: !f.retrofitted,
        // Reconstructed from paper, not captured on site — INV-02 means the
        // difference has to be visible rather than assumed.
        historical: true,
        historicalNote: `Read from ${doc.fileName}`,
        recordedById: actor.id,
      })),
    });
    await tx.documentExtraction.update({
      where: { documentId: doc.id },
      data: {
        status: "confirmed",
        confirmed: { lightType, representedLightCount: input.representedLightCount, fixtures: usable, answers: input.answers },
        confirmedAt: new Date(),
        confirmedById: actor.id,
      },
    });
    return created;
  });

  logger.info("document.circuit_created", {
    actorId: actor.id,
    documentId: doc.id,
    circuitId: circuit.id,
    metered,
    excluded: usable.filter((f) => !f.retrofitted).length,
    proposedTypes,
  });
  revalidatePath(`/admin/societies/${doc.societyId}/circuits`);
  revalidatePath(`/admin/documents/${doc.id}`);
  return { circuitId: circuit.id, proposedTypes };
}
