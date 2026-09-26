// CON-45 — the shared assembly behind all three consumption reports.
// Everything renders straight from the stored readings and the circuit's
// record, so the paper and the database can never disagree — the same
// property the agreement print route (FEAT-029) was built on.

import { db } from "@/lib/db";
import { currentDemoOf } from "@/lib/circuit-figures";
import { circuitMonitoringStart } from "@/lib/monitoring-projection";
import {
  periodSavingsSummary,
  savingsBand,
  savingsPct,
  exclusionFromDevices,
  type Exclusion,
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

export type CircuitFeeLineForMonth = {
  savedValue: number;
  amount: number;
  societyNet: number;
};

/**
 * The rupee figure for one circuit's one month — read ONLY from a RELEASED
 * calculation's own fee line, never computed here (user-asked 2026-09-24:
 * "in savings report we need to show amount... how amount is saved" — this
 * report is kWh-only by design, per the standing INV-02 rule already stated
 * at its own foot: two independently-computed money figures for one month
 * is how they end up disagreeing). A `superseded` version's status is no
 * longer `released`, so this can never read a stale re-derivation. Null for
 * a month that has not been released yet — the report says so rather than
 * inventing a rate.
 */
export async function circuitFeeLineFor(circuitId: string, period: string): Promise<CircuitFeeLineForMonth | null> {
  const line = await db.circuitFeeLine.findFirst({
    where: { circuitId, calculation: { period, status: "released" } },
    select: { savedValue: true, amount: true },
  });
  if (!line) return null;
  return { savedValue: line.savedValue, amount: line.amount, societyNet: line.savedValue - line.amount };
}

/**
 * One circuit's reports (2026-09-26). The pre- and post-installation reports
 * are a DEMO's — its own days inside its own periods, nothing before, between
 * or after — and `demoId` picks which demo (default: the current one). The
 * monthly report reads the monitoring rows, from the billing start.
 */
export async function loadCircuitReport(circuitId: string, demoId?: string | null) {
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
      // NO supersededAt filter, deliberately: supersession is an in-place
      // UPDATE (one row per date; supersededValue keeps what was replaced),
      // so a non-null supersededAt marks a CORRECTED day whose kWh is the
      // value in force.
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
      demos: {
        where: { voidedAt: null },
        orderBy: { sequence: "asc" },
        include: { readings: { orderBy: { date: "asc" } } },
      },
    },
  });
  if (!circuit) return null;

  const demo =
    (demoId ? circuit.demos.find((d) => d.id === demoId) : null) ?? currentDemoOf(circuit.demos) ?? null;
  const theoretical = circuit.devices.length > 0 ? theoreticalDailyKwh(circuit.devices) : null;
  // Fixtures left on the circuit unreplaced: their draw comes off both the
  // before and after figures before any saving is stated (2026-09-26).
  const exclusion = exclusionFromDevices(circuit.devices);

  type Row = {
    date: Date;
    kWh: number;
    excludedAt: Date | null;
    excludedReason: string | null;
    intervalCount?: number | null;
    hoursCovered?: number | null;
    expectedIntervals?: number | null;
  };
  const toDay = (r: Row, phase: "pre" | "post", baselineFor: (d: Date) => number | null): ReportDay => {
    let variancePct: number | null = null;
    let vBand: VarianceBand | null = null;
    let sPct: number | null = null;
    let sBand: SavingsBand | null = null;
    if (phase === "pre" && theoretical !== null) {
      const v = varianceAgainstTheoretical(r.kWh, theoretical);
      variancePct = v.pct;
      vBand = v.band;
    } else if (phase === "post") {
      const b = baselineFor(r.date);
      sPct = b === null ? null : savingsPct(b, r.kWh, exclusion);
      sBand = sPct === null ? null : savingsBand(sPct);
    }
    return {
      date: r.date.toISOString().slice(0, 10),
      kWh: r.kWh,
      intervalCount: r.intervalCount ?? r.hoursCovered ?? null,
      expectedIntervals: r.expectedIntervals ?? (r.hoursCovered != null ? 24 : null),
      excluded: r.excludedAt !== null,
      excludedReason: r.excludedReason,
      variancePct,
      varianceBand: vBand,
      savingsPct: sPct,
      savingsBand: sBand,
    };
  };

  // The demo's own days — only its own periods' rows live on it.
  const preRows = demo ? demo.readings.filter((r) => r.phase === "pre") : [];
  const preDays = preRows.map((r) => toDay(r, "pre", () => null));
  const preIncluded = preDays.filter((d) => !d.excluded);
  const preAverage =
    preIncluded.length > 0 ? preIncluded.reduce((s, d) => s + d.kWh, 0) / preIncluded.length : null;
  const demoBaseline = demo?.preInstallBaseline ?? preAverage;
  const demoPostDays = demo
    ? demo.readings.filter((r) => r.phase === "post").map((r) => toDay(r, "post", () => demoBaseline))
    : [];

  // Monitoring days, from the billing start (when one is known).
  const monitoringStart = await circuitMonitoringStart(circuitId);
  const postDays = circuit.meterReadings
    .filter((r) => monitoringStart === null || r.date.getTime() >= monitoringStart.getTime())
    .map((r) =>
      toDay(r, "post", (d) => effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, d)),
    );

  const avgVariance =
    preAverage !== null && theoretical !== null ? varianceAgainstTheoretical(preAverage, theoretical) : null;
  const effBaselineNow = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, new Date());

  return {
    circuit,
    society: circuit.society,
    demo,
    demos: circuit.demos.map((d) => ({ id: d.id, sequence: d.sequence, rejected: d.rejected })),
    theoretical,
    preDays,
    postDays,
    demoPostDays,
    demoBaseline,
    demoWindows: {
      pre: demo?.preFrom && demo.preTo ? { from: demo.preFrom, to: demo.preTo } : null,
      post: demo?.postFrom && demo.postTo ? { from: demo.postFrom, to: demo.postTo } : null,
    },
    preAverage,
    preIncludedCount: preIncluded.length,
    avgVariance,
    effBaselineNow,
    exclusion,
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
      excluded: l.excludedFromCalculation,
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

export function summarize(baseline: number | null, days: ReportDay[], ex?: Exclusion) {
  return periodSavingsSummary(
    baseline,
    days.map((d) => ({ kWh: d.kWh, excluded: d.excluded })),
    ex,
  );
}

/**
 * Everything the monthly savings report shows, as plain data — so the SAME
 * sheet renders live for the operator and from a frozen, published copy for
 * the society (user-asked 2026-09-24: publish the report to the customer's
 * Documents tab). A published report is this object stored at the moment of
 * publishing; later reading corrections produce a new version rather than
 * silently changing what the society was shown (ADR-005).
 */
export type SavingsReportSnapshot = {
  societyName: string;
  societyLocation: string;
  circuitLabel: string;
  meteredLightCount: number;
  representedLightCount: number;
  benchmarkSavingsPct: number | null;
  month: string;
  baselineKwhPerDay: number | null;
  days: ReportDay[];
  summary: ReturnType<typeof summarize>;
  fee: CircuitFeeLineForMonth | null;
  generatedAt: string;
};

export async function buildMonthlySnapshot(
  report: NonNullable<Awaited<ReturnType<typeof loadCircuitReport>>>,
  month: string,
): Promise<SavingsReportSnapshot> {
  const days = monthDays(report, month);
  return {
    societyName: report.society.name,
    societyLocation: report.society.location,
    circuitLabel: report.circuit.location || report.circuit.lightType,
    meteredLightCount: report.circuit.meteredLightCount,
    representedLightCount: report.circuit.representedLightCount,
    benchmarkSavingsPct: report.circuit.benchmarkSavingsPct,
    month,
    baselineKwhPerDay: report.effBaselineNow,
    days,
    summary: summarize(report.effBaselineNow, days, report.exclusion),
    fee: await circuitFeeLineFor(report.circuit.id, month),
    generatedAt: new Date().toISOString(),
  };
}

/** Two snapshots say the same thing — the generated stamp aside. */
export function sameSnapshot(a: SavingsReportSnapshot, b: SavingsReportSnapshot): boolean {
  const strip = (s: SavingsReportSnapshot) => JSON.stringify({ ...s, generatedAt: "" });
  return strip(a) === strip(b);
}
