import type { CommissioningWindowType } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// FEAT-012/FEAT-014 — the two windows mirror each other exactly (per
// FEAT-014's own description), so the mechanism lives here once rather
// than being duplicated per window type. CON-19-style rule: 5 consecutive
// valid calendar days, the pivot day excluded, anomaly-triggered restart.
export const REQUIRED_VALID_DAYS = 5;

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function nextDayUTC(d: Date): Date {
  const s = startOfDayUTC(d);
  s.setUTCDate(s.getUTCDate() + 1);
  return s;
}

export async function getWindowProgress(circuitId: string, windowType: CommissioningWindowType, windowStartAt: Date | null) {
  if (!windowStartAt) return { validCount: 0, readings: [], pendingAnomaly: false };
  const readings = await db.commissioningReading.findMany({
    where: { circuitId, windowType, date: { gte: windowStartAt } },
    orderBy: { date: "asc" },
  });
  const validCount = readings.filter((r) => r.status === "valid").length;
  const pendingAnomaly = readings.some((r) => r.status === "anomaly");
  return { validCount, readings, pendingAnomaly };
}

// FEAT-012-AC-3/FEAT-014-AC-3 — a day's readings are simply missing (an
// absent row) rather than a third enum value; distinguished from an
// actively-flagged anomaly by presence, not a status field, per
// FEAT-012-AC-5.
export async function recordDailyReading(input: {
  circuitId: string;
  windowType: CommissioningWindowType;
  date: Date;
  recordedById: string;
  consumptionKwh?: number;
  anomalyNote?: string;
}) {
  const date = startOfDayUTC(input.date);
  const isAnomaly = input.consumptionKwh == null;

  await db.commissioningReading.upsert({
    where: { circuitId_windowType_date: { circuitId: input.circuitId, windowType: input.windowType, date } },
    create: {
      circuitId: input.circuitId,
      windowType: input.windowType,
      date,
      consumptionKwh: input.consumptionKwh ?? null,
      status: isAnomaly ? "anomaly" : "valid",
      anomalyNote: input.anomalyNote ?? null,
      recordedById: input.recordedById,
    },
    update: {
      consumptionKwh: input.consumptionKwh ?? null,
      status: isAnomaly ? "anomaly" : "valid",
      anomalyNote: input.anomalyNote ?? null,
      recordedById: input.recordedById,
    },
  });

  logger.info("commissioning.reading_recorded", {
    circuitId: input.circuitId,
    windowType: input.windowType,
    date,
    status: isAnomaly ? "anomaly" : "valid",
  });
}

// FEAT-012-AC-3 — restart takes effect the midnight *following* the fix,
// logged as a distinct event, not folded silently into the next reading.
export async function restartWindow(circuitId: string, windowType: CommissioningWindowType) {
  const restartFrom = nextDayUTC(new Date());
  logger.info("commissioning.window_restarted", { circuitId, windowType, restartFrom });
  return restartFrom;
}

export function averageOfFirstValid(readings: { status: string; consumptionKwh: number | null }[], count: number) {
  const valid = readings.filter((r) => r.status === "valid" && r.consumptionKwh != null).slice(0, count);
  const sum = valid.reduce((acc, r) => acc + (r.consumptionKwh ?? 0), 0);
  return sum / valid.length;
}
