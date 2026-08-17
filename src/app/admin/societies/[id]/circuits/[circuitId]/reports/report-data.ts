// CON-45 — the shared assembly behind all three consumption reports.
// Everything renders straight from the stored readings and the circuit's
// record, so the paper and the database can never disagree — the same
// property the agreement print route (FEAT-029) was built on.

import { db } from "@/lib/db";
import {
  classifyDay,
  periodSavingsSummary,
  savingsBand,
  savingsPct,
  theoreticalDailyKwh,
  varianceAgainstTheoretical,
  type SavingsBand,
  type VarianceBand,
} from "@/lib/circuit-load";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";

export type ReportDay = {
  date: string;
  kWh: number;
  intervalCount: number | null;
  expectedIntervals: number | null;
  excluded: boolean;
  excludedReason: string | null;
  variancePct: number | null;
  varianceBand: VarianceBand | null;
  savingsPct: number | null;
  savingsBand: SavingsBand | null;
};

export async function loadCircuitReport(circuitId: string) {
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    include: {
      society: true,
      devices: {
        orderBy: { createdAt: "asc" },
        include: {
          deviceType: { select: { name: true } },
          replacementType: { select: { name: true } },
        },
      },
      rescaleEvents: true,
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
    },
  });
  if (!circuit || !circuit.meterInstalledAt) return null;

  const theoretical = circuit.devices.length > 0 ? theoreticalDailyKwh(circuit.devices) : null;

  const toDay = (r: (typeof circuit.meterReadings)[number], phase: "pre" | "post"): ReportDay => {
    const excluded = r.excludedAt !== null;
    let variancePct: number | null = null;
    let vBand: VarianceBand | null = null;
    let sPct: number | null = null;
    let sBand: SavingsBand | null = null;
    if (phase === "pre" && theoretical !== null) {
      const v = varianceAgainstTheoretical(r.kWh, theoretical);
      variancePct = v.pct;
      vBand = v.band;
    } else if (phase === "post") {
      const b = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, r.date);
      sPct = b === null ? null : savingsPct(b, r.kWh);
      sBand = sPct === null ? null : savingsBand(sPct);
    }
    return {
      date: r.date.toISOString().slice(0, 10),
      kWh: r.kWh,
      intervalCount: r.intervalCount,
      expectedIntervals: r.expectedIntervals,
      excluded,
      excludedReason: r.excludedReason,
      variancePct,
      varianceBand: vBand,
      savingsPct: sPct,
      savingsBand: sBand,
    };
  };

  const preDays: ReportDay[] = [];
  const postDays: ReportDay[] = [];
  for (const r of circuit.meterReadings) {
    const phase = classifyDay(r.date, circuit.meterInstalledAt, circuit.lightReplacementDate);
    if (phase === "pre_install") preDays.push(toDay(r, "pre"));
    else if (phase === "post_install") postDays.push(toDay(r, "post"));
  }

  const preIncluded = preDays.filter((d) => !d.excluded);
  const preAverage =
    preIncluded.length > 0 ? preIncluded.reduce((s, d) => s + d.kWh, 0) / preIncluded.length : null;
  const avgVariance =
    preAverage !== null && theoretical !== null
      ? varianceAgainstTheoretical(preAverage, theoretical)
      : null;

  const effBaselineNow = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, new Date());

  return {
    circuit,
    society: circuit.society,
    theoretical,
    preDays,
    postDays,
    preAverage,
    preIncludedCount: preIncluded.length,
    avgVariance,
    effBaselineNow,
    inventory: circuit.devices.map((l) => ({
      id: l.id,
      name: l.deviceType.name,
      count: l.count,
      wattage: l.wattage,
      hoursPerDay: l.hoursPerDay,
      kWhPerDay: (l.count * l.wattage * l.hoursPerDay) / 1000,
      replacementName: l.replacementType?.name ?? null,
      replacementCount: l.replacementCount,
      replacementWattage: l.replacementWattage,
    })),
  };
}

/** The monitoring days of one explicitly-selected month (INV-04). */
export function monthDays(
  report: NonNullable<Awaited<ReturnType<typeof loadCircuitReport>>>,
  month: string,
): ReportDay[] {
  return report.postDays.filter((d) => d.date.startsWith(month));
}

export function monthsWithData(
  report: NonNullable<Awaited<ReturnType<typeof loadCircuitReport>>>,
): string[] {
  return [...new Set(report.postDays.map((d) => d.date.slice(0, 7)))].sort();
}

export function summarize(baseline: number | null, days: ReportDay[]) {
  return periodSavingsSummary(
    baseline,
    days.map((d) => ({ kWh: d.kWh, excluded: d.excluded })),
  );
}
