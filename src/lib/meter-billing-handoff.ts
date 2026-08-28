import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildCircuitFlowReadingKey } from "@/lib/ingest-keys";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { savingsPct, SAVINGS_SUSPECT_ABOVE } from "@/lib/circuit-load";
import { syncCircuitBandAlert } from "@/lib/savings-band-alerts";

/**
 * The meter store and the billing store hold THE SAME READINGS — the user's
 * decision (2026-08-28), reaffirmed over the review-gated hand-off this
 * module first shipped: "they both should use the same table same readings."
 *
 * `MeterHourlyReading` is the single source: what the meter's export said,
 * hour by hour. `MeterReading` is its DAILY PROJECTION — the billing grain —
 * maintained automatically by this module whenever a bound meter's hours
 * change. Nothing is typed twice, uploaded twice, or reviewed before it
 * becomes visible; correction is post-hoc (the existing exclusion and
 * supersession mechanisms), not a gate in front of the figures.
 *
 * The invariants hold without the gate:
 * - INV-02 (traceability): every projected row carries a `rawFileId`; the
 *   file's bytes are in S3 under `Ingest/`, and the import row records who
 *   uploaded what and when.
 * - INV-09 (anomaly detection before billing): each projected day is checked
 *   as it lands — a partial day is stored but auto-excluded, and a day whose
 *   savings are impossible (above CON-20's suspect bound, or negative) is
 *   flagged — and the monthly calculation's own release triage still refuses
 *   to bulk-release a month that needs review.
 * - INV-03 (released figures never restated): a row consumed by a released
 *   calculation is never touched; the conflict is counted and reported.
 */

const PARTIAL_REASON_PREFIX = "Partial day — ";

export type ProjectionSummary = {
  days: number;
  created: number;
  updated: number;
  unchanged: number;
  partialExcluded: number;
  flagged: number;
  /** Rows a released calculation has consumed — left exactly as they are. */
  lockedSkipped: number;
};

/**
 * Every import needs a RawReadingFile for provenance (`MeterReading.rawFileId`
 * is required, deliberately). An import made before this pipeline existed has
 * no stored bytes, so the file is RECONSTRUCTED from its own hourly rows —
 * identical readings in the vendor's own column layout — and named as a
 * reconstruction rather than passed off as the original.
 */
async function ensureRawFileForImport(imp: {
  id: string;
  fileName: string;
  rawReadingFileId: string | null;
  uploadedById: string;
  circuitId: string;
  societyName: string;
}): Promise<string> {
  if (imp.rawReadingFileId) return imp.rawReadingFileId;

  const hours = await db.meterHourlyReading.findMany({
    where: { importId: imp.id },
    orderBy: [{ day: "asc" }, { hour: "asc" }],
    select: { day: true, hour: true, kWh: true },
  });
  const text =
    "data,time,consumption/KWh\n" +
    hours
      .map(
        (h) =>
          `${h.day.toISOString().slice(0, 10)},${String(h.hour).padStart(2, "0")}:00-${String((h.hour + 1) % 24).padStart(2, "0")}:00,${h.kWh}`,
      )
      .join("\n");
  const fileName = imp.fileName.replace(/(\.[^.]+)?$/, " (reconstructed from meter store)$1");
  const key = buildCircuitFlowReadingKey({
    society: imp.societyName,
    phase: "monitoring",
    circuitId: imp.circuitId,
    fileName,
    uploadedAt: new Date(),
  });
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: text, ContentType: "text/csv" }));
  const file = await db.rawReadingFile.create({
    data: {
      circuitId: imp.circuitId,
      period: null,
      s3Key: key,
      fileName,
      contentType: "text/csv",
      byteSize: Buffer.byteLength(text, "utf8"),
      vendor: "sonoff",
      status: "committed",
      uploadedById: imp.uploadedById,
    },
  });
  await db.meterCsvImport.update({ where: { id: imp.id }, data: { rawReadingFileId: file.id } });
  logger.info("meter.raw_file_reconstructed", { importId: imp.id, rawFileId: file.id, key });
  return file.id;
}

/** Store the original upload's bytes and provenance row, before projecting. */
export async function recordMeterRawFile(input: {
  actorId: string;
  importId: string;
  circuitId: string;
  societyName: string;
  fileName: string;
  text: string;
}): Promise<string> {
  const key = buildCircuitFlowReadingKey({
    society: input.societyName,
    phase: "monitoring",
    circuitId: input.circuitId,
    fileName: input.fileName,
    uploadedAt: new Date(),
  });
  await s3.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: input.text, ContentType: "text/csv" }),
  );
  const file = await db.rawReadingFile.create({
    data: {
      circuitId: input.circuitId,
      period: null,
      s3Key: key,
      fileName: input.fileName,
      contentType: "text/csv",
      byteSize: Buffer.byteLength(input.text, "utf8"),
      vendor: "sonoff",
      status: "committed",
      uploadedById: input.actorId,
    },
  });
  await db.meterCsvImport.update({
    where: { id: input.importId },
    data: { rawReadingFileId: file.id, s3Key: key },
  });
  return file.id;
}

/**
 * Mirror the meter's whole hourly store into the circuit's daily billing
 * rows. Idempotent: running it twice changes nothing the second time.
 */
export async function projectMeterStoreToCircuit(input: {
  meterId: string;
  actorId: string;
}): Promise<ProjectionSummary | { error: string }> {
  const meter = await db.meterDevice.findUnique({
    where: { id: input.meterId },
    select: {
      id: true,
      circuitId: true,
      circuit: {
        select: {
          id: true,
          voidedAt: true,
          lightReplacementDate: true,
          preInstallBaseline: true,
          rescaleEvents: true,
          society: { select: { name: true } },
        },
      },
    },
  });
  if (!meter?.circuitId || !meter.circuit || meter.circuit.voidedAt) {
    return { error: "the meter is not bound to a live circuit" };
  }
  const circuit = meter.circuit;

  const hours = await db.meterHourlyReading.findMany({
    where: { meterId: meter.id },
    orderBy: [{ day: "asc" }, { hour: "asc" }],
    select: { day: true, kWh: true, importId: true },
  });
  const summary: ProjectionSummary = {
    days: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    partialExcluded: 0,
    flagged: 0,
    lockedSkipped: 0,
  };
  if (hours.length === 0) return summary;

  // Day → total, hour count, and the import that carried it (for provenance).
  const byDay = new Map<number, { kWh: number; count: number; importId: string | null }>();
  for (const h of hours) {
    const t = h.day.getTime();
    const d = byDay.get(t) ?? { kWh: 0, count: 0, importId: null };
    d.kWh += h.kWh;
    d.count += 1;
    d.importId = d.importId ?? h.importId;
    byDay.set(t, d);
  }

  // Provenance per import, created lazily (one reconstruction at most each).
  const rawFileByImport = new Map<string, string>();
  async function rawFileFor(importId: string | null): Promise<string> {
    if (!importId) throw new Error("an hourly row with no import cannot be projected");
    const cached = rawFileByImport.get(importId);
    if (cached) return cached;
    const imp = await db.meterCsvImport.findUniqueOrThrow({
      where: { id: importId },
      select: { id: true, fileName: true, rawReadingFileId: true, uploadedById: true },
    });
    const id = await ensureRawFileForImport({
      ...imp,
      circuitId: circuit.id,
      societyName: circuit.society.name,
    });
    rawFileByImport.set(importId, id);
    return id;
  }

  const existing = await db.meterReading.findMany({
    where: { circuitId: circuit.id, source: "csv" },
    select: {
      id: true,
      date: true,
      kWh: true,
      intervalCount: true,
      usedInCalculationId: true,
      excludedAt: true,
      excludedReason: true,
    },
  });
  const existingByDay = new Map(existing.map((r) => [r.date.getTime(), r]));
  const now = new Date();
  const baseline = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, now);

  for (const [t, d] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    summary.days++;
    const date = new Date(t);
    const partial = d.count < 24;
    const kWh = Math.round(d.kWh * 1e6) / 1e6;
    // INV-09's day check, without a human gate: a saving above CON-20's
    // suspect bound reads as a dead meter, a negative one as an impossible
    // day. Both are stored AND flagged — visible everywhere, and the monthly
    // release triage refuses to bulk-release a month carrying them.
    const afterReplacement =
      circuit.lightReplacementDate !== null && date.getTime() > circuit.lightReplacementDate.getTime();
    const pct = afterReplacement && !partial && baseline !== null ? savingsPct(baseline, kWh) : null;
    const anomalyFlag = pct !== null && (pct > SAVINGS_SUSPECT_ABOVE || pct < 0);
    if (anomalyFlag) summary.flagged++;

    const prior = existingByDay.get(t);
    if (!prior) {
      await db.meterReading.create({
        data: {
          circuitId: circuit.id,
          date,
          kWh,
          source: "csv",
          intervalCount: d.count,
          expectedIntervals: 24,
          anomalyFlag,
          rawFileId: await rawFileFor(d.importId),
          ...(partial
            ? {
                excludedAt: now,
                excludedById: input.actorId,
                excludedReason: `${PARTIAL_REASON_PREFIX}${d.count} of 24 hours in the export`,
              }
            : {}),
        },
      });
      summary.created++;
      if (partial) summary.partialExcluded++;
      continue;
    }

    const valueChanged = Math.abs(prior.kWh - kWh) > 0.0005;
    const countChanged = prior.intervalCount !== d.count;
    if (!valueChanged && !countChanged) {
      summary.unchanged++;
      continue;
    }
    // INV-03 — a figure a released calculation consumed is never restated.
    if (prior.usedInCalculationId) {
      summary.lockedSkipped++;
      logger.warn("meter.projection_locked_row", { circuitId: circuit.id, date: date.toISOString().slice(0, 10) });
      continue;
    }
    const wasAutoPartial = prior.excludedReason?.startsWith(PARTIAL_REASON_PREFIX) ?? false;
    await db.meterReading.update({
      where: { id: prior.id },
      data: {
        kWh,
        intervalCount: d.count,
        anomalyFlag,
        ...(valueChanged
          ? {
              // ADR-005 — superseded, never silently overwritten.
              supersededValue: prior.kWh,
              supersededAt: now,
              supersededByUserId: input.actorId,
            }
          : {}),
        // A day that has filled out to 24 hours sheds its automatic partial
        // exclusion — the decision was about a value that no longer exists
        // (the same rule MS-07 learned for superseded exclusions). A HUMAN
        // exclusion, whatever its reason, is never touched.
        ...(partial
          ? wasAutoPartial || !prior.excludedAt
            ? {
                excludedAt: now,
                excludedById: input.actorId,
                excludedReason: `${PARTIAL_REASON_PREFIX}${d.count} of 24 hours in the export`,
              }
            : {}
          : wasAutoPartial
            ? { excludedAt: null, excludedById: null, excludedReason: null }
            : {}),
      },
    });
    summary.updated++;
    if (partial) summary.partialExcluded++;
  }

  logger.info("meter.projected_to_billing", { meterId: meter.id, circuitId: circuit.id, ...summary });
  // The savings figure just changed, so where it stands against the
  // contracted band may have too. Evaluated here rather than only on a timer,
  // so an import that pushes a circuit out of band is noticed at once.
  await syncCircuitBandAlert(circuit.id);
  return summary;
}
