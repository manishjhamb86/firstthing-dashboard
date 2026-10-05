/**
 * Monitoring days — projected from the meter's hourly store through the meter
 * history, from the billing start on (2026-09-26, user-specified).
 *
 * Idempotent and complete: every stay any meter had on the circuit is read
 * (not just the current binding), rows no longer covered are removed, and a
 * released row is never touched (INV-03). The monthly upload's rows are never
 * removed; where the meter covers the same day, the meter wins and the
 * upload's figure is kept on the row (`mergeMonitoringDay`).
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, S3_BUCKET } from "@/lib/s3";
import { buildMeterImportKey } from "@/lib/ingest-keys";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { EXCLUSION_DEVICE_SELECT, exclusionFromDevices, savingsPct, SAVINGS_SUSPECT_ABOVE } from "@/lib/circuit-load";
import { mergeMonitoringDay, monitoringStart, type Origin } from "@/lib/monitoring";
import { dayMs } from "@/lib/demo-periods";
import { classifyDayHours, inferOperatingHours, OPERATING_HOURS_WINDOW_DAYS } from "@/lib/day-validity";

export const PARTIAL_REASON_PREFIX = "Partial day — ";

export type ProjectionSummary = {
  monitoringStart: string | null;
  days: number;
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  partialExcluded: number;
  flagged: number;
  releasedSkipped: number;
};

/** The billing start a circuit's monitoring counts from, or null before a contract. */
export async function circuitMonitoringStart(circuitId: string): Promise<Date | null> {
  const c = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      siteSurvey: {
        select: {
          pipeline: {
            select: {
              contract: { select: { termStart: true, status: true } },
              installationProject: { select: { certificate: { select: { billingStartDate: true } } } },
            },
          },
        },
      },
    },
  });
  const pipeline = c?.siteSurvey?.pipeline;
  const contract = pipeline?.contract;
  if (!contract || contract.status === "draft") return null;
  return monitoringStart({
    certificateBillingStart: pipeline?.installationProject?.certificate?.billingStartDate ?? null,
    contractTermStart: contract.termStart,
  });
}

/**
 * A RawReadingFile for an import ON a circuit (MeterReading.rawFileId is
 * required, INV-02). One meter file can feed several circuits once a meter is
 * reused, so each circuit gets its own provenance row pointing at the same
 * stored bytes. An import predating stored bytes is reconstructed from its own
 * hours and named as a reconstruction.
 */
async function rawFileForImportOnCircuit(importId: string, circuitId: string): Promise<string> {
  const imp = await db.meterCsvImport.findUniqueOrThrow({
    where: { id: importId },
    select: {
      id: true,
      meterId: true,
      fileName: true,
      s3Key: true,
      uploadedById: true,
      rawReadingFileId: true,
      rawReadingFile: { select: { id: true, circuitId: true, s3Key: true, byteSize: true } },
    },
  });
  if (imp.rawReadingFile && imp.rawReadingFile.circuitId === circuitId) return imp.rawReadingFile.id;

  let key = imp.s3Key ?? imp.rawReadingFile?.s3Key ?? null;
  let byteSize = imp.rawReadingFile?.byteSize ?? 0;
  let fileName = imp.fileName;
  if (key) {
    const existing = await db.rawReadingFile.findFirst({ where: { circuitId, s3Key: key }, select: { id: true } });
    if (existing) return existing.id;
  } else {
    const hours = await db.meterHourlyReading.findMany({
      where: { importId: imp.id },
      orderBy: [{ day: "asc" }, { hour: "asc" }],
      select: { day: true, hour: true, kWh: true },
    });
    const text =
      "data,time,consumption/KWh\n" +
      hours
        .map((h) => `${h.day.toISOString().slice(0, 10)},${String(h.hour).padStart(2, "0")}:00-${String((h.hour + 1) % 24).padStart(2, "0")}:00,${h.kWh}`)
        .join("\n");
    fileName = imp.fileName.replace(/(\.[^.]+)?$/, " (reconstructed from meter store)$1");
    key = buildMeterImportKey({ meterId: imp.meterId, fileName, uploadedAt: new Date() });
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: text, ContentType: "text/csv" }));
    byteSize = Buffer.byteLength(text, "utf8");
    await db.meterCsvImport.update({ where: { id: imp.id }, data: { s3Key: key } });
    logger.info("meter.raw_file_reconstructed", { importId: imp.id, key });
  }
  const file = await db.rawReadingFile.create({
    data: {
      circuitId,
      period: null,
      s3Key: key,
      fileName,
      contentType: "text/csv",
      byteSize,
      vendor: "sonoff",
      status: "committed",
      uploadedById: imp.uploadedById,
    },
  });
  if (!imp.rawReadingFileId) await db.meterCsvImport.update({ where: { id: imp.id }, data: { rawReadingFileId: file.id } });
  return file.id;
}

/**
 * Hourly samples for LEARNING the circuit's own operating-hour pattern
 * (`src/lib/day-validity.ts`) — deliberately unbounded by the billing start,
 * since a circuit's physical schedule doesn't begin the day billing does; a
 * meter commissioned months before billing started already shows the real
 * pattern. Bounded only by the rolling window the learner itself uses.
 */
export async function circuitHourlySamples(
  meterInstallations: { meterId: string; installedAt: Date; removedAt: Date | null }[],
  today: Date,
): Promise<{ day: string; hour: number; kWh: number }[]> {
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - OPERATING_HOURS_WINDOW_DAYS);
  const out: { day: string; hour: number; kWh: number }[] = [];
  for (const stay of meterInstallations) {
    const from = stay.installedAt.getTime() > cutoff.getTime() ? stay.installedAt : cutoff;
    if (stay.removedAt && stay.removedAt.getTime() <= from.getTime()) continue;
    const rows = await db.meterHourlyReading.findMany({
      where: { meterId: stay.meterId, day: { gte: from, ...(stay.removedAt ? { lt: stay.removedAt } : {}) } },
      select: { day: true, hour: true, kWh: true },
    });
    for (const r of rows) out.push({ day: r.day.toISOString().slice(0, 10), hour: r.hour, kWh: r.kWh });
  }
  return out;
}

export async function projectCircuitMonitoring(circuitId: string, actorId: string | null): Promise<ProjectionSummary> {
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      voidedAt: true,
      preInstallBaseline: true,
      rescaleEvents: true,
      devices: { select: EXCLUSION_DEVICE_SELECT },
      meterInstallations: {
        orderBy: { installedAt: "asc" },
        select: { meterId: true, installedAt: true, removedAt: true },
      },
    },
  });
  const start = circuit && !circuit.voidedAt ? await circuitMonitoringStart(circuitId) : null;
  const summary: ProjectionSummary = {
    monitoringStart: start ? start.toISOString().slice(0, 10) : null,
    days: 0,
    created: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    partialExcluded: 0,
    flagged: 0,
    releasedSkipped: 0,
  };
  if (!circuit) return summary;

  const now = new Date();

  // Day → total, hours, meter, the import that carried it, and WHICH hours
  // actually had data (day-validity.ts, 2026-10-05) — the day-level check
  // below judges this against the circuit's own learned operating hours,
  // not a blanket 24.
  const byDay = new Map<
    number,
    { kWh: number; hours: number; dataHours: number; meterId: string; importId: string | null; present: boolean[] }
  >();
  if (start) {
    for (const stay of circuit.meterInstallations) {
      const from = new Date(Math.max(stay.installedAt.getTime(), dayMs(start)));
      if (stay.removedAt && stay.removedAt.getTime() <= from.getTime()) continue;
      const hours = await db.meterHourlyReading.findMany({
        where: { meterId: stay.meterId, day: { gte: from, ...(stay.removedAt ? { lt: stay.removedAt } : {}) } },
        select: { day: true, hour: true, kWh: true, importId: true },
      });
      for (const h of hours) {
        const t = dayMs(h.day);
        const d = byDay.get(t) ?? { kWh: 0, hours: 0, dataHours: 0, meterId: stay.meterId, importId: null, present: new Array(24).fill(false) as boolean[] };
        d.kWh += h.kWh;
        d.hours += 1;
        if (h.kWh !== 0) {
          d.dataHours += 1;
          d.present[h.hour] = true;
        }
        d.importId = d.importId ?? h.importId;
        byDay.set(t, d);
      }
    }
  }
  const operating = start
    ? inferOperatingHours(await circuitHourlySamples(circuit.meterInstallations, now), now)
    : { hours: new Set<number>(), confident: false };

  const existing = await db.meterReading.findMany({
    where: { circuitId, source: "csv" },
    select: {
      id: true,
      date: true,
      kWh: true,
      origin: true,
      rawFileId: true,
      otherKwh: true,
      otherOrigin: true,
      otherRawFileId: true,
      intervalCount: true,
      usedInCalculationId: true,
      excludedAt: true,
      excludedReason: true,
      validOverrideAt: true,
    },
  });
  const existingByDay = new Map(existing.map((r) => [dayMs(r.date), r]));
  const baseline = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, now);
  const overrideByDay = new Map(existing.filter((r) => r.validOverrideAt !== null).map((r) => [dayMs(r.date), true]));
  // Judged on the replaced lights: what stayed unreplaced comes off both sides.
  const exclusion = exclusionFromDevices(circuit.devices, "monitoring");
  const rawFiles = new Map<string, string>();
  const rawFile = async (importId: string | null) => {
    if (!importId) throw new Error("an hourly row with no import cannot be projected");
    if (!rawFiles.has(importId)) rawFiles.set(importId, await rawFileForImportOnCircuit(importId, circuitId));
    return rawFiles.get(importId)!;
  };

  for (const [t, d] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    summary.days++;
    const date = new Date(t);
    const kWh = Math.round(d.kWh * 1e6) / 1e6;
    // Circuit-aware (day-validity.ts, 2026-10-05): judged against the
    // circuit's own learned operating hours, not a blanket 24 — a
    // shorter-than-24h circuit's real off-hours reading zero is never
    // counted as a gap.
    const hourClass = classifyDayHours({ hourlyPresent: d.present, intervalCount: null }, operating);
    const partial = hourClass.dayClass === "partial";
    const overridden = overrideByDay.has(t);
    const pct = !partial && baseline !== null ? savingsPct(baseline, kWh, exclusion) : null;
    const anomalyFlag = pct !== null && (pct > SAVINGS_SUSPECT_ABOVE || pct < 0);
    if (anomalyFlag) summary.flagged++;
    const prior = existingByDay.get(t);
    const action = mergeMonitoringDay(
      prior
        ? {
            kWh: prior.kWh,
            origin: prior.origin as Origin,
            rawFileId: prior.rawFileId,
            released: prior.usedInCalculationId !== null,
            otherKwh: prior.otherKwh,
            otherOrigin: prior.otherOrigin as Origin | null,
          }
        : null,
      { kWh, origin: "meter", rawFileId: "", dataHours: d.dataHours },
    );
    // An operator's override (2026-10-05) suppresses the auto-exclude
    // outright — re-projecting must never silently undo a stated exception.
    const partialData =
      partial && !overridden
        ? { excludedAt: now, excludedById: actorId, excludedReason: `${PARTIAL_REASON_PREFIX}${hourClass.hoursPresent} of ${hourClass.hoursExpected} expected hours` }
        : {};
    const dayClassData = {
      dayClass: hourClass.dayClass,
      dayClassHoursExpected: hourClass.hoursExpected,
      dayClassHoursPresent: hourClass.hoursPresent,
    };
    if (action.kind === "create") {
      await db.meterReading.create({
        data: {
          circuitId,
          meterId: d.meterId,
          date,
          kWh,
          source: "csv",
          origin: "meter",
          intervalCount: d.hours,
          expectedIntervals: 24,
          dataHours: d.dataHours,
          anomalyFlag,
          rawFileId: await rawFile(d.importId),
          ...dayClassData,
          ...partialData,
        },
      });
      summary.created++;
      if (partial && !overridden) summary.partialExcluded++;
    } else if (action.kind === "skip") {
      if (action.why === "released") summary.releasedSkipped++;
      else summary.unchanged++;
      // A day unchanged in value can still have filled out its hours.
      if (action.why === "unchanged" && prior && prior.intervalCount !== d.hours) {
        const wasAuto = prior.excludedReason?.startsWith(PARTIAL_REASON_PREFIX) ?? false;
        await db.meterReading.update({
          where: { id: prior.id },
          data: {
            intervalCount: d.hours,
            dataHours: d.dataHours,
            ...dayClassData,
            ...(partial && !overridden ? (prior.excludedAt ? {} : partialData) : wasAuto ? { excludedAt: null, excludedById: null, excludedReason: null } : {}),
          },
        });
      }
    } else if (prior) {
      const wasAuto = prior.excludedReason?.startsWith(PARTIAL_REASON_PREFIX) ?? false;
      await db.meterReading.update({
        where: { id: prior.id },
        data: {
          ...(action.replaceValue
            ? {
                kWh,
                meterId: d.meterId,
                origin: "meter",
                rawFileId: await rawFile(d.importId),
                intervalCount: d.hours,
                dataHours: d.dataHours,
                anomalyFlag,
              }
            : {}),
          ...(action.supersede ? { supersededValue: prior.kWh, supersededAt: now, supersededByUserId: actorId } : {}),
          otherKwh: action.other.kWh,
          otherOrigin: action.other.origin,
          otherRawFileId: action.replaceValue && prior.origin !== "meter" ? prior.rawFileId : undefined,
          ...dayClassData,
          ...(partial && !overridden
            ? wasAuto || !prior.excludedAt
              ? partialData
              : {}
            : wasAuto
              ? { excludedAt: null, excludedById: null, excludedReason: null }
              : {}),
        },
      });
      summary.updated++;
      if (partial && !overridden) summary.partialExcluded++;
    }
  }

  // Meter days no longer covered by any stay (or before the billing start).
  // An upload's figure kept as "other" is restored rather than lost.
  for (const r of existing) {
    if (r.origin !== "meter" || byDay.has(dayMs(r.date))) continue;
    if (r.usedInCalculationId) {
      summary.releasedSkipped++;
      continue;
    }
    if (r.otherKwh !== null && r.otherOrigin === "monthly_upload") {
      await db.meterReading.update({
        where: { id: r.id },
        data: {
          kWh: r.otherKwh,
          origin: "monthly_upload",
          meterId: null,
          ...(r.otherRawFileId ? { rawFileId: r.otherRawFileId } : {}),
          otherKwh: null,
          otherOrigin: null,
          otherRawFileId: null,
          dataHours: null,
        },
      });
    } else {
      await db.meterReading.delete({ where: { id: r.id } });
    }
    summary.removed++;
  }

  logger.info("monitoring.projected", { circuitId, actorId, ...summary });
  return summary;
}
