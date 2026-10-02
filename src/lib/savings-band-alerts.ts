import { db } from "@/lib/db";
import { circuitMonitoringStart } from "@/lib/monitoring-projection";
import { logger } from "@/lib/logger";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { EXCLUSION_DEVICE_SELECT, exclusionFromDevices, periodSavingsSummary } from "@/lib/circuit-load";
import { evaluateCompliance } from "@/lib/monthly-calculation";
import { circuitLabelOf } from "@/lib/meter-view";

/**
 * CON-01a's band, watched continuously rather than only at billing time.
 *
 * The rule is the one billing already uses (`evaluateCompliance`), so a
 * circuit cannot be "fine" here and out of band on the invoice: measured
 * savings minus the agreed benchmark, out of band when short by more than
 * the contract's own tolerance. Deliberately ASYMMETRIC — beating the
 * benchmark is never a complaint, which is why the user's "± band" is only
 * ever enforced downwards.
 *
 * One alert per circuit for as long as the condition lasts. Acknowledging
 * takes it off the badge; if it is STILL out of band after the cool-off, the
 * same alert returns rather than a second row being written — a continuing
 * problem is one problem, and duplicating it per reminder makes the history
 * unreadable.
 */

/**
 * How long an acknowledgement holds. A day, because the figure it is about
 * is a period average that cannot meaningfully move within an hour — re-arming
 * on the next hourly sweep would make acknowledging pointless.
 */
export const REARM_AFTER_MS = 24 * 60 * 60 * 1000;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start of the IST calendar month `monthsAgo` months before `now`, as the
 *  UTC-midnight instant a stored reading's own calendar-day label uses. */
function istMonthStart(now: Date, monthsAgo: number): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - monthsAgo, 1));
}

/**
 * Which of a circuit's readings the band is judged over (2026-10-02,
 * user-caught) — the current IST calendar month so far, matching the
 * granularity billing itself uses, not every day since monitoring began.
 * Averaging the whole history let a real 14-day anomaly (one circuit
 * drawing 5x its usual load) vanish into seven months of good performance,
 * while that same month's own invoice measured 24.7% against a 67%
 * benchmark — exactly the "fine here, out of band on the invoice"
 * contradiction this module's own doc comment rules out. Falls back to the
 * month just elapsed while a new one is still too young to have a reading
 * of its own, so the band is never judged on zero days.
 */
export function bandWindowReadings<T extends { date: Date }>(readings: T[], now: Date, monitoringStart: Date): T[] {
  const monthStart = new Date(Math.max(istMonthStart(now, 0).getTime(), monitoringStart.getTime()));
  const current = readings.filter((r) => r.date.getTime() >= monthStart.getTime());
  if (current.length > 0) return current;
  const prevStart = new Date(Math.max(istMonthStart(now, 1).getTime(), monitoringStart.getTime()));
  return readings.filter((r) => r.date.getTime() >= prevStart.getTime() && r.date.getTime() < monthStart.getTime());
}

export type BandVerdict =
  | { state: "unknown"; reason: string }
  | { state: "in_band"; measuredPct: number; benchmarkPct: number; tolerancePct: number }
  | {
      state: "out_of_band";
      measuredPct: number;
      benchmarkPct: number;
      tolerancePct: number;
      deviationPct: number;
      days: number;
      message: string;
    };

/** Where a circuit stands against its contracted band, right now. */
export async function evaluateCircuitBand(circuitId: string): Promise<BandVerdict> {
  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      voidedAt: true,
      location: true,
      lightType: true,
      preInstallBaseline: true,
      benchmarkSavingsPct: true,
      rescaleEvents: true,
      devices: { select: EXCLUSION_DEVICE_SELECT },
      society: { select: { name: true } },
      meterReadings: { where: { source: "csv" }, orderBy: { date: "asc" } },
      siteSurvey: {
        select: {
          pipeline: {
            select: {
              contract: {
                select: {
                  versions: { orderBy: { effectiveFrom: "desc" }, take: 1, select: { tolerancePct: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!circuit || circuit.voidedAt) return { state: "unknown", reason: "the circuit no longer exists" };
  if (circuit.benchmarkSavingsPct === null) {
    return { state: "unknown", reason: "no benchmark is confirmed yet" };
  }
  const tolerancePct = circuit.siteSurvey?.pipeline?.contract?.versions[0]?.tolerancePct;
  if (tolerancePct === undefined) {
    // Stated, never assumed. A default band would invent a commercial term
    // nobody agreed to, and this alert is about a contractual shortfall.
    return { state: "unknown", reason: "no contract term version records a tolerance" };
  }
  // Monitoring days only, from the billing start (2026-09-26): the demo's
  // days live on the demo, and the band is a contractual judgement.
  const start = await circuitMonitoringStart(circuitId);
  if (!start) return { state: "unknown", reason: "billing has not started for this circuit" };

  const now = new Date();
  const days = bandWindowReadings(circuit.meterReadings, now, start);
  // Each day against the baseline in force that day, not "now" applied
  // across the window — a rescale landing mid-month must not retroactively
  // move days measured before it (2026-10-02, user-caught).
  const summary = periodSavingsSummary(
    (d) => effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, d),
    days.map((d) => ({ date: d.date, kWh: d.kWh, excluded: d.excludedAt !== null })),
    exclusionFromDevices(circuit.devices, "monitoring"),
  );
  if (summary.savingsPct === null) return { state: "unknown", reason: "no days have been recorded yet" };

  const { deviationPct, complianceResult } = evaluateCompliance({
    measuredSavingsPct: summary.savingsPct,
    benchmarkSavingsPct: circuit.benchmarkSavingsPct,
    tolerancePct,
  });
  const common = {
    measuredPct: summary.savingsPct,
    benchmarkPct: circuit.benchmarkSavingsPct,
    tolerancePct,
  };
  if (complianceResult === "in_band") return { state: "in_band", ...common };

  const label = circuitLabelOf(circuit.location, circuit.lightType);
  return {
    state: "out_of_band",
    ...common,
    deviationPct,
    days: days.filter((d) => d.excludedAt === null).length,
    message:
      `${circuit.society.name} · ${label} is measuring ${summary.savingsPct.toFixed(1)}% savings this month ` +
      `against an agreed ${circuit.benchmarkSavingsPct.toFixed(1)}% — ${Math.abs(deviationPct).toFixed(1)} points short, ` +
      `beyond the contract's ±${tolerancePct}% tolerance.`,
  };
}

export type BandSyncResult = { opened: boolean; rearmed: boolean; closed: boolean };

/**
 * Bring the circuit's alert in line with where it actually stands. Safe to
 * call as often as you like: it opens, re-arms or closes at most one alert.
 */
export async function syncCircuitBandAlert(circuitId: string, now = new Date()): Promise<BandSyncResult> {
  const verdict = await evaluateCircuitBand(circuitId);
  const open = await db.meterAlert.findFirst({
    where: { circuitId, kind: "savings_out_of_band", closedAt: null },
    select: { id: true, acknowledgedAt: true, raiseCount: true },
  });

  if (verdict.state === "out_of_band") {
    if (!open) {
      try {
        await db.meterAlert.create({
          data: {
            circuitId,
            kind: "savings_out_of_band",
            message: verdict.message,
            detail: {
              measuredPct: verdict.measuredPct,
              benchmarkPct: verdict.benchmarkPct,
              tolerancePct: verdict.tolerancePct,
              deviationPct: verdict.deviationPct,
              days: verdict.days,
            },
          },
        });
        logger.warn("circuit.savings_out_of_band", { circuitId, ...verdict });
        return { opened: true, rearmed: false, closed: false };
      } catch (err) {
        // The partial index won the race — an alert already stands.
        if (isUniqueViolation(err)) return { opened: false, rearmed: false, closed: false };
        throw err;
      }
    }
    // Still out of band, and somebody acknowledged it a while ago: bring it
    // back rather than letting a real shortfall sit silently acknowledged.
    if (open.acknowledgedAt && now.getTime() - open.acknowledgedAt.getTime() >= REARM_AFTER_MS) {
      await db.meterAlert.update({
        where: { id: open.id },
        data: {
          acknowledgedAt: null,
          acknowledgedById: null,
          reraisedAt: now,
          raiseCount: open.raiseCount + 1,
          message: verdict.message,
        },
      });
      logger.warn("circuit.savings_out_of_band_rearmed", { circuitId, raiseCount: open.raiseCount + 1 });
      return { opened: false, rearmed: true, closed: false };
    }
    // Still out of band and still unacknowledged — keep the figures current
    // so the notification is not quoting a stale shortfall.
    if (!open.acknowledgedAt) {
      await db.meterAlert.update({ where: { id: open.id }, data: { message: verdict.message } });
    }
    return { opened: false, rearmed: false, closed: false };
  }

  if (verdict.state === "in_band" && open) {
    await db.meterAlert.updateMany({
      where: { id: open.id, closedAt: null },
      data: {
        closedAt: now,
        closedReason: `Back inside the band — measuring ${verdict.measuredPct.toFixed(1)}% against an agreed ${verdict.benchmarkPct.toFixed(1)}%.`,
      },
    });
    logger.info("circuit.savings_back_in_band", { circuitId, measuredPct: verdict.measuredPct });
    return { opened: false, rearmed: false, closed: true };
  }

  // `unknown` deliberately neither opens nor closes: not being able to judge
  // a circuit is not evidence that it is fine.
  return { opened: false, rearmed: false, closed: false };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
