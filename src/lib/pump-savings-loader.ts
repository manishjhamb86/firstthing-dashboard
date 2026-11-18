import { db } from "@/lib/db";
import { publicS3Url } from "@/lib/s3";
import {
  fillEveryDay,
  istYesterday,
  nowKwhPerKl,
  readAverage,
  savingsSummary,
  type ReadAverage,
  type ReadDay,
  type SavingsDay,
  type SavingsSummary,
} from "@/lib/pump-savings";

/**
 * The pump room's savings view — the one read the admin page, the portal
 * page and the dashboard card share, so the three can never disagree.
 * Null when the room has no live baseline: there is nothing to measure a
 * saving against, and the screens say so rather than showing a zero.
 */
export type PumpSavingsView = {
  baseline: {
    id: string;
    kwhPerKl: number;
    periodFrom: Date;
    periodTo: Date;
    kwh: number;
    kl: number;
    savingsFrom: Date;
    recordedAt: Date;
    note: string | null;
    sourceDocument: { id: string; fileName: string; docType: string; period: string; href: string } | null;
  };
  /** ₹ per kWh from the society record; null means every ₹ figure is stated as missing. */
  tariff: number | null;
  /** YYYY-MM-DD, India's wall-clock yesterday — the last day on the list. */
  yesterday: string;
  /** Every calendar day from savingsFrom to yesterday, oldest first; [] until a first day is read. */
  days: SavingsDay[];
  summary: SavingsSummary;
  readDays: number;
  readAverage: ReadAverage | null;
  now: { kwhPerKl: number; days: number; from: string } | null;
};

export async function loadPumpSavings(meterId: string, now: Date = new Date()): Promise<PumpSavingsView | null> {
  const meter = await db.emsPumpMeter.findUnique({
    where: { id: meterId },
    select: {
      society: { select: { electricityUnitRate: true } },
      baselines: {
        where: { supersededAt: null },
        orderBy: { recordedAt: "desc" },
        take: 1,
        include: { sourceDocument: { select: { id: true, fileName: true, docType: true, period: true, s3Key: true, voidedAt: true } } },
      },
    },
  });
  const baseline = meter?.baselines[0];
  if (!meter || !baseline) return null;

  const yesterday = istYesterday(now);
  const readings = await db.emsPumpReading.findMany({
    where: { pumpMeterId: meterId, date: { gte: baseline.savingsFrom, lte: new Date(`${yesterday}T00:00:00Z`) } },
    orderBy: { date: "asc" },
    select: { date: true, dailyKwh: true, dailyKl: true, origin: true },
  });
  const readDays: ReadDay[] = readings.map((r) => ({ day: r.date.toISOString().slice(0, 10), kwh: r.dailyKwh, kl: r.dailyKl, spread: r.origin === "distributed" }));
  const tariff = meter.society?.electricityUnitRate ?? null;
  const from = baseline.savingsFrom.toISOString().slice(0, 10);
  const days = from <= yesterday ? fillEveryDay({ from, to: yesterday, readDays, baselineKwhPerKl: baseline.kwhPerKl }) : [];
  const doc = baseline.sourceDocument;

  return {
    baseline: {
      id: baseline.id,
      kwhPerKl: baseline.kwhPerKl,
      periodFrom: baseline.periodFrom,
      periodTo: baseline.periodTo,
      kwh: baseline.kwh,
      kl: baseline.kl,
      savingsFrom: baseline.savingsFrom,
      recordedAt: baseline.recordedAt,
      note: baseline.note,
      sourceDocument:
        doc && doc.voidedAt === null ? { id: doc.id, fileName: doc.fileName, docType: doc.docType, period: doc.period, href: publicS3Url(doc.s3Key) } : null,
    },
    tariff,
    yesterday,
    days,
    summary: savingsSummary(days, tariff),
    readDays: readDays.filter((d) => d.kwh !== null && d.kl !== null).length,
    readAverage: readAverage(readDays),
    now: nowKwhPerKl(readDays, yesterday),
  };
}

/** The society's single pump room's savings — the dashboard card's read (INV-05: scoped by the viewer's own societyId). */
export async function loadSocietyPumpSavings(societyId: string): Promise<(PumpSavingsView & { meterId: string; roomType: string | null }) | null> {
  const meter = await db.emsPumpMeter.findFirst({ where: { societyId }, orderBy: { assignedAt: "asc" }, select: { id: true, roomType: true } });
  if (!meter) return null;
  const view = await loadPumpSavings(meter.id);
  return view ? { ...view, meterId: meter.id, roomType: meter.roomType } : null;
}
