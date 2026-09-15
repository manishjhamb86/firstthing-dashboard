/**
 * CON-47 / ADR-011 — everything `deriveInvoiceMonth` needs about one
 * society-month, read from the database. Server-only (imports `db`).
 *
 * Resolves circuits to their deal's contract the same way `runCalculation`
 * does — through the circuit's own survey's pipeline — and the terms in
 * force the same way (the latest version effective on or before the period's
 * end, FEAT-062-AC-5). It is more lenient than `runCalculation` in exactly
 * one place, deliberately: a contract with no completion certificate still
 * bills here, with its billing window taken from the contract's own term
 * start. None of the 14 backfilled contracts has a certificate (the deals
 * were signed years before this system existed), and the invoice being
 * uploaded is itself the evidence that billing happened.
 */

import { db } from "@/lib/db";
import { effectiveBaselineAt, effectiveLightCountAt } from "@/lib/benchmark-rescale";
import { circuitLabelOf } from "@/lib/circuit-label";
import type { CircuitMonthReadings, InvoiceMonthPart } from "@/lib/invoice-month";
import type { CircuitOption } from "@/lib/invoice-intake";
import type { ServiceLine } from "@prisma/client";

export type InvoiceMonthContext = {
  parts: InvoiceMonthPart[];
  readingsByCircuit: Record<string, CircuitMonthReadings>;
  /** Every live circuit of the society for the line→circuit picker, whether or not it is on a contract. */
  circuitOptions: CircuitOption[];
  /** Circuits that exist but bill under no active contract this period — stated on the review. */
  notes: string[];
};

function periodBounds(period: string): { from: Date; to: Date } {
  const [y, m] = period.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

export async function loadInvoiceMonthContext(input: {
  societyId: string;
  serviceLine: ServiceLine;
  period: string;
}): Promise<InvoiceMonthContext> {
  const { from, to } = periodBounds(input.period);
  const notes: string[] = [];

  const contracts = await db.contract.findMany({
    where: { societyId: input.societyId, serviceLine: input.serviceLine, status: "active" },
    include: {
      versions: { orderBy: { effectiveFrom: "asc" } },
      pipeline: {
        select: {
          id: true,
          installationProject: { select: { certificate: { select: { signedAt: true, billingStartDate: true } } } },
        },
      },
    },
  });

  const circuits = await db.circuit.findMany({
    where: { societyId: input.societyId, serviceLine: input.serviceLine, voidedAt: null },
    include: {
      rescaleEvents: { orderBy: { effectiveDate: "asc" } },
      siteSurvey: { select: { pipelineId: true } },
      meterDevice: { select: { id: true } },
    },
    orderBy: [{ location: "asc" }, { lightType: "asc" }],
  });

  const circuitOptions: CircuitOption[] = circuits.map((c) => ({
    circuitId: c.id,
    label: circuitLabelOf(c.location, c.lightType),
    representedLightCount: c.representedLightCount,
    lightType: c.lightType,
  }));

  const parts: InvoiceMonthPart[] = [];
  const claimed = new Set<string>();

  for (const contract of contracts) {
    const terms = [...contract.versions].filter((v) => v.effectiveFrom <= to).pop();
    if (!terms) {
      notes.push(`Contract ${contract.id}: no term version is effective for ${input.period}.`);
      continue;
    }
    const certificate = contract.pipeline.installationProject?.certificate ?? null;
    const billingStart = certificate?.billingStartDate ?? contract.termStart;
    if (billingStart >= to) {
      notes.push(`A contract's billing starts after ${input.period} — its circuits are not billed this month.`);
      continue;
    }
    if (contract.termEnd < from) {
      notes.push(`A contract's term ended before ${input.period} — its circuits are not billed this month.`);
      continue;
    }

    const own = circuits.filter((c) => c.siteSurvey?.pipelineId === contract.pipelineId);
    for (const c of own) claimed.add(c.id);

    // First month: prorate from the day billing started (CON-22). The
    // certificate carries a signature date; a bare term start is the first
    // billed day itself, which `prorateFirstMonth` would otherwise shift by
    // one — so it is offered as "signed the day before".
    const firstMonth = billingStart >= from && billingStart < to;
    const signedAt = firstMonth
      ? (certificate?.signedAt ?? new Date(billingStart.getTime() - 24 * 3600 * 1000))
      : null;

    parts.push({
      contractId: contract.id,
      termVersionId: terms.id,
      unitElectricityRate: terms.unitElectricityRate,
      // The society's share; FirsThing's fee is the rest. Null on a lump-sum deal.
      societyRevenueSharePct: terms.pricingModel === "lump_sum" ? null : (terms.revenueSharePct ?? null),
      tolerancePct: terms.tolerancePct ?? null,
      firstMonthSignedAt: signedAt,
      finalMonthEndsOn: contract.termEnd < to ? contract.termEnd : null,
      circuits: own.map((c) => {
        const events = c.rescaleEvents.map((e) => ({
          id: e.id,
          effectiveDate: e.effectiveDate,
          previousLightCount: e.previousLightCount,
          newLightCount: e.newLightCount,
          previousBaseline: e.previousBaseline,
          rescaledBaseline: e.rescaledBaseline,
          voidedAt: e.voidedAt,
        }));
        // The override is the figure in force when one is set — the same
        // rule `deriveBenchmark` applies when it writes benchmarkSavingsPct.
        const override = c.benchmarkOverridePct;
        return {
          circuitId: c.id,
          lightType: c.lightType,
          meteredLightCount: effectiveLightCountAt(c.meteredLightCount, events, to),
          representedLightCount: c.representedLightCount,
          baselineKwhPerDay: effectiveBaselineAt(c.preInstallBaseline, events, to),
          benchmarkSavingsPct: override ?? c.benchmarkSavingsPct,
          benchmarkSource: override !== null ? "override" : c.benchmarkSavingsPct !== null ? "demo" : "none",
        };
      }),
    });
  }

  for (const c of circuits) {
    if (!claimed.has(c.id)) {
      notes.push(`${circuitLabelOf(c.location, c.lightType)} is not on an active contract for ${input.period}.`);
    }
  }

  const readingsByCircuit: Record<string, CircuitMonthReadings> = {};
  const readings = await db.meterReading.findMany({
    where: { circuitId: { in: circuits.map((c) => c.id) }, date: { gte: from, lt: to }, excludedAt: null },
    select: { id: true, circuitId: true, date: true, kWh: true, intervalCount: true, rawFileId: true },
    orderBy: { date: "asc" },
  });

  // Hours per day that actually carried a reading, from each bound meter's
  // own hourly store — the export writes 0 for an hour the meter was offline,
  // so a 24-row day can be a whole day of silence (the live-monitoring page's
  // own rule). A day the store does not cover gets null: no claim about
  // silence where there is no hour-level truth.
  const dataHoursByCircuitDay = new Map<string, number>();
  const bound = circuits.filter((c) => c.meterDevice);
  for (const c of bound) {
    const groups = await db.meterHourlyReading.groupBy({
      by: ["day"],
      where: { meterId: c.meterDevice!.id, day: { gte: from, lt: to }, kWh: { gt: 0 } },
      _count: { _all: true },
    });
    const covered = await db.meterHourlyReading.groupBy({
      by: ["day"],
      where: { meterId: c.meterDevice!.id, day: { gte: from, lt: to } },
      _count: { _all: true },
    });
    const nz = new Map(groups.map((g) => [g.day.toISOString().slice(0, 10), g._count._all]));
    for (const g of covered) {
      const key = g.day.toISOString().slice(0, 10);
      dataHoursByCircuitDay.set(`${c.id}|${key}`, nz.get(key) ?? 0);
    }
  }

  for (const r of readings) {
    const bucket = (readingsByCircuit[r.circuitId] ??= { days: [], readingIds: [], rawFileIds: [] });
    const date = r.date.toISOString().slice(0, 10);
    bucket.days.push({
      date,
      kWh: r.kWh,
      intervalCount: r.intervalCount,
      dataHours: dataHoursByCircuitDay.get(`${r.circuitId}|${date}`) ?? null,
    });
    bucket.readingIds.push(r.id);
    if (!bucket.rawFileIds.includes(r.rawFileId)) bucket.rawFileIds.push(r.rawFileId);
  }

  return { parts, readingsByCircuit, circuitOptions, notes };
}
