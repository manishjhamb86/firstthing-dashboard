"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireOps } from "./ops";
import { coverageOf, COVERAGE_FLOOR_DAYS } from "@/lib/reading-coverage";

const PATH = "/admin/readings/anomalies";

async function coverageFor(circuitId: string, period: string) {
  const readings = await db.meterReading.findMany({
    where: { circuitId, date: { gte: startOf(period), lt: startOfNext(period) } },
    select: { date: true, kWh: true, excludedAt: true },
  });
  return coverageOf(
    readings.map((r) => ({ date: r.date, kWh: r.kWh, excluded: r.excludedAt !== null })),
    period,
  );
}

function startOf(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
function startOfNext(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1));
}

/** SCR-081 "Accept as real" — the readings stand, and why is recorded. */
export async function acceptAnomaly(anomalyId: string, reason: string) {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };
  if (!reason.trim()) return { error: "Why are these readings correct? A reason is required." };

  const anomaly = await db.readingAnomaly.findUnique({ where: { id: anomalyId } });
  if (!anomaly) return { error: "That flag is no longer open." };
  if (anomaly.status !== "open") return { error: "That flag has already been resolved." };

  await db.readingAnomaly.update({
    where: { id: anomalyId },
    data: {
      status: "accepted",
      resolutionReason: reason.trim(),
      resolvedById: ops.session.user.id,
      resolvedAt: new Date(),
    },
  });
  logger.info("ingest.anomaly_accepted", {
    actorId: ops.session.user.id,
    anomalyId,
    kind: anomaly.kind,
    reason: reason.trim(),
  });
  revalidatePath(PATH);
  return { ok: true as const };
}

/**
 * SCR-081 "Exclude days" — the day comes out of the calculation and is
 * **never interpolated** (FLOW-09 step 7). Coverage recomputes as a result,
 * and if that drops the month below CON-12's floor the caller is told so
 * explicitly rather than discovering it at billing time.
 */
export async function excludeAnomalyDay(anomalyId: string, reason: string) {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };
  if (!reason.trim()) return { error: "Say why this day is being excluded." };

  const anomaly = await db.readingAnomaly.findUnique({ where: { id: anomalyId } });
  if (!anomaly) return { error: "That flag is no longer open." };
  if (anomaly.status !== "open") return { error: "That flag has already been resolved." };
  if (!anomaly.date) {
    return { error: "This finding is about the month as a whole — there is no single day to exclude." };
  }

  const reading = await db.meterReading.findFirst({
    where: { circuitId: anomaly.circuitId, date: anomaly.date, source: "csv" },
  });
  if (reading?.usedInCalculationId) {
    return { error: "That day has already been billed and can't be excluded now." };
  }

  await db.$transaction(async (tx) => {
    if (reading) {
      await tx.meterReading.update({
        where: { id: reading.id },
        data: {
          validityFlag: false,
          excludedAt: new Date(),
          excludedById: ops.session.user.id,
          excludedReason: reason.trim(),
        },
      });
    }
    await tx.readingAnomaly.update({
      where: { id: anomalyId },
      data: {
        status: "excluded",
        resolutionReason: reason.trim(),
        resolvedById: ops.session.user.id,
        resolvedAt: new Date(),
      },
    });
  });

  const coverage = await coverageFor(anomaly.circuitId, anomaly.period);
  logger.info("ingest.day_excluded", {
    actorId: ops.session.user.id,
    anomalyId,
    circuitId: anomaly.circuitId,
    period: anomaly.period,
    coverageDays: coverage.coverageDays,
    belowFloor: coverage.belowFloor,
  });
  revalidatePath(PATH);
  return {
    ok: true as const,
    coverage,
    warning: coverage.belowFloor
      ? `Coverage is now ${coverage.coverageDays} of ${coverage.daysInMonth} days, below the ${COVERAGE_FLOOR_DAYS}-day floor. This month is unusable unless it is explicitly accepted.`
      : null,
  };
}

/**
 * SCR-081 "Send back" — the file was wrong, not the meter.
 *
 * Deliberately still blocks billing. A sent-back flag means a corrected
 * upload is owed; if it stopped blocking, "we asked for a better file" and
 * "the month is fine" would look identical to the month-close gate.
 */
export async function sendBackAnomaly(anomalyId: string, reason: string) {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };
  if (!reason.trim()) return { error: "Say what needs re-uploading." };

  const anomaly = await db.readingAnomaly.findUnique({ where: { id: anomalyId } });
  if (!anomaly) return { error: "That flag is no longer open." };
  if (anomaly.status !== "open") return { error: "That flag has already been resolved." };

  await db.readingAnomaly.update({
    where: { id: anomalyId },
    data: {
      status: "sent_back",
      resolutionReason: reason.trim(),
      resolvedById: ops.session.user.id,
      resolvedAt: new Date(),
    },
  });
  logger.info("ingest.anomaly_sent_back", { actorId: ops.session.user.id, anomalyId, reason: reason.trim() });
  revalidatePath(PATH);
  return { ok: true as const };
}

/**
 * SCR-081 "Resolve all clean" — bulk-resolves **only** informational flags.
 * Blocking flags are never bulk-resolvable, which is the whole reason this
 * action filters on `blocksBilling` server-side rather than trusting a list
 * of ids from the client.
 */
export async function resolveInformational(circuitId: string, period: string) {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };

  const result = await db.readingAnomaly.updateMany({
    where: { circuitId, period, status: "open", blocksBilling: false },
    data: {
      status: "accepted",
      resolutionReason: "Bulk-resolved: informational only.",
      resolvedById: ops.session.user.id,
      resolvedAt: new Date(),
    },
  });
  logger.info("ingest.informational_bulk_resolved", {
    actorId: ops.session.user.id,
    circuitId,
    period,
    count: result.count,
  });
  revalidatePath(PATH);
  return { ok: true as const, count: result.count };
}

/**
 * FEAT-046-AC-5 / CON-12 — accepting a month that is below the coverage floor.
 *
 * The system will not compute a billing-grade comparison from it unprompted;
 * this is the prompt. It is a recorded act with an owner and a reason, one row
 * per circuit-month, because "we billed on 14 days of data" is exactly the
 * kind of decision a society is entitled to see the reasoning for.
 */
export async function acceptLowCoverage(circuitId: string, period: string, reason: string) {
  const ops = await requireOps();
  if (!ops.ok) return { error: ops.error };
  if (!reason.trim()) return { error: "Record why this month can be billed on partial data." };

  const coverage = await coverageFor(circuitId, period);
  if (!coverage.belowFloor) {
    return {
      error: `Coverage is ${coverage.coverageDays} of ${coverage.daysInMonth} days, which is above the floor — there is nothing to accept.`,
    };
  }

  await db.coverageAcceptance.upsert({
    where: { circuitId_period: { circuitId, period } },
    create: {
      circuitId,
      period,
      coverageDays: coverage.coverageDays,
      daysInMonth: coverage.daysInMonth,
      reason: reason.trim(),
      acceptedById: ops.session.user.id,
    },
    update: {
      coverageDays: coverage.coverageDays,
      daysInMonth: coverage.daysInMonth,
      reason: reason.trim(),
      acceptedById: ops.session.user.id,
      acceptedAt: new Date(),
    },
  });

  logger.info("ingest.low_coverage_accepted", {
    actorId: ops.session.user.id,
    circuitId,
    period,
    coverageDays: coverage.coverageDays,
    daysInMonth: coverage.daysInMonth,
    reason: reason.trim(),
  });
  revalidatePath(PATH);
  return { ok: true as const };
}
