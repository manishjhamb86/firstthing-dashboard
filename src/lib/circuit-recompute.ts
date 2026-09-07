import { db } from "@/lib/db";
import { addDays, classifyDay } from "@/lib/circuit-load";
import { baselineAverage, baselineUnsettled, periodSavingsSummary } from "@/lib/circuit-load";
import { BENCHMARK_MAX_PCT, BENCHMARK_MIN_PCT } from "@/lib/commissioning-anomaly";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";

/**
 * Re-derive a circuit's baseline and benchmark from the readings it holds and
 * the dates in force.
 *
 * Lifted out of `reading-actions.ts` (2026-09-08) because a SECOND caller
 * needed it and a "use server" file cannot safely export a shared internal:
 * correcting the meter install date changes which days count as pre-install,
 * so the baseline computed from the old split is evidence for a division that
 * no longer exists. Leaving it produced Indosam Arcade's 0.0% savings — seven
 * days generated as pre-install days, then reclassified as post-install by a
 * date correction, and measured against a baseline derived from themselves.
 * Same rule this repo has recorded twice: a figure derived from a set of rows
 * has to be re-derived when the set changes.
 */
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export async function recomputeCircuitFigures(
  tx: Tx,
  circuitId: string,
): Promise<{ baseline: number | null; benchmark: { pct: number; inBand: boolean } | null }> {
  const circuit = await tx.circuit.findUnique({
    where: { id: circuitId },
    include: {
      rescaleEvents: true,
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
    },
  });
  if (!circuit || !circuit.meterInstalledAt) return { baseline: null, benchmark: null };

  const phases = circuit.meterReadings.map((r) => ({
    r,
    phase: classifyDay(r.date, circuit.meterInstalledAt!, circuit.lightReplacementDate),
  }));

  let baseline = circuit.preInstallBaseline;
  const updates: Record<string, unknown> = {};

  // Baseline: recomputed while unfrozen.
  //
  // Unfrozen means "not yet settled", which is ALMOST the same as "the lights
  // are not in yet" — and was written as the latter until a society that
  // predates the system walked through here (Ace City, 2026-08-26). A
  // backfill records both dates from its demo report before any reading
  // exists, so the freeze fired before there was anything to freeze: the
  // pre-install days imported, and the baseline stayed null forever, taking
  // the benchmark with it. The freeze still holds for every circuit
  // commissioned through the live flow, where the baseline is always settled
  // before the replacement is recorded.
  if (baselineUnsettled(circuit)) {
    const preDays = phases
      .filter((p) => p.phase === "pre_install")
      .map((p) => ({ date: p.r.date, kWh: p.r.kWh, excluded: p.r.excludedAt !== null }));
    baseline = baselineAverage(preDays);
    updates.preInstallBaseline = baseline;
    if (circuit.preInstallWindowStartAt === null && preDays.length > 0) {
      updates.preInstallWindowStartAt = addDays(circuit.meterInstalledAt, 1);
    }
    if (baseline !== null && (circuit.state === "meter_installed" || circuit.state === "pre_install_monitoring")) {
      updates.state = "awaiting_installation";
    } else if (baseline === null && circuit.state === "meter_installed" && preDays.length > 0) {
      updates.state = "pre_install_monitoring";
    }
  }

  // Benchmark: decided while unconfirmed and post days exist.
  let benchmark: { pct: number; inBand: boolean } | null = null;
  if (circuit.lightReplacementDate !== null && circuit.benchmarkSavingsPct === null) {
    const postDays = phases
      .filter((p) => p.phase === "post_install")
      .map((p) => ({ kWh: p.r.kWh, excluded: p.r.excludedAt !== null, date: p.r.date }));
    const live = postDays.filter((d) => !d.excluded);
    if (live.length > 0) {
      const lastDate = live[live.length - 1].date;
      const effBaseline = effectiveBaselineAt(baseline, circuit.rescaleEvents, lastDate);
      const summary = periodSavingsSummary(effBaseline, live);
      if (summary.savingsPct !== null && summary.averageKwh !== null && effBaseline !== null) {
        const pct = summary.savingsPct;
        const inBand = pct >= BENCHMARK_MIN_PCT && pct <= BENCHMARK_MAX_PCT;
        benchmark = { pct, inBand };
        updates.postInstallBaseline = summary.averageKwh;
        if (circuit.postInstallWindowStartAt === null) {
          updates.postInstallWindowStartAt = addDays(circuit.lightReplacementDate, 1);
        }
        if (inBand) {
          // FEAT-014's semantics kept: the benchmark is a system computation.
          updates.benchmarkSavingsPct = pct;
          updates.state = "benchmark_confirmed";
          // An out-of-band review raised earlier has had its question
          // answered: the measurement came back inside CON-20's band. Left
          // open it kept the circuit at the top of the monitoring queue
          // reading "Awaiting review · 43.3% measured" while its own page
          // said "Benchmark confirmed 68.0%" (user-reported 2026-08-20).
          // Resolved, not deleted — the review and its original figure stay
          // on record, which is the whole point of raising one.
          await tx.demoResultReview.updateMany({
            where: { circuitId: circuit.id, state: "open" },
            data: {
              state: "resolved",
              resolution: "rerun_window",
              resolutionNote: `Superseded by a re-measured result of ${pct.toFixed(
                2,
              )}%, inside CON-20's ${BENCHMARK_MIN_PCT}–${BENCHMARK_MAX_PCT}% band. Closed by the system when the benchmark confirmed.`,
              resolvedAt: new Date(),
            },
          });
        } else {
          // Outside CON-20's band no benchmark is written; the existing
          // FEAT-015 review queue takes over — same escalation the window
          // flow used, raised from the same computation.
          if (circuit.state !== "benchmark_review") {
            updates.state = "benchmark_review";
            const occurrence =
              (await tx.demoResultReview.count({ where: { circuitId: circuit.id } })) + 1;
            await tx.demoResultReview.create({
              data: {
                circuitId: circuit.id,
                occurrence,
                measuredSavingsPct: pct,
                preInstallBaseline: effBaseline,
                postInstallAverage: summary.averageKwh,
              },
            });
          }
        }
      }
    } else if (circuit.state === "post_install_pending") {
      updates.state = "post_install_monitoring";
    }
    if (live.length > 0 && circuit.state === "post_install_pending" && !updates.state) {
      updates.state = "post_install_monitoring";
    }
  }

  if (Object.keys(updates).length > 0) {
    await tx.circuit.update({ where: { id: circuit.id }, data: updates });
  }
  return { baseline, benchmark };
}
