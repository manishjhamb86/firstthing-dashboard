"use server";

import { revalidatePath } from "next/cache";
import type { KycDocumentType, ReceiptChannel } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";

// FEAT-024/026 — KYC collection and verification. PER-01's work throughout
// (FEAT-024-AC-4, FEAT-026-AC-4: a non-PER-01 internal actor gets a
// read-only checklist), so every write here uses the same "PER-01
// specifically" proxy this build has used since MS-03 — hold both
// manage_survey and manage_pipeline — recorded once in PROJECT_CONTEXT.md
// rather than re-derived per action.
async function requirePer01() {
  await requireAdminPermission("manage_survey");
  return requireAdminPermission("manage_pipeline");
}

// The checklist item is created on first touch rather than seeded with the
// pipeline: KYC_REQUIREMENTS is the source of truth for *what* is required,
// so a pipeline created before a requirement existed still shows it.
async function ensureRequirement(pipelineId: string, type: KycDocumentType) {
  return db.kycRequirement.upsert({
    where: { pipelineId_type: { pipelineId, type } },
    create: { pipelineId, type },
    update: {},
  });
}

export async function recordKycFollowUp(pipelineId: string, type: KycDocumentType, note: string) {
  const session = await requirePer01();
  if (!note.trim()) return { error: "Record what the follow-up was — an unattributed chase isn't a signal." };

  const requirement = await ensureRequirement(pipelineId, type);
  await db.kycFollowUp.create({
    data: { requirementId: requirement.id, note: note.trim(), recordedById: session.user.id },
  });

  // FEAT-024-AC-3 — CON-23's per-step follow-up count. Logged as well as
  // stored, since "we chased this four times" is exactly the kind of signal
  // that goes missing when it lives only in a row nobody queries.
  const count = await db.kycFollowUp.count({ where: { requirementId: requirement.id } });
  logger.info("kyc.follow_up_recorded", { actorId: session.user.id, pipelineId, type, count });

  revalidatePath(`/admin/pipeline/${pipelineId}/kyc`);
  return {};
}

export async function markKycNotApplicable(pipelineId: string, type: KycDocumentType, reason: string) {
  const session = await requirePer01();
  // FEAT-024-AC-5 — the reason is the whole point: without it this is just a
  // way to make an outstanding item disappear from the stall signal.
  if (!reason.trim()) return { error: "Give a reason this document doesn't apply to this society." };

  const requirement = await ensureRequirement(pipelineId, type);
  if (requirement.status === "verified") {
    return { error: "This document is already verified — it can't be marked not-applicable." };
  }

  await db.kycRequirement.update({
    where: { id: requirement.id },
    data: {
      status: "not_applicable",
      notApplicableReason: reason.trim(),
      markedNaById: session.user.id,
      markedNaAt: new Date(),
    },
  });

  logger.info("kyc.marked_not_applicable", { actorId: session.user.id, pipelineId, type });
  revalidatePath(`/admin/pipeline/${pipelineId}/kyc`);
  return {};
}

export async function reopenKycRequirement(pipelineId: string, type: KycDocumentType) {
  const session = await requirePer01();
  const requirement = await ensureRequirement(pipelineId, type);

  const hasPending = await db.kycDocumentFile.count({
    where: { requirementId: requirement.id, state: "pending" },
  });

  await db.kycRequirement.update({
    where: { id: requirement.id },
    data: {
      status: hasPending > 0 ? "received" : "outstanding",
      notApplicableReason: null,
      markedNaById: null,
      markedNaAt: null,
    },
  });

  logger.info("kyc.reopened", { actorId: session.user.id, pipelineId, type });
  revalidatePath(`/admin/pipeline/${pipelineId}/kyc`);
  return {};
}

// FEAT-026-AC-1 — a document received out-of-band (WhatsApp, a phone call, in
// person) is recorded against the checklist item *with the channel*, because
// how a legal document arrived is part of its provenance, not incidental.
export async function recordKycDocument(
  pipelineId: string,
  input: { type: KycDocumentType; s3Key: string; fileName: string; receiptChannel: ReceiptChannel },
) {
  const session = await requirePer01();
  if (!input.s3Key || !input.fileName) return { error: "Attach the document file first." };

  const requirement = await ensureRequirement(pipelineId, input.type);

  await db.$transaction([
    db.kycDocumentFile.create({
      data: {
        requirementId: requirement.id,
        s3Key: input.s3Key,
        fileName: input.fileName,
        receiptChannel: input.receiptChannel,
        uploadedById: session.user.id,
      },
    }),
    // A newly-received document never downgrades a requirement that is
    // already verified — FEAT-026-AC-5's duplicate arrives *alongside* the
    // verified one rather than reopening the item.
    db.kycRequirement.update({
      where: { id: requirement.id },
      data: requirement.status === "verified" ? {} : { status: "received" },
    }),
  ]);

  logger.info("kyc.document_recorded", {
    actorId: session.user.id,
    pipelineId,
    type: input.type,
    channel: input.receiptChannel,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/kyc`);
  return {};
}

export async function verifyKycDocument(pipelineId: string, fileId: string) {
  const session = await requirePer01();
  const file = await db.kycDocumentFile.findUnique({
    where: { id: fileId },
    include: { requirement: true },
  });
  if (!file || file.requirement.pipelineId !== pipelineId) return { error: "Document not found." };
  if (file.state === "verified") return { error: "This document is already verified." };

  await db.$transaction([
    db.kycDocumentFile.update({
      where: { id: fileId },
      data: { state: "verified", verifiedById: session.user.id, verifiedAt: new Date(), rejectionReason: null },
    }),
    db.kycRequirement.update({ where: { id: file.requirementId }, data: { status: "verified" } }),
  ]);

  logger.info("kyc.document_verified", { actorId: session.user.id, pipelineId, fileId, type: file.requirement.type });
  revalidatePath(`/admin/pipeline/${pipelineId}/kyc`);
  return {};
}

// FEAT-026-AC-3 — a rejection carries a reason and returns the item to
// outstanding, so whoever follows up knows what to ask for. The rejected file
// is kept, not deleted: "we rejected this once and why" is the record.
export async function rejectKycDocument(pipelineId: string, fileId: string, reason: string) {
  const session = await requirePer01();
  if (!reason.trim()) return { error: "Give the reason — the society has to know what to send instead." };

  const file = await db.kycDocumentFile.findUnique({
    where: { id: fileId },
    include: { requirement: { include: { files: true } } },
  });
  if (!file || file.requirement.pipelineId !== pipelineId) return { error: "Document not found." };

  const otherVerified = file.requirement.files.some((f) => f.id !== fileId && f.state === "verified");
  const otherPending = file.requirement.files.some((f) => f.id !== fileId && f.state === "pending");

  await db.$transaction([
    db.kycDocumentFile.update({
      where: { id: fileId },
      data: { state: "rejected", rejectionReason: reason.trim(), verifiedById: session.user.id, verifiedAt: new Date() },
    }),
    db.kycRequirement.update({
      where: { id: file.requirementId },
      // Rejecting one copy must not undo a sibling that was already accepted
      // (FEAT-026-AC-5's two-paths case).
      data: { status: otherVerified ? "verified" : otherPending ? "received" : "outstanding" },
    }),
  ]);

  logger.info("kyc.document_rejected", { actorId: session.user.id, pipelineId, fileId, type: file.requirement.type });
  revalidatePath(`/admin/pipeline/${pipelineId}/kyc`);
  return {};
}
