import type { CommissioningReadingStatus, CommissioningWindowType } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { restartFromDate } from "@/lib/commissioning-anomaly";

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
  /**
   * Normally derived from whether a value was supplied — a day recorded
   * without a number is an anomaly by definition. An automatically-flagged
   * day passes "anomaly" explicitly *with* its reading: the number is the
   * evidence the flag rests on, and FEAT-015's review needs it. Every
   * aggregate below filters on status, so a stored anomaly value can never
   * reach a baseline or a benchmark.
   */
  status?: CommissioningReadingStatus;
}) {
  const date = startOfDayUTC(input.date);
  const isAnomaly = input.status ? input.status === "anomaly" : input.consumptionKwh == null;

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
//
// "The next midnight" is only the right boundary when every recorded day is
// in the past. A day dated ahead of today — a batch entered in advance, a
// back-office correction, or test data — would otherwise sit inside the
// restarted window, leaving the anomaly open and making the restart look
// like it did nothing at all. So the new start clears the last recorded day
// too (see restartFromDate).
export async function restartWindow(circuitId: string, windowType: CommissioningWindowType) {
  const latest = await db.commissioningReading.findFirst({
    where: { circuitId, windowType },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const restartFrom = restartFromDate(new Date(), latest?.date ?? null);
  logger.info("commissioning.window_restarted", {
    circuitId,
    windowType,
    restartFrom,
    latestReading: latest?.date ?? null,
  });
  return restartFrom;
}

export function averageOfFirstValid(readings: { status: string; consumptionKwh: number | null }[], count: number) {
  const valid = readings.filter((r) => r.status === "valid" && r.consumptionKwh != null).slice(0, count);
  const sum = valid.reduce((acc, r) => acc + (r.consumptionKwh ?? 0), 0);
  return sum / valid.length;
}

// Dashboard-only signal, not written anywhere — "how is this window
// trending today," distinct from the fixed value the completed window
// writes. Pre-install: how far the latest reading sits from the running
// average so far (a stability check before there's a benchmark to compare
// against). Post-install: the projected CON-10 savings % if the window
// completed with today's average, so ops can see the number moving toward
// (or away from) CON-20's 60-80% band before the 5th day lands.
export function averageOfValid(readings: { status: string; consumptionKwh: number | null }[]) {
  const valid = readings.filter((r) => r.status === "valid" && r.consumptionKwh != null);
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, r) => acc + (r.consumptionKwh ?? 0), 0);
  return sum / valid.length;
}

export function latestVarianceFromAveragePct(readings: { status: string; consumptionKwh: number | null; date: Date }[]) {
  const valid = readings.filter((r) => r.status === "valid" && r.consumptionKwh != null);
  if (valid.length === 0) return null;
  const latest = valid[valid.length - 1];
  const avg = averageOfValid(valid);
  if (avg == null || avg === 0 || latest.consumptionKwh == null) return null;
  return ((latest.consumptionKwh - avg) / avg) * 100;
}

// "Sheet upload" — a lightweight CSV parser for the commissioning-scoped
// manual readings upload, not FEAT-043's full CON-30 ingest pipeline (no
// raw-file retention, no AI normalization — deliberately out of scope,
// see PROJECT_CONTEXT.md). Deliberately simple: comma-separated, no
// quoted-field support, since the only content is a date and a number.
export type CsvReadingRow = { date: string; consumptionKwh?: number; anomalyNote?: string };

export function parseCommissioningCsv(text: string): CsvReadingRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const dateIdx = header.indexOf("date");
  const kwhIdx = header.indexOf("consumption_kwh");
  const noteIdx = header.indexOf("anomaly_note");
  if (dateIdx === -1 || kwhIdx === -1) return [];

  const rows = lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const date = cells[dateIdx];
      const kwhRaw = cells[kwhIdx];
      const note = noteIdx >= 0 ? cells[noteIdx] : undefined;
      return {
        date,
        consumptionKwh: kwhRaw ? Number(kwhRaw) : undefined,
        anomalyNote: note?.trim() || undefined,
      };
    })
    .filter((r) => r.date);

  // Chronological order matters downstream — anomaly-gating and window
  // completion are both evaluated row by row, so an out-of-order sheet
  // would silently misapply both.
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
