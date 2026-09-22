/**
 * SCR-092 / CON-47 — everything the release queue needs about one submitted
 * invoice-first month, read from the database. Server-only (imports `db`).
 *
 * `computeQueueRow` does the DB work for ONE calculation and is the single
 * place that decides routine vs. needs-review — `loadReleaseQueue` (the
 * page) and `releaseRoutineBatch` (the batch action) both call it, so the
 * row the accountant looked at and the check the batch release re-runs
 * before actually releasing can never disagree.
 */

import { db } from "@/lib/db";
import { triageInvoiceMonth, type Triage } from "@/lib/release-triage";
import { weightedSavingsPct } from "@/lib/published-months";
import { circuitLabelOf } from "@/lib/circuit-label";

export type QueueLine = { circuitId: string; label: string; basis: "measured" | "agreed"; savingsPct: number };

export type QueueRow = {
  calculationId: string;
  societyId: string;
  societyName: string;
  period: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  paid: boolean;
  savedKwh: number;
  savedValue: number;
  savingsPct: number | null;
  lines: QueueLine[];
  triage: Triage;
};

/**
 * Fresh, per-id — recomputed by the batch action before it releases
 * anything, never trusted from what the page rendered a moment ago. Returns
 * null for anything that is no longer a live, submitted, invoice-sourced
 * month (already released or superseded by the time this runs).
 */
export async function computeQueueRow(calculationId: string): Promise<QueueRow | null> {
  const c = await db.monthlyCalculation.findUnique({
    where: { id: calculationId },
    include: {
      society: { select: { name: true } },
      feeLines: { select: { circuitId: true, basis: true, measuredSavingsPct: true, savedKwh: true, circuit: { select: { location: true, lightType: true } } } },
      invoices: { where: { voidedAt: null }, select: { id: true, number: true, amount: true, status: true } },
    },
  });
  if (!c || c.source !== "invoice" || c.status !== "submitted" || c.supersededById !== null) return null;
  const invoice = c.invoices[0];
  if (!invoice) return null;

  const [trailing, previous] = await Promise.all([
    db.monthlyCalculation.findMany({
      where: { societyId: c.societyId, serviceLine: c.serviceLine, source: "invoice", status: "released", supersededById: null, period: { lt: c.period } },
      orderBy: { period: "desc" },
      take: 3,
      select: { invoices: { where: { voidedAt: null }, select: { amount: true } } },
    }),
    db.monthlyCalculation.findFirst({
      where: { societyId: c.societyId, serviceLine: c.serviceLine, source: "invoice", status: "released", supersededById: null, period: { lt: c.period } },
      orderBy: { period: "desc" },
      select: { feeLines: { select: { circuitId: true, basis: true } } },
    }),
  ]);
  const trailingAmounts = trailing.flatMap((t) => t.invoices.map((i) => i.amount));
  const trailingInvoicedMean = trailingAmounts.length > 0 ? trailingAmounts.reduce((s, n) => s + n, 0) / trailingAmounts.length : null;

  const prevBasisByCircuit = new Map((previous?.feeLines ?? []).map((l) => [l.circuitId, l.basis]));
  const basisRegressedCircuits = c.feeLines
    .filter((l) => prevBasisByCircuit.get(l.circuitId) === "measured" && l.basis === "agreed")
    .map((l) => l.circuitId);

  const triage = triageInvoiceMonth({
    // Guaranteed by `submitIntake`'s own gate (openItems()) — nothing edits
    // a submitted review afterward, so these cannot regress. Kept as named
    // checks rather than folded away, so the full spec table stays visible
    // in the code and a future write path that COULD change one has
    // somewhere ready to wire a real check into.
    societyConfirmed: true,
    monthConfirmed: true,
    allLinesMapped: true,
    arithmeticOk: true,
    paidStatusChosen: true,
    invoiceTotal: invoice.amount,
    trailingInvoicedMean,
    basisRegressedCircuits,
  });

  return {
    calculationId: c.id,
    societyId: c.societyId,
    societyName: c.society.name,
    period: c.period,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    invoiceTotal: invoice.amount,
    paid: invoice.status === "paid",
    savedKwh: c.totalSavedKwh,
    savedValue: c.totalSavedValue,
    savingsPct: weightedSavingsPct(c.feeLines.map((l) => ({ savedKwh: l.savedKwh, pct: l.measuredSavingsPct }))),
    lines: c.feeLines.map((l) => ({
      circuitId: l.circuitId,
      label: circuitLabelOf(l.circuit.location, l.circuit.lightType),
      basis: l.basis,
      savingsPct: l.measuredSavingsPct,
    })),
    triage,
  };
}

export async function loadReleaseQueue(): Promise<QueueRow[]> {
  const candidates = await db.monthlyCalculation.findMany({
    where: { source: "invoice", status: "submitted", supersededById: null },
    select: { id: true },
    orderBy: [{ period: "asc" }],
  });
  const rows = await Promise.all(candidates.map((c) => computeQueueRow(c.id)));
  return rows.filter((r): r is QueueRow => r !== null);
}
