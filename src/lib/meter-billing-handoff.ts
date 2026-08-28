import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildCircuitFlowReadingKey } from "@/lib/ingest-keys";
import { deriveUploadKind } from "@/lib/circuit-load";

/**
 * File a meter export into the circuit's billing review — the stitch that
 * makes the meter dashboard and live monitoring one pipeline instead of two
 * tools holding the same file.
 *
 * The two stores stay deliberately separate, and that is the industry's own
 * shape (a meter-data system runs validation — "VEE" — between raw interval
 * telemetry and revenue-grade data; billing consumes only the validated
 * side): `MeterHourlyReading` is raw telemetry at the hour grain, and
 * `MeterReading` is the reviewed daily store that benchmarks and bills are
 * computed from, which INV-02/INV-09 and CON-45 require a person to have
 * looked at. What was WRONG was the seam: one file had to be uploaded twice,
 * once per store. Now the meter import files the same bytes into CON-45's
 * queue by itself, and the operator's row-by-row review is the only step
 * left between an upload and every billing surface.
 *
 * Deliberately NOT an auto-commit into `MeterReading`: that would put an
 * unreviewed figure into the store a society is billed from, which is the
 * exact thing the review exists to prevent.
 */
export type HandoffResult =
  | { filed: true; rawFileId: string; reused: boolean; kind: "pre_install" | "post_install" | "monitoring" }
  | { filed: false; reason: string };

export async function handOffToBillingReview(input: {
  actorId: string;
  circuitId: string;
  fileName: string;
  text: string;
}): Promise<HandoffResult> {
  const circuit = await db.circuit.findUnique({
    where: { id: input.circuitId },
    select: {
      id: true,
      voidedAt: true,
      meterInstalledAt: true,
      lightReplacementDate: true,
      preInstallBaseline: true,
      benchmarkSavingsPct: true,
      society: { select: { name: true } },
    },
  });
  if (!circuit || circuit.voidedAt) return { filed: false, reason: "the circuit no longer exists" };
  if (!circuit.meterInstalledAt) {
    // The review derives each day's phase from the circuit's own dates; with
    // no install date there is no phase to derive. Stated, not silently
    // skipped — the meter store keeps the hours either way.
    return { filed: false, reason: "the circuit has no meter-install date recorded yet" };
  }

  const byteSize = Buffer.byteLength(input.text, "utf8");

  // A re-import of the same file must not queue a second review of it.
  const existing = await db.rawReadingFile.findFirst({
    where: {
      circuitId: circuit.id,
      fileName: input.fileName,
      byteSize,
      status: { in: ["pending_normalization", "awaiting_mapping", "ready"] },
    },
    select: { id: true },
  });
  const kind = deriveUploadKind(circuit);
  if (existing) return { filed: true, rawFileId: existing.id, reused: true, kind };

  const key = buildCircuitFlowReadingKey({
    society: circuit.society.name,
    phase: kind,
    circuitId: circuit.id,
    fileName: input.fileName,
    uploadedAt: new Date(),
  });
  // Raw file first (CON-30): the bytes are in S3 before anything interprets
  // them — and before the review row exists to point at them.
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: input.text,
      ContentType: "text/csv",
    }),
  );

  const file = await db.rawReadingFile.create({
    data: {
      circuitId: circuit.id,
      period: null,
      ingestPhase: kind,
      s3Key: key,
      fileName: input.fileName,
      contentType: "text/csv",
      byteSize,
      vendor: "sonoff",
      status: "pending_normalization",
      uploadedById: input.actorId,
    },
  });
  logger.info("meter.billing_review_filed", {
    actorId: input.actorId,
    circuitId: circuit.id,
    rawFileId: file.id,
    kind,
    key,
  });
  return { filed: true, rawFileId: file.id, reused: false, kind };
}
