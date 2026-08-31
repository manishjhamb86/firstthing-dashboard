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
import { dealLabel } from "@/lib/deal-scope";

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

  // CON-24 as amended (2026-08-31): a service line is delivered in PARTS,
  // each part its own deal with its own contract, terms, billing start and
  // term end. The month is still ONE combined calculation for the line — the
  // user's own example: part A ₹2,000/mo from Sept, part B ₹3,000/mo from
  // Dec → ₹5,000 combined, dropping back to ₹3,000 when part A's term ends.
  const contracts = await db.contract.findMany({
    where: { societyId: input.societyId, serviceLine: input.serviceLine, status: "active" },
    include: {
      versions: { orderBy: { effectiveFrom: "asc" } },
      pipeline: { select: { id: true, dealScope: true } },
    },
  });
  if (contracts.length === 0) {
    return { error: "This society has no active contract for that service line." };
  }

  const { from, to } = periodBounds(input.period);

  type Part = {
    contract: (typeof contracts)[number];
    terms: (typeof contracts)[number]["versions"][number];
    label: string;
    firstMonthSignedAt: Date | null;
    finalMonthEndsOn: Date | null;
    billingStartDate: Date;
  };
  const parts: Part[] = [];
  // A part outside its window is STATED, never a blocker: one part not yet
  // billing must not hold up the parts that are — that used to be exactly
  // what happened when the run assumed a single contract.
  const windowNotes: string[] = [];

  for (const contract of contracts) {
    const label = dealLabel(input.serviceLine, contract.pipeline.dealScope);
    // CON-22 — this part's completion certificate is the hard input for its
    // first month (FEAT-051-AC-3). Without it there is no start date to
    // prorate from, so the part is out of the month rather than guessed at.
    const project = await db.installationProject.findFirst({
      where: { pipelineId: contract.pipelineId },
      select: { certificate: { select: { signedAt: true, billingStartDate: true } } },
    });
    const certificate = project?.certificate ?? null;
    if (!certificate) {
      windowNotes.push(`${label}: no completion certificate — its billing has not started (CON-22).`);
      continue;
    }
    // FEAT-051-AC-2 — before a part's billing starts it contributes nothing,
    // not a zero line.
    if (certificate.billingStartDate >= to) {
      windowNotes.push(
        `${label}: billing starts ${certificate.billingStartDate.toISOString().slice(0, 10)}, after ${input.period}.`,
      );
      continue;
    }
    // The part's term is its own: a month after its end bills nothing for it.
    if (contract.termEnd < from) {
      windowNotes.push(`${label}: its term ended ${contract.termEnd.toISOString().slice(0, 10)}.`);
      continue;
    }
    // The terms in force during the month being billed — not today's terms.
    // FEAT-062-AC-5: an amendment applies forward only, so a prior month
    // stays computed against the version in force at the time.
    const terms = [...contract.versions].filter((v) => v.effectiveFrom <= to).pop();
    if (!terms) {
      return { error: `${label}: no contract term version is effective for that month.` };
    }
    parts.push({
      contract,
      terms,
      label,
      billingStartDate: certificate.billingStartDate,
      firstMonthSignedAt:
        certificate.billingStartDate >= from && certificate.billingStartDate < to
          ? certificate.signedAt
          : null,
      // A term ending inside the month prorates that part to the days it
      // served — the mirror of CON-22's first month ("one mechanism, both
      // ends of the contract"; the user's call, 2026-08-31).
      finalMonthEndsOn: contract.termEnd < to ? contract.termEnd : null,
    });
  }

  if (parts.length === 0) {
    return {
      error: `No part of this service line is inside its billing window for ${input.period}. ${windowNotes.join(" ")}`.trim(),
    };
  }

  const circuits = await db.circuit.findMany({
    // A voided circuit must never reach a fee line — this is the query that
    // turns circuits into money, so the exclusion matters most here.
    where: {
      societyId: input.societyId,
      serviceLine: input.serviceLine,
      state: "benchmark_confirmed",
      voidedAt: null,
    },
    include: {
      rescaleEvents: { orderBy: { effectiveDate: "asc" } },
      // Which DEAL each circuit bills under — resolved through its own
      // survey's pipeline, the same path the band alert already walks. A
      // circuit must never bill under a sibling part's terms.
      siteSurvey: { select: { pipelineId: true } },
    },
  });
  const partByPipeline = new Map(parts.map((p) => [p.contract.pipelineId, p]));
  // `siteSurveyId` is nullable in the schema; a circuit with no survey has no
  // deal to bill under, and billing it under a sibling's terms would be worse
  // than stating it.
  const billable = circuits.filter(
    (c) => c.siteSurvey !== null && partByPipeline.has(c.siteSurvey.pipelineId),
  );
  for (const c of circuits) {
    if (c.siteSurvey === null || !partByPipeline.has(c.siteSurvey.pipelineId)) {
      windowNotes.push(
        `Circuit ${c.lightType} is commissioned but its own deal has no active billing window this month — not billed.`,
      );
    }
  }
  if (billable.length === 0) {
    return { error: "No commissioned circuit inside a billing window has a confirmed benchmark yet." };
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
  type PerCircuit = {
    part: Part;
    terms: CircuitTerms;
    readings: CircuitMonthReadings;
    priorConsecutiveBreaches: number;
    priorBreachAttributableAndUncorrected: boolean;
    provenance: Prisma.JsonObject;
  };
  const perCircuit: PerCircuit[] = [];

  const daysInMonth = daysInPeriod(input.period);

  for (const circuit of billable) {
    const part = partByPipeline.get(circuit.siteSurvey!.pipelineId)!;
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
      part,
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
          unitElectricityRate: part.terms.unitElectricityRate,
          societyRevenueSharePct: part.terms.revenueSharePct,
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
        contractId: part.contract.id,
        deal: part.label,
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
        inputVersionSnapshot: {
          blockers,
          notes: windowNotes,
          parts: parts.map((pt) => ({ contractId: pt.contract.id, deal: pt.label, termVersion: pt.terms.version })),
        } satisfies Prisma.JsonObject,
        contractTermVersionId: parts.length === 1 ? parts[0].terms.id : null,
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
    // One CalculationPart per deal: its own tolerance, share, rate and its
    // own first/final-month proration, applied only to its own circuits.
    parts: parts
      .map((pt) => ({
        contractId: pt.contract.id,
        contract: {
          tolerancePct: pt.terms.tolerancePct,
          societyRevenueSharePct: pt.terms.revenueSharePct,
          unitElectricityRate: pt.terms.unitElectricityRate,
        },
        circuits: perCircuit
          .filter((c) => c.part.contract.id === pt.contract.id)
          .map(({ terms, readings, priorConsecutiveBreaches, priorBreachAttributableAndUncorrected }) => ({
            terms,
            readings,
            priorConsecutiveBreaches,
            priorBreachAttributableAndUncorrected,
          })),
        firstMonthSignedAt: pt.firstMonthSignedAt,
        finalMonthEndsOn: pt.finalMonthEndsOn,
      }))
      .filter((pt) => pt.circuits.length > 0),
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
        // One pointer can only name one part's terms — with several, the
        // per-part versions live in the snapshot below and this stays null.
        contractTermVersionId: parts.length === 1 ? parts[0].terms.id : null,
        // GATE-01 / INV-02 — the whole audit trail for this figure, frozen at
        // the moment it was computed. Re-deriving it later from tables that
        // have since moved on is exactly what this exists to avoid.
        inputVersionSnapshot: {
          parts: result.parts.map((rp) => {
            const pt = parts.find((x) => x.contract.id === rp.contractId)!;
            return {
              contractId: pt.contract.id,
              pipelineId: pt.contract.pipelineId,
              deal: pt.label,
              contractTermVersionId: pt.terms.id,
              contractTermVersion: pt.terms.version,
              tolerancePct: pt.terms.tolerancePct,
              revenueSharePct: pt.terms.revenueSharePct,
              unitElectricityRate: pt.terms.unitElectricityRate,
              billingStartDate: pt.billingStartDate.toISOString(),
              termEnd: pt.contract.termEnd.toISOString(),
              proratedFirstMonth: pt.firstMonthSignedAt !== null,
              proratedFinalMonth: pt.finalMonthEndsOn !== null,
              proratedDays: rp.proration?.proratedDays ?? null,
              subtotal: rp.subtotal,
              total: rp.total,
            };
          }),
          notes: windowNotes,
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
          parts: parts.map((pt) => ({ contractId: pt.contract.id, deal: pt.label, termVersion: pt.terms.version })),
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
