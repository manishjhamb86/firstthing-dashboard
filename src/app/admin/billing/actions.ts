"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, ServiceLine } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { effectiveBaselineAt, effectiveLightCountAt } from "@/lib/benchmark-rescale";
import { COVERAGE_FLOOR_DAYS } from "@/lib/reading-coverage";
import { daysInPeriod } from "@/lib/reading-normalize";
import { calculateMonth, type CircuitMonthReadings, type CircuitTerms } from "@/lib/monthly-calculation";
import { requireBillingOps } from "./access";

const PATH = "/admin/billing";

export type RunOutcome =
  | { error: string }
  | { held: { reason: string; calculationId: string } }
  | { calculated: { calculationId: string; total: number; outOfBand: number; version: number } };

/** The period's UTC bounds. Every calendar day in this schema is UTC midnight. */
function periodBounds(period: string): { from: Date; to: Date } {
  const [y, m] = period.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * FEAT-048 — the month's calculation.
 *
 * Automatic in CON-33's sense: it is not a judgment call, and nothing here
 * accepts a figure from a human. What this action does is *trigger* a
 * deterministic run — every number comes from `monthly-calculation.ts`, which
 * is pure and separately tested. FEAT-048-AC-4's "figures cannot be
 * hand-edited; corrections happen by fixing inputs and re-running" is
 * structural rather than enforced: there is no write path anywhere in this
 * codebase that sets a fee-line amount from user input.
 *
 * A re-run creates a NEW version and supersedes the previous one, so the
 * correction is itself recorded (AC-4 again, and GATE-02).
 */
export async function runCalculation(input: {
  societyId: string;
  serviceLine: ServiceLine;
  period: string;
}): Promise<RunOutcome> {
  const gate = await requireBillingOps();
  if (!gate.ok) return { error: gate.error };

  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    return { error: "The billing period must be a YYYY-MM selection." };
  }

  const contract = await db.contract.findFirst({
    where: { societyId: input.societyId, serviceLine: input.serviceLine, status: "active" },
    include: { versions: { orderBy: { effectiveFrom: "asc" } } },
  });
  if (!contract) return { error: "This society has no active contract for that service line." };

  const { from, to } = periodBounds(input.period);

  // The terms in force during the month being billed — not today's terms.
  // FEAT-062-AC-5: an amendment applies forward only, so a prior month stays
  // computed against the version that was in force at the time.
  const terms = [...contract.versions].filter((v) => v.effectiveFrom <= to).pop();
  if (!terms) return { error: "This contract has no term version effective for that month." };

  // CON-22 — the completion certificate is a hard input for the first month
  // (FEAT-051-AC-3). Without it there is no start date to prorate from, and
  // the bill is held rather than guessed at.
  const project = await db.installationProject.findFirst({
    where: { pipelineId: contract.pipelineId },
    select: { certificate: { select: { signedAt: true, billingStartDate: true } } },
  });
  const certificate = project?.certificate ?? null;
  if (!certificate) {
    return { error: "Billing hasn't started for this society — no completion certificate is recorded (CON-22)." };
  }
  // FEAT-051-AC-2 — before billing starts there is no invoice at all, not a
  // zero-value one.
  if (certificate.billingStartDate >= to) {
    return {
      error: `Billing starts ${certificate.billingStartDate.toISOString().slice(0, 10)}, after ${input.period}.`,
    };
  }
  const isFirstBilledMonth =
    certificate.billingStartDate >= from && certificate.billingStartDate < to;

  const circuits = await db.circuit.findMany({
    // A voided circuit must never reach a fee line — this is the query that
    // turns circuits into money, so the exclusion matters most here.
    where: {
      societyId: input.societyId,
      serviceLine: input.serviceLine,
      state: "benchmark_confirmed",
      voidedAt: null,
    },
    include: { rescaleEvents: { orderBy: { effectiveDate: "asc" } } },
  });
  if (circuits.length === 0) {
    return { error: "No commissioned circuit on this contract has a confirmed benchmark yet." };
  }

  const prior = await db.monthlyCalculation.findFirst({
    where: {
      societyId: input.societyId,
      serviceLine: input.serviceLine,
      period: previousPeriod(input.period),
      status: { in: ["calculated", "released"] },
    },
    orderBy: { version: "desc" },
    include: { feeLines: { include: { deviationReview: true } } },
  });

  const existing = await db.monthlyCalculation.findFirst({
    where: { societyId: input.societyId, serviceLine: input.serviceLine, period: input.period },
    orderBy: { version: "desc" },
  });

  // GATE-02 — a released month is immutable. A correction is a new version,
  // which is a deliberate act, not something a routine re-run does silently.
  if (existing?.status === "released") {
    return {
      error: "This month is released and cannot be recalculated. Issue a correction version instead (GATE-02).",
    };
  }

  const version = (existing?.version ?? 0) + 1;
  const blockers: string[] = [];
  const perCircuit: Array<{
    terms: CircuitTerms;
    readings: CircuitMonthReadings;
    priorConsecutiveBreaches: number;
    priorBreachAttributableAndUncorrected: boolean;
    provenance: Prisma.JsonObject;
  }> = [];

  const daysInMonth = daysInPeriod(input.period);

  for (const circuit of circuits) {
    // INV-09 — the gate this whole milestone sits behind. A month whose
    // readings still carry an unresolved blocking anomaly does not calculate.
    const openAnomalies = await db.readingAnomaly.count({
      where: {
        circuitId: circuit.id,
        period: input.period,
        blocksBilling: true,
        status: { in: ["open", "sent_back"] },
      },
    });
    if (openAnomalies > 0) {
      blockers.push(
        `${circuit.lightType} has ${openAnomalies} unresolved reading flag${openAnomalies === 1 ? "" : "s"} (INV-09).`,
      );
      continue;
    }

    const readings = await db.meterReading.findMany({
      where: { circuitId: circuit.id, date: { gte: from, lt: to }, excludedAt: null },
      select: { id: true, date: true, kWh: true, rawFileId: true },
      orderBy: { date: "asc" },
    });

    if (readings.length === 0) {
      blockers.push(`${circuit.lightType} has no readings for ${input.period}.`);
      continue;
    }

    // CON-12's floor. Below it the system will not produce a billing-grade
    // figure unprompted — ops has to accept the coverage explicitly, and
    // that acceptance is its own recorded act (FEAT-046-AC-5, built at MS-07).
    if (readings.length < COVERAGE_FLOOR_DAYS) {
      const accepted = await db.coverageAcceptance.findUnique({
        where: { circuitId_period: { circuitId: circuit.id, period: input.period } },
      });
      if (!accepted) {
        blockers.push(
          `${circuit.lightType} has ${readings.length} of ${daysInMonth} days — below CON-12's ${COVERAGE_FLOOR_DAYS}-day floor and not yet accepted.`,
        );
        continue;
      }
    }

    // FEAT-041 / INV-07 — the baseline in force for THIS month, replayed from
    // the rescale event log rather than read off the circuit. A rescale
    // effective in March must not change February's bill.
    const rescaleEvents = circuit.rescaleEvents.map((e) => ({
      effectiveDate: e.effectiveDate,
      previousLightCount: e.previousLightCount,
      newLightCount: e.newLightCount,
      previousBaseline: e.previousBaseline,
      rescaledBaseline: e.rescaledBaseline,
    }));
    const baseline = effectiveBaselineAt(circuit.preInstallBaseline, rescaleEvents, to);
    const meteredLightCount = effectiveLightCountAt(circuit.meteredLightCount, rescaleEvents, to);

    if (baseline == null || circuit.benchmarkSavingsPct == null) {
      blockers.push(`${circuit.lightType} has no commissioned baseline or benchmark.`);
      continue;
    }

    const priorLine = prior?.feeLines.find((l) => l.circuitId === circuit.id);
    const priorReview = priorLine?.deviationReview;

    perCircuit.push({
      terms: {
        circuitId: circuit.id,
        lightType: circuit.lightType,
        meteredLightCount,
        representedLightCount: circuit.representedLightCount,
        benchmarkSavingsPct: circuit.benchmarkSavingsPct,
        baselineKwhPerDay: baseline,
        contractedMonthlyFee: contractedFeeForCircuit({
          representedLightCount: circuit.representedLightCount,
          meteredLightCount,
          baselineKwhPerDay: baseline,
          daysInMonth,
          benchmarkSavingsPct: circuit.benchmarkSavingsPct,
          unitElectricityRate: terms.unitElectricityRate,
          societyRevenueSharePct: terms.revenueSharePct,
        }),
      },
      readings: {
        circuitId: circuit.id,
        meteredKwh: readings.reduce((s, r) => s + r.kWh, 0),
        coverageDays: readings.length,
        daysInMonth,
      },
      priorConsecutiveBreaches: priorLine?.consecutiveBreachCount ?? 0,
      // CON-01b/CON-01c — only a FirsThing-attributable shortfall that was
      // NOT corrected at no cost can carry the streak into an adjustment.
      priorBreachAttributableAndUncorrected:
        priorReview?.rootCause === "firsthing_attributable" && !priorReview.correctedAtNoCost,
      // GATE-01 — provenance for every number on this line.
      provenance: {
        circuitId: circuit.id,
        readingIds: readings.map((r) => r.id),
        rawFileIds: [...new Set(readings.map((r) => r.rawFileId).filter(Boolean))],
        baselineUsed: baseline,
        baselineSource: rescaleEvents.length > 0 ? "rescale_event_replay" : "commissioned",
        rescaleEventCount: rescaleEvents.length,
        meteredLightCountUsed: meteredLightCount,
        benchmarkSavingsPct: circuit.benchmarkSavingsPct,
      } satisfies Prisma.JsonObject,
    });
  }

  const now = new Date();

  if (perCircuit.length === 0 || blockers.length > 0) {
    const reason = blockers.join(" ") || "No circuit on this contract could be calculated.";
    const held = await db.monthlyCalculation.create({
      data: {
        societyId: input.societyId,
        serviceLine: input.serviceLine,
        period: input.period,
        version,
        status: "held",
        heldReason: reason,
        totalExtrapolatedKwh: 0,
        totalSavedKwh: 0,
        totalSavedValue: 0,
        subtotal: 0,
        total: 0,
        coverageDays: 0,
        coverageOfDays: daysInMonth,
        inputVersionSnapshot: { blockers, contractTermVersion: terms.version } satisfies Prisma.JsonObject,
        contractTermVersionId: terms.id,
      },
    });
    if (existing) {
      await db.monthlyCalculation.update({
        where: { id: existing.id },
        data: { status: "superseded", supersededById: held.id, supersededAt: now },
      });
    }
    logger.warn("billing.calculation_held", {
      actorId: gate.actor.id,
      societyId: input.societyId,
      period: input.period,
      blockers,
    });
    revalidatePath(PATH);
    return { held: { reason, calculationId: held.id } };
  }

  const result = calculateMonth({
    circuits: perCircuit,
    contract: {
      tolerancePct: terms.tolerancePct,
      societyRevenueSharePct: terms.revenueSharePct,
      unitElectricityRate: terms.unitElectricityRate,
    },
    firstMonthSignedAt: isFirstBilledMonth ? certificate.signedAt : null,
  });

  const coverageDays = Math.min(...perCircuit.map((c) => c.readings.coverageDays));

  const created = await db.$transaction(async (tx) => {
    const calc = await tx.monthlyCalculation.create({
      data: {
        societyId: input.societyId,
        serviceLine: input.serviceLine,
        period: input.period,
        version,
        status: "calculated",
        totalExtrapolatedKwh: result.totalExtrapolatedKwh,
        totalSavedKwh: result.totalSavedKwh,
        totalSavedValue: result.totalSavedValue,
        subtotal: result.subtotal,
        total: result.total,
        proratedDays: result.proration?.proratedDays ?? null,
        daysInMonth: result.proration?.daysInMonth ?? null,
        coverageDays,
        coverageOfDays: daysInMonth,
        contractTermVersionId: terms.id,
        // GATE-01 / INV-02 — the whole audit trail for this figure, frozen at
        // the moment it was computed. Re-deriving it later from tables that
        // have since moved on is exactly what this exists to avoid.
        inputVersionSnapshot: {
          contractId: contract.id,
          contractTermVersionId: terms.id,
          contractTermVersion: terms.version,
          tolerancePct: terms.tolerancePct,
          revenueSharePct: terms.revenueSharePct,
          unitElectricityRate: terms.unitElectricityRate,
          billingStartDate: certificate.billingStartDate.toISOString(),
          proratedFirstMonth: isFirstBilledMonth,
          circuits: perCircuit.map((c) => c.provenance),
        } satisfies Prisma.JsonObject,
      },
    });

    for (const line of result.feeLines) {
      const source = perCircuit.find((c) => c.terms.circuitId === line.circuitId)!;
      const feeLine = await tx.circuitFeeLine.create({
        data: {
          monthlyCalculationId: calc.id,
          circuitId: line.circuitId,
          meteredKwh: source.readings.meteredKwh,
          meteredLightCount: source.terms.meteredLightCount,
          representedLightCount: source.terms.representedLightCount,
          extrapolatedConsumption: line.extrapolatedConsumptionKwh,
          baselineKwhPerDay: source.terms.baselineKwhPerDay,
          benchmarkSavingsPct: line.benchmarkSavingsPct,
          measuredSavingsPct: line.measuredSavingsPct,
          deviationPct: line.deviationPct,
          complianceResult: line.complianceResult,
          approaching: line.approaching,
          pricingBasis: line.pricingBasis,
          consecutiveBreachCount: line.consecutiveBreachCount,
          savedKwh: line.savedKwh,
          savedValue: line.savedValue,
          amount: line.amount,
          coverageDays: source.readings.coverageDays,
        },
      });

      // FEAT-049-AC-3 / FEAT-055 — each out-of-band circuit raises its OWN
      // review, scoped to that circuit. There is deliberately no society-level
      // composite check: a broken light type must not be able to hide inside
      // three healthy ones.
      if (line.complianceResult === "out_of_band") {
        await tx.deviationReview.create({ data: { circuitFeeLineId: feeLine.id, state: "raised" } });
      }
    }

    // FEAT-059 — the report generates automatically once the calculation
    // completes. It is not released here: nothing reaches a society before
    // the accountant's gate (CON-33).
    await tx.savingsReport.create({
      data: {
        monthlyCalculationId: calc.id,
        provenance: {
          calculationId: calc.id,
          contractTermVersion: terms.version,
          circuits: perCircuit.map((c) => c.provenance),
        } satisfies Prisma.JsonObject,
      },
    });

    if (existing) {
      await tx.monthlyCalculation.update({
        where: { id: existing.id },
        data: { status: "superseded", supersededById: calc.id, supersededAt: now },
      });
    }

    return calc;
  });

  const outOfBand = result.feeLines.filter((l) => l.complianceResult === "out_of_band").length;
  logger.info("billing.calculated", {
    actorId: gate.actor.id,
    societyId: input.societyId,
    period: input.period,
    version,
    calculationId: created.id,
    lines: result.feeLines.length,
    outOfBand,
    total: result.total,
    prorated: result.proration !== null,
  });
  revalidatePath(PATH);
  return { calculated: { calculationId: created.id, total: result.total, outOfBand, version } };
}

/**
 * The fixed monthly fee a circuit's line bills at (CON-01/CON-11).
 *
 * Derived from the contracted benchmark and a full month of the baseline —
 * deliberately NOT from this month's reading, because CON-01 is explicit that
 * the bill is fixed and the reading is only the check. Recomputing it from the
 * month's own consumption would quietly turn every month into a repricing,
 * which is the exact misreading CON-01 was rewritten to correct.
 */
function contractedFeeForCircuit(input: {
  representedLightCount: number;
  meteredLightCount: number;
  baselineKwhPerDay: number;
  daysInMonth: number;
  benchmarkSavingsPct: number;
  unitElectricityRate: number;
  societyRevenueSharePct: number;
}): number {
  const baselineMonth = input.baselineKwhPerDay * input.daysInMonth;
  const extrapolated = (input.representedLightCount / input.meteredLightCount) * baselineMonth;
  const savedKwh = extrapolated * (input.benchmarkSavingsPct / 100);
  return savedKwh * input.unitElectricityRate * ((100 - input.societyRevenueSharePct) / 100);
}
