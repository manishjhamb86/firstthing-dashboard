import { cache } from "react";
import { db } from "@/lib/db";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { periodSavingsSummary, savingsBand, type SavingsBand } from "@/lib/circuit-load";
import { circuitLabelOf } from "@/lib/meter-view";

/**
 * The society's own electricity figures, assembled once per request for the
 * portal's dashboard and Electricity page (customer portal, 2026-08-29).
 *
 * Everything derives from the same store the back office reads — MeterReading
 * rows after each circuit's replacement date, judged against the baseline in
 * force on each day (INV-07 replay) — so the resident's screen and the
 * operator's can never disagree about a figure.
 *
 * Two provenance rules, both deliberate:
 *  · kWh figures are computed here from stored readings, exactly as the
 *    monthly report computes them.
 *  · ₹ figures are NEVER computed here. They come only from a RELEASED
 *    monthly calculation's fee lines (INV-02) — absent one, the screen says
 *    what will produce the figure instead of inventing a rate.
 *
 * "This month" is the month of the society's LATEST stored reading, not the
 * wall clock: readings arrive by monthly export, so the current calendar
 * month is usually empty, and a hero card that zeroes out on the 1st of
 * every month would read as an outage.
 */

export type PortalCircuit = {
  id: string;
  label: string;
  lightCount: number;
  /** Days recorded in the headline month (excluded days not counted). */
  monthDays: number;
  monthKwh: number | null;
  monthDailyAvg: number | null;
  savingsPct: number | null;
  band: SavingsBand | null;
  benchmarkPct: number | null;
  baselineNow: number | null;
};

export type PortalEnergy = {
  /** "2026-06" — the month every headline figure below describes. */
  month: string | null;
  circuits: PortalCircuit[];
  totals: {
    consumedKwh: number | null;
    avoidedKwh: number | null;
    savingsPct: number | null;
    band: SavingsBand | null;
  };
  /** The last 14 recorded days, society-wide, oldest first. */
  daily: { date: string; kWh: number }[];
  /** Σ of the baselines in force today, for the chart's "before" rule. */
  baselineDailySum: number | null;
  /** Released ₹ for the headline month — null means "not billed yet". */
  rupeesSaved: number | null;
};

export const societyEnergy = cache(async (societyId: string): Promise<PortalEnergy> => {
  const circuits = await db.circuit.findMany({
    where: { societyId, voidedAt: null, lightReplacementDate: { not: null } },
    select: {
      id: true,
      location: true,
      lightType: true,
      meteredLightCount: true,
      benchmarkSavingsPct: true,
      preInstallBaseline: true,
      lightReplacementDate: true,
      rescaleEvents: true,
      meterReadings: {
        // NO supersededAt filter: supersession updates the row IN PLACE, so
        // a non-null supersededAt is a corrected day whose kWh is current.
        // The filter this shipped with excluded corrected days from the
        // resident's own figures (caught 2026-08-31).
        where: { source: "csv" },
        orderBy: { date: "asc" },
        select: { date: true, kWh: true, excludedAt: true },
      },
    },
  });

  const today = new Date();
  type Day = { date: string; kWh: number; excluded: boolean };
  const perCircuit = circuits.map((c) => {
    const monitoring: Day[] = c.meterReadings
      .filter((r) => r.date > c.lightReplacementDate!)
      .map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        kWh: r.kWh,
        excluded: r.excludedAt !== null,
      }));
    const baselineNow = effectiveBaselineAt(c.preInstallBaseline, c.rescaleEvents, today);
    return { c, monitoring, baselineNow };
  });

  const latest = perCircuit
    .flatMap((p) => p.monitoring.map((d) => d.date))
    .sort()
    .at(-1);
  const month = latest ? latest.slice(0, 7) : null;

  let totalConsumed = 0;
  let totalBaseline = 0;
  let anyMonth = false;

  const rows: PortalCircuit[] = perCircuit.map(({ c, monitoring, baselineNow }) => {
    const monthDaysAll = month ? monitoring.filter((d) => d.date.startsWith(month)) : [];
    const s = periodSavingsSummary(baselineNow, monthDaysAll);
    const counted = monthDaysAll.filter((d) => !d.excluded).length;
    if (s.averageKwh !== null && baselineNow !== null && counted > 0) {
      anyMonth = true;
      totalConsumed += s.averageKwh * counted;
      totalBaseline += baselineNow * counted;
    }
    return {
      id: c.id,
      label: circuitLabelOf(c.location, c.lightType),
      lightCount: c.meteredLightCount,
      monthDays: counted,
      monthKwh: s.averageKwh !== null ? s.averageKwh * counted : null,
      monthDailyAvg: s.averageKwh,
      savingsPct: s.savingsPct,
      band: s.band,
      benchmarkPct: c.benchmarkSavingsPct,
      baselineNow,
    };
  });

  const totalPct = anyMonth && totalBaseline > 0 ? ((totalBaseline - totalConsumed) / totalBaseline) * 100 : null;

  // Society-wide daily series: sum each recorded day across circuits, take
  // the newest 14 recorded days.
  const byDate = new Map<string, number>();
  for (const p of perCircuit) {
    for (const d of p.monitoring) {
      if (d.excluded) continue;
      byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.kWh);
    }
  }
  const daily = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-14)
    .map(([date, kWh]) => ({ date, kWh }));

  const baselines = perCircuit.map((p) => p.baselineNow).filter((b): b is number => b !== null);
  const baselineDailySum = baselines.length === perCircuit.length && baselines.length > 0
    ? baselines.reduce((s, b) => s + b, 0)
    : null;

  // ₹ — released fee lines only (INV-02). The society's share of the saving
  // is the whole commercial story, but this portal repeats a billed figure,
  // never derives one.
  let rupeesSaved: number | null = null;
  if (month) {
    const fees = await db.circuitFeeLine.findMany({
      where: {
        circuit: { societyId },
        calculation: { period: month, releasedAt: { not: null } },
      },
      select: { savedValue: true },
    });
    if (fees.length > 0) rupeesSaved = fees.reduce((s, f) => s + f.savedValue, 0);
  }

  return {
    month,
    circuits: rows,
    totals: {
      consumedKwh: anyMonth ? totalConsumed : null,
      avoidedKwh: anyMonth ? totalBaseline - totalConsumed : null,
      savingsPct: totalPct,
      band: totalPct !== null ? savingsBand(totalPct) : null,
    },
    daily,
    baselineDailySum,
    rupeesSaved,
  };
});
