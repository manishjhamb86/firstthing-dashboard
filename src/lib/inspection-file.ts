import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Prisma } from "@prisma/client";
import { s3, S3_BUCKET } from "./s3";
import { buildDocumentKey } from "./document-keys";
import { circuitLabelOf } from "./circuit-label";
import { istWallClock } from "./field-today";
import {
  refuseInspectionFinalize,
  refuseInspectionStart,
  type FindingInput,
} from "./inspection";
import type { FieldInspectionPayload } from "./field-sync";

/**
 * "Now", in the terms a typed visit time is stored in (wall-clock, read with
 * UTC parts — format-date.ts). A person types the time on their own clock;
 * comparing that against the server's real instant refused every correctly
 * typed visit as "in the future" for the 5½ hours India is ahead of UTC.
 * Shared by the back office's start and the field app's filing, so the two
 * cannot disagree about whether a visit happened yet.
 */
export function inspectionNow(): Date {
  return istWallClock(new Date());
}

type Actor = { id: string; name: string | null; email: string };

/**
 * File a whole inspection in one go — the field app's path (2026-09-29).
 *
 * On the phone there is no server to claim the (society, area, month) slot at
 * arrival, so the two acts the back office keeps apart (start, then finalise)
 * arrive together. The RULES are exactly theirs: the same refusals, in the same
 * order, from inspection.ts — this is a third entry point to one decision, not
 * a second decision. Runs inside the caller's transaction so the sync receipt
 * and the inspection commit or fail together.
 */
export async function fileInspection(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: FieldInspectionPayload,
): Promise<{ inspectionId: string } | { error: string }> {
  const society = await tx.society.findUnique({ where: { id: input.societyId }, select: { id: true } });
  if (!society) return { error: "That society no longer exists." };

  let area = "";
  if (input.circuitId) {
    const circuit = await tx.circuit.findUnique({
      where: { id: input.circuitId },
      select: { societyId: true, location: true, lightType: true, voidedAt: true },
    });
    if (!circuit || circuit.societyId !== input.societyId || circuit.voidedAt) {
      return { error: "That circuit is not available for this society." };
    }
    area = circuitLabelOf(circuit.location, circuit.lightType);
  }

  const inspectedAt = new Date(`${input.inspectedAt}:00Z`);
  const inspectorName = actor.name ?? actor.email;
  const inspectorContact = actor.email;

  const existing = await tx.inspection.findUnique({
    where: { societyId_area_period: { societyId: input.societyId, area, period: input.period } },
    select: { voidedAt: true },
  });
  const startRefusal = refuseInspectionStart(
    { area, period: input.period, inspectedAt, inspectorName, inspectorContact },
    { now: inspectionNow(), existingActiveForSlot: existing !== null && existing.voidedAt === null },
  );
  if (startRefusal) return { error: startRefusal };

  const findings: FindingInput[] = input.findings.map((f, i) => ({ srNo: i + 1, ...f }));
  const finalizeRefusal = refuseInspectionFinalize({ totalLightsChecked: input.totalLightsChecked, findings });
  if (finalizeRefusal) return { error: finalizeRefusal };

  // A voided inspection still holds the slot's unique key (society, area,
  // month), so the slot cannot take a second row — in the back office either.
  // Say so in words rather than letting the unique index answer with a 500.
  if (existing) {
    return { error: "An inspection for this society, area and month was filed and then voided. That month's slot cannot be filed again." };
  }

  const created = await tx.inspection.create({
    data: {
      societyId: input.societyId,
      circuitId: input.circuitId,
      area,
      period: input.period,
      inspectedAt,
      inspectorName,
      inspectorContact,
      createdById: actor.id,
      totalLightsChecked: input.totalLightsChecked,
      societyRepName: input.societyRepName.trim() || null,
      notes: input.notes.trim() || null,
      findings: {
        create: findings.map((f) => ({
          srNo: f.srNo,
          location: f.location.trim(),
          sensorStatus: f.sensorStatus,
          physicalDamage: f.physicalDamage,
          actionReplace: f.actionReplace,
          remarks: f.remarks.trim() || null,
          addedById: actor.id,
        })),
      },
    },
    select: { id: true },
  });
  return { inspectionId: created.id };
}

/**
 * The upload URL for the photo of the signed, stamped paper form — one key
 * builder for the back office and the phone, under the public Documents/ tree
 * the portal links to.
 */
export async function presignInspectionEvidence(input: {
  inspectionId: string;
  societyName: string;
  period: string;
  fileName: string;
  contentType: string;
}): Promise<{ uploadUrl: string; key: string }> {
  const extension = (input.fileName.split(".").pop() ?? "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  const key = buildDocumentKey({
    society: input.societyName,
    month: input.period,
    docType: "inspectionEvidence",
    dateLabel: input.period,
    identifier: input.inspectionId,
    extension,
  });
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: 300 },
  );
  return { uploadUrl, key };
}
