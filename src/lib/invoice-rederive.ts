/**
 * CON-47 / ADR-011 / FEAT-110-AC-5 — the re-derivation hook.
 *
 * "A published month re-derives itself as a new version when readings
 * arrive later" (MS-09's third exit criterion). ADR-011 names the two
 * places a reading commit can trigger this — beside `syncCircuitBandAlert`,
 * the sibling check every reading-commit path already runs — and the exact
 * trigger: a live, RELEASED, invoice-sourced month whose line for this
 * circuit still rests on the `agreed` basis gets re-derived, and only
 * VERSIONED when that line's basis genuinely flips to `measured` (readings
 * now cover CON-12's floor, via the same `deriveInvoiceMonth` submit uses).
 * A line already `measured`, or one that stays `agreed` because the fresh
 * readings still don't clear the floor, produces no new version — this is
 * deliberately not "re-derive on every reading commit regardless of
 * outcome," which would spam a version per upload.
 *
 * Safe to call as often as you like, on the same pattern as
 * `syncCircuitBandAlert`: it does nothing when nothing changed, and a
 * concurrent double-call is caught by the calculation's own unique
 * constraint rather than raced past it.
 *
 * ADR-011's stated, reversible choice: the new version INHERITS
 * `releasedAt`/`releasedById` from the one it replaces — the accountant
 * reviewed the BILL (CON-33), which this never touches; the stats are a
 * computation with no human input, so auto-publishing them needs no second
 * look. `rederivedAt`/`rederivedFromId` record that it happened, and the
 * release queue (`release-queue-loader.ts`) shows it as a non-blocking
 * info row rather than hiding it.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { daysInPeriod } from "@/lib/reading-normalize";
import { loadInvoiceMonthContext } from "@/lib/invoice-month-loader";
import { deriveInvoiceMonth, type SavingsBasis } from "@/lib/invoice-month";
import type { Prisma } from "@prisma/client";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/** Pure: did any line that was `agreed` come back `measured`? Unit-tested without a database. */
export function anyLineImprovedToMeasured(
  oldBasisByCircuit: Map<string, SavingsBasis>,
  newLines: { circuitId: string; basis: SavingsBasis }[],
): boolean {
  return newLines.some((l) => oldBasisByCircuit.get(l.circuitId) === "agreed" && l.basis === "measured");
}

/**
 * Pure: after a light-count change (a baseline rescale), did the month's
 * figures actually move? A rescale changes the baseline the measured saving
 * is judged against (INV-07, forward from its effective date), so a
 * published month's saving % and ₹ move with it — the user's report
 * (2026-09-25): French Apartment was rescaled from 1 August and every screen
 * showed the new figure except the society's own dashboard, which reads the
 * published months. The invoice never changes; only the stats version does.
 */
export function linesMateriallyChanged(
  oldLines: { circuitId: string; basis: SavingsBasis; baselineKwhPerDay: number; measuredSavingsPct: number; savedValue: number }[],
  newLines: { circuitId: string; basis: SavingsBasis; baselineKwhPerDay: number; savingsPct: number; savedValue: number }[],
): boolean {
  const old = new Map(oldLines.map((l) => [l.circuitId, l]));
  return newLines.some((n) => {
    const o = old.get(n.circuitId);
    if (!o) return true;
    return (
      o.basis !== n.basis ||
      Math.abs(o.baselineKwhPerDay - n.baselineKwhPerDay) > 1e-6 ||
      Math.abs(o.measuredSavingsPct - n.savingsPct) > 0.005 ||
      Math.abs(o.savedValue - n.savedValue) > 0.5
    );
  });
}

async function rederiveOneMonth(calculationId: string, actorId: string, trigger: "readings" | "rescale" = "readings"): Promise<string | null> {
  const calc = await db.monthlyCalculation.findUnique({
    where: { id: calculationId },
    include: { feeLines: true, society: { select: { name: true } } },
  });
  // Re-checked fresh: another call (or a genuine race) may already have
  // superseded this exact row between the candidate query and here.
  if (!calc || calc.source !== "invoice" || calc.status !== "released" || calc.supersededById !== null) return null;

  const oldBasisByCircuit = new Map(calc.feeLines.map((l) => [l.circuitId, l.basis]));
  const serviceLines = calc.feeLines.map((l, i) => ({
    lineNo: i + 1,
    circuitId: l.circuitId,
    lightsBilled: l.invoiceLightCount ?? l.representedLightCount,
    amount: l.amount,
  }));

  const ctx = await loadInvoiceMonthContext({ societyId: calc.societyId, serviceLine: calc.serviceLine, period: calc.period });
  const derived = deriveInvoiceMonth({ period: calc.period, parts: ctx.parts, lines: serviceLines, readingsByCircuit: ctx.readingsByCircuit });

  if (trigger === "readings" ? !anyLineImprovedToMeasured(oldBasisByCircuit, derived.lines) : !linesMateriallyChanged(calc.feeLines, derived.lines)) return null;

  const invoice = await db.billingInvoice.findFirst({ where: { monthlyCalculationId: calc.id, voidedAt: null } });
  // Nothing to re-point a live figure onto — the same fact the release
  // queue's own belt-and-braces check would refuse on; leave the month as
  // it stands rather than versioning a bill with no live invoice.
  if (!invoice) return null;

  const daysInMonth = daysInPeriod(calc.period);
  const singlePart = derived.lines.length > 0 && new Set(derived.lines.map((l) => l.contractId)).size === 1;
  const proration = singlePart ? derived.lines[0].proration : null;
  const termVersionId = singlePart ? (ctx.parts.find((p) => p.contractId === derived.lines[0].contractId)?.termVersionId ?? null) : null;
  const measuredCoverage = derived.lines.filter((l) => l.basis === "measured").map((l) => l.coverageDays);
  const now = new Date();

  const snapshot = {
    source: "invoice",
    period: calc.period,
    rederivedFrom: calc.id,
    invoice: {
      number: invoice.number,
      invoiceDate: invoice.issueDate.toISOString().slice(0, 10),
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      subtotal: invoice.subtotal,
      taxAmount: invoice.taxAmount,
      total: invoice.amount,
    },
    lines: derived.lines.map((l) => ({
      lineNo: l.lineNo,
      circuitId: l.circuitId,
      contractId: l.contractId,
      basis: l.basis,
      lightsBilled: l.lightsBilled,
      countDisagreement: l.countDisagreement,
      billedDays: l.billedDays,
      baselineKwhPerDay: l.baselineKwhPerDay,
      benchmarkSavingsPct: l.benchmarkSavingsPct,
      savingsPct: l.savingsPct,
      savedValue: l.savedValue,
      amount: l.amount,
      firsthingSharePct: l.firsthingSharePct,
      societyNet: l.societyNet,
      coverageDays: l.coverageDays,
      dayTally: l.dayTally,
      readingsNote: l.readingsNote,
      provenance: l.provenance,
    })),
    notDerivable: derived.notDerivable,
  } satisfies Prisma.JsonObject;

  try {
    const newCalcId = await db.$transaction(async (tx) => {
      const version = calc.version + 1;
      const newCalc = await tx.monthlyCalculation.create({
        data: {
          societyId: calc.societyId,
          serviceLine: calc.serviceLine,
          period: calc.period,
          version,
          source: "invoice",
          status: "released",
          releasedAt: calc.releasedAt,
          releasedById: calc.releasedById,
          rederivedAt: now,
          rederivedFromId: calc.id,
          totalExtrapolatedKwh: derived.totals.extrapolatedConsumptionKwh,
          totalSavedKwh: derived.totals.savedKwh,
          totalSavedValue: derived.totals.savedValue,
          subtotal: derived.totals.amount,
          total: derived.totals.amount,
          proratedDays: proration?.proratedDays ?? null,
          daysInMonth: proration ? proration.daysInMonth : null,
          coverageDays: measuredCoverage.length > 0 ? Math.max(...measuredCoverage) : 0,
          coverageOfDays: daysInMonth,
          inputVersionSnapshot: snapshot,
          contractTermVersionId: termVersionId,
        },
      });
      await tx.monthlyCalculation.update({ where: { id: calc.id }, data: { status: "superseded", supersededAt: now, supersededById: newCalc.id } });

      for (const l of derived.lines) {
        await tx.circuitFeeLine.create({
          data: {
            monthlyCalculationId: newCalc.id,
            circuitId: l.circuitId,
            meteredKwh: l.basis === "measured" ? l.extrapolatedConsumptionKwh : 0,
            meteredLightCount: l.lightsBilled,
            representedLightCount: l.lightsBilled,
            extrapolatedConsumption: l.extrapolatedConsumptionKwh,
            baselineKwhPerDay: l.baselineKwhPerDay,
            benchmarkSavingsPct: l.benchmarkSavingsPct,
            measuredSavingsPct: l.savingsPct,
            deviationPct: l.savingsPct - l.benchmarkSavingsPct,
            complianceResult: l.belowBand ? "out_of_band" : "in_band",
            approaching: false,
            pricingBasis: "fixed",
            consecutiveBreachCount: 0,
            savedKwh: l.savedKwh,
            savedValue: l.savedValue,
            amount: l.amount,
            coverageDays: l.coverageDays,
            basis: l.basis,
            invoiceLightCount: l.lightsBilled,
          },
        });
      }

      // The SAME invoice, unchanged (FEAT-110-AC-5) — only its owning
      // version moves, so every query that reads "the live invoice for a
      // released month" (the portal, the billing board) keeps finding it.
      await tx.billingInvoice.update({ where: { id: invoice.id }, data: { monthlyCalculationId: newCalc.id } });
      // Keeps the intake's own audit trail pointed at the current version,
      // for whoever looks up "which upload produced this month" later.
      await tx.invoiceIntake.updateMany({ where: { monthlyCalculationId: calc.id }, data: { monthlyCalculationId: newCalc.id } });

      return newCalc.id;
    });

    logger.info("billing.month_rederived", {
      actorId,
      societyId: calc.societyId,
      period: calc.period,
      fromCalculationId: calc.id,
      toCalculationId: newCalcId,
      trigger,
      flippedCircuits: derived.lines.filter((l) => oldBasisByCircuit.get(l.circuitId) === "agreed" && l.basis === "measured").map((l) => l.circuitId),
    });
    return newCalcId;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/**
 * Called after a reading commit for `circuitId`, from either convergence
 * point ADR-011 names. Resolves every live, released, invoice-sourced month
 * this circuit still has an `agreed` line on and re-derives each.
 */
export async function rederiveInvoiceMonthsForCircuit(circuitId: string, actorId: string): Promise<{ rederivedCalculationIds: string[] }> {
  const candidates = await db.circuitFeeLine.findMany({
    where: { circuitId, basis: "agreed", calculation: { source: "invoice", status: "released", supersededById: null } },
    select: { monthlyCalculationId: true },
    distinct: ["monthlyCalculationId"],
  });
  const rederivedCalculationIds: string[] = [];
  for (const c of candidates) {
    const newId = await rederiveOneMonth(c.monthlyCalculationId, actorId);
    if (newId) rederivedCalculationIds.push(newId);
  }
  return { rederivedCalculationIds };
}

/**
 * Called after a light-count change is recorded, corrected or voided on
 * `circuitId`: every live, released, invoice-sourced month from the change's
 * effective month on is re-derived, and versioned only if its figures moved.
 */
export async function rederiveInvoiceMonthsAfterRescale(circuitId: string, fromPeriod: string, actorId: string): Promise<{ rederivedCalculationIds: string[] }> {
  const candidates = await db.circuitFeeLine.findMany({
    where: { circuitId, calculation: { source: "invoice", status: "released", supersededById: null, period: { gte: fromPeriod } } },
    select: { monthlyCalculationId: true },
    distinct: ["monthlyCalculationId"],
  });
  const rederivedCalculationIds: string[] = [];
  for (const c of candidates) {
    const newId = await rederiveOneMonth(c.monthlyCalculationId, actorId, "rescale");
    if (newId) rederivedCalculationIds.push(newId);
  }
  return { rederivedCalculationIds };
}
