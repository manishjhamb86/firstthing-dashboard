import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { effectiveBaselineAt } from "@/lib/benchmark-rescale";
import { classifyDay, periodSavingsSummary } from "@/lib/circuit-load";
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
      meterInstalledAt: true,
      lightReplacementDate: true,
      preInstallBaseline: true,
      benchmarkSavingsPct: true,
      rescaleEvents: true,
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
  if (!circuit.meterInstalledAt || !circuit.lightReplacementDate) {
    return { state: "unknown", reason: "the circuit has no post-replacement period yet" };
  }

  const now = new Date();
  const days = circuit.meterReadings.filter(
    (r) => classifyDay(r.date, circuit.meterInstalledAt!, circuit.lightReplacementDate) === "post_install",
  );
  const baseline = effectiveBaselineAt(circuit.preInstallBaseline, circuit.rescaleEvents, now);
  const summary = periodSavingsSummary(
    baseline,
    days.map((d) => ({ kWh: d.kWh, excluded: d.excludedAt !== null })),
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
      `${circuit.society.name} · ${label} is measuring ${summary.savingsPct.toFixed(1)}% savings ` +
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
