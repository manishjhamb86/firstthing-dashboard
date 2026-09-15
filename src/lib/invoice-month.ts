/**
 * CON-47 / ADR-011 / FEAT-110 — the stats behind an invoice-first month.
 *
 * The bill is the benchmark: Zoho raised it from the light count and the
 * per-light rate the agreement fixed, and nothing in this module recomputes
 * it — `amount` on every derived line is the invoice line's own figure,
 * carried through untouched. What this module derives is what the society
 * SAVED that month, which the invoice does not carry:
 *
 *   baseline consumption of the billed lights
 *     = (baseline kWh/day ÷ metered lights) × lights billed × billed days
 *   savings %  = the circuit's MEASURED savings for the month, where its
 *                readings cover CON-12's floor — else the AGREED benchmark
 *   saved kWh  = baseline consumption × savings %
 *   saved ₹    = saved kWh × the contract's unit electricity rate
 *
 * Measured is preferred whenever it exists; agreed is the fallback, and every
 * line says which it was (`basis`) so a projected figure can never be shown
 * as a measured one (INV-02). A measured line below the contract's band is
 * reported (`belowBand`) and nothing more — no deviation review, no
 * adjustment: the month was billed on the benchmark and settled (CON-47 b).
 *
 * Pure, and the only writer of these figures: the SCR-094 preview and the
 * submit both call it, so preview and record cannot disagree, and there is
 * no path anywhere that accepts a derived figure as input (FEAT-110-AC-4).
 * Unrounded throughout — rounding happens once, at presentation (INV-02).
 */

import { prorateFinalMonth, prorateFirstMonth, type Proration } from "./billing-start";
import { measuredSavingsPct } from "./monthly-calculation";
import { COVERAGE_FLOOR_DAYS } from "./reading-coverage";
import { daysInPeriod } from "./reading-normalize";

export type SavingsBasis = "measured" | "agreed";
export type BenchmarkSource = "demo" | "override" | "none";

/** One SERVICE line of the invoice, already mapped to a circuit by the operator. */
export type InvoiceServiceLine = {
  lineNo: number;
  circuitId: string;
  /** The Qty printed on the invoice — the count the society was billed for (CON-47 d). */
  lightsBilled: number;
  /** The line's pre-tax Amount as printed. Never recomputed. */
  amount: number;
};

export type InvoiceMonthCircuit = {
  circuitId: string;
  lightType: string;
  meteredLightCount: number;
  /** The circuit RECORD's population — compared against `lightsBilled`, never used in its place. */
  representedLightCount: number;
  /** The baseline in force for this period (INV-07 replay), or null when none was ever commissioned. */
  baselineKwhPerDay: number | null;
  benchmarkSavingsPct: number | null;
  benchmarkSource: BenchmarkSource;
};

/** One deal's contract terms and the circuits billing under it (CON-24 as amended). */
export type InvoiceMonthPart = {
  contractId: string;
  /** The term version in force — recorded on the month for provenance; not used by the arithmetic. */
  termVersionId?: string;
  unitElectricityRate: number;
  /** ±5 / ±10 — informational here (`belowBand`), never a billing consequence. */
  tolerancePct: number | null;
  circuits: InvoiceMonthCircuit[];
  /** Set only when THIS period is the part's first billed month (CON-22). */
  firstMonthSignedAt?: Date | null;
  /** Set only when the part's term ends inside THIS period. */
  finalMonthEndsOn?: Date | null;
};

export type CircuitMonthReadings = {
  meteredKwh: number;
  coverageDays: number;
  readingIds: string[];
  rawFileIds: string[];
};

export type DerivedLine = {
  lineNo: number;
  circuitId: string;
  contractId: string;
  lightType: string;
  basis: SavingsBasis;
  lightsBilled: number;
  /** The circuit record's count when it differed from the invoice's; null when they agreed. */
  countDisagreement: number | null;
  billedDays: number;
  daysInMonth: number;
  proration: Proration | null;
  baselineKwhPerDay: number;
  benchmarkSavingsPct: number;
  /** The % this line's saving was computed at — measured or the benchmark, per `basis`. */
  savingsPct: number;
  baselineConsumptionKwh: number;
  /** What the billed lights are taken to have drawn: baseline − saved. */
  extrapolatedConsumptionKwh: number;
  savedKwh: number;
  savedValue: number;
  /** The invoice line's own amount, untouched. */
  amount: number;
  /** Days of readings behind a measured line; 0 on an agreed one. */
  coverageDays: number;
  /** Measured only: short of the benchmark by more than the tolerance. Informational. */
  belowBand: boolean | null;
  provenance: {
    benchmarkSource: BenchmarkSource;
    readingIds: string[];
    rawFileIds: string[];
    /** Why the basis fell back, when it did. */
    fallbackReason: string | null;
  };
};

export type NotDerivableLine = { lineNo: number; circuitId: string; reason: string };

export type DerivedMonth = {
  period: string;
  daysInMonth: number;
  lines: DerivedLine[];
  /** FEAT-110-AC-9 — a line whose circuit cannot carry a figure. The month still submits. */
  notDerivable: NotDerivableLine[];
  totals: {
    savedKwh: number;
    savedValue: number;
    extrapolatedConsumptionKwh: number;
    /** Σ of the service lines' own amounts — the fee the society was billed, pre-tax. */
    amount: number;
  };
};

export function deriveInvoiceMonth(input: {
  period: string;
  parts: InvoiceMonthPart[];
  lines: InvoiceServiceLine[];
  readingsByCircuit: Record<string, CircuitMonthReadings | undefined>;
  coverageFloorDays?: number;
}): DerivedMonth {
  const daysInMonth = daysInPeriod(input.period);
  const floor = input.coverageFloorDays ?? COVERAGE_FLOOR_DAYS;

  const lookup = new Map<string, { circuit: InvoiceMonthCircuit; part: InvoiceMonthPart }>();
  for (const part of input.parts) {
    for (const circuit of part.circuits) lookup.set(circuit.circuitId, { circuit, part });
  }

  const lines: DerivedLine[] = [];
  const notDerivable: NotDerivableLine[] = [];

  for (const line of input.lines) {
    const hit = lookup.get(line.circuitId);
    if (!hit) {
      notDerivable.push({ lineNo: line.lineNo, circuitId: line.circuitId, reason: "This circuit is not on any contract for the period." });
      continue;
    }
    const { circuit, part } = hit;
    if (circuit.baselineKwhPerDay === null || !(circuit.baselineKwhPerDay > 0)) {
      notDerivable.push({ lineNo: line.lineNo, circuitId: line.circuitId, reason: "Not derivable — no commissioned baseline." });
      continue;
    }
    if (!(circuit.meteredLightCount > 0)) {
      notDerivable.push({ lineNo: line.lineNo, circuitId: line.circuitId, reason: "Not derivable — the circuit records no metered lights." });
      continue;
    }
    if (!(line.lightsBilled > 0)) {
      notDerivable.push({ lineNo: line.lineNo, circuitId: line.circuitId, reason: "Not derivable — the invoice line bills no lights." });
      continue;
    }

    const proration: Proration | null = part.firstMonthSignedAt
      ? prorateFirstMonth(part.firstMonthSignedAt)
      : part.finalMonthEndsOn
        ? prorateFinalMonth(part.finalMonthEndsOn)
        : null;
    const billedDays = proration ? proration.proratedDays : daysInMonth;

    const readings = input.readingsByCircuit[circuit.circuitId];
    const hasMeasured = !!readings && readings.coverageDays >= floor && readings.coverageDays > 0;
    const benchmark = circuit.benchmarkSavingsPct;

    let basis: SavingsBasis;
    let savingsPct: number;
    let fallbackReason: string | null = null;
    if (hasMeasured) {
      basis = "measured";
      savingsPct = measuredSavingsPct({
        meteredKwh: readings.meteredKwh,
        coverageDays: readings.coverageDays,
        baselineKwhPerDay: circuit.baselineKwhPerDay,
      });
    } else {
      if (benchmark === null) {
        notDerivable.push({ lineNo: line.lineNo, circuitId: line.circuitId, reason: "Not derivable — no readings for the month and no agreed benchmark." });
        continue;
      }
      basis = "agreed";
      savingsPct = benchmark;
      fallbackReason = readings && readings.coverageDays > 0
        ? `Readings cover ${readings.coverageDays} of ${daysInMonth} days — below the ${floor}-day floor.`
        : "No readings for this month.";
    }

    const baselineConsumptionKwh = (circuit.baselineKwhPerDay / circuit.meteredLightCount) * line.lightsBilled * billedDays;
    const savedKwh = baselineConsumptionKwh * (savingsPct / 100);
    const savedValue = savedKwh * part.unitElectricityRate;

    const belowBand =
      basis === "measured" && benchmark !== null && part.tolerancePct !== null
        ? savingsPct < benchmark - part.tolerancePct
        : null;

    lines.push({
      lineNo: line.lineNo,
      circuitId: circuit.circuitId,
      contractId: part.contractId,
      lightType: circuit.lightType,
      basis,
      lightsBilled: line.lightsBilled,
      countDisagreement: line.lightsBilled === circuit.representedLightCount ? null : circuit.representedLightCount,
      billedDays,
      daysInMonth,
      proration,
      baselineKwhPerDay: circuit.baselineKwhPerDay,
      benchmarkSavingsPct: benchmark ?? savingsPct,
      savingsPct,
      baselineConsumptionKwh,
      extrapolatedConsumptionKwh: baselineConsumptionKwh - savedKwh,
      savedKwh,
      savedValue,
      amount: line.amount,
      coverageDays: basis === "measured" ? readings!.coverageDays : 0,
      belowBand,
      provenance: {
        benchmarkSource: circuit.benchmarkSource,
        readingIds: basis === "measured" ? readings!.readingIds : [],
        rawFileIds: basis === "measured" ? readings!.rawFileIds : [],
        fallbackReason,
      },
    });
  }

  return {
    period: input.period,
    daysInMonth,
    lines,
    notDerivable,
    totals: {
      savedKwh: lines.reduce((s, l) => s + l.savedKwh, 0),
      savedValue: lines.reduce((s, l) => s + l.savedValue, 0),
      extrapolatedConsumptionKwh: lines.reduce((s, l) => s + l.extrapolatedConsumptionKwh, 0),
      amount: lines.reduce((s, l) => s + l.amount, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// FEAT-109-AC-3 — the invoice's own arithmetic. The only reconciliation
// available while the platform computes no bill of its own (FEAT-101's
// scope note): each line's Qty × Rate − Discount against its printed Amount,
// then the lines against the sub-total, tax and total.
// ---------------------------------------------------------------------------

/** Zoho prints paise; a line reconciles when the printed figure is within half a paisa. */
export const ARITHMETIC_TOLERANCE = 0.005;

export type PrintedLine = { lineNo: number; qty: number; rate: number; discount: number; amount: number };

export type ArithmeticCheck = { ok: true } | { ok: false; expected: number; printed: number; note: string };

export function checkLineArithmetic(line: PrintedLine): ArithmeticCheck {
  const expected = line.qty * line.rate - line.discount;
  if (Math.abs(expected - line.amount) <= ARITHMETIC_TOLERANCE) return { ok: true };
  return {
    ok: false,
    expected,
    printed: line.amount,
    note: `Line ${line.lineNo}: ${fmt(line.qty)} × ₹${fmt(line.rate)} − ₹${fmt(line.discount)} = ₹${fmt(expected)}, but the invoice prints ₹${fmt(line.amount)}.`,
  };
}

export type PrintedTotals = { subtotal: number; taxAmount: number; total: number; taxPct: number | null };

export type TotalsCheck = {
  subtotal: ArithmeticCheck;
  tax: ArithmeticCheck;
  total: ArithmeticCheck;
  ok: boolean;
};

export function checkTotalsArithmetic(lines: PrintedLine[], totals: PrintedTotals): TotalsCheck {
  const linesSum = lines.reduce((s, l) => s + l.amount, 0);
  const subtotal: ArithmeticCheck =
    Math.abs(linesSum - totals.subtotal) <= ARITHMETIC_TOLERANCE
      ? { ok: true }
      : { ok: false, expected: linesSum, printed: totals.subtotal, note: `The lines add to ₹${fmt(linesSum)}, but the sub-total prints ₹${fmt(totals.subtotal)}.` };
  let tax: ArithmeticCheck = { ok: true };
  if (totals.taxPct !== null) {
    const expectedTax = totals.subtotal * (totals.taxPct / 100);
    // Tax is rounded to the rupee or the paisa by Zoho; allow a rupee of rounding across the lines.
    if (Math.abs(expectedTax - totals.taxAmount) > 1) {
      tax = { ok: false, expected: expectedTax, printed: totals.taxAmount, note: `${fmt(totals.taxPct)}% of ₹${fmt(totals.subtotal)} is ₹${fmt(expectedTax)}, but the tax prints ₹${fmt(totals.taxAmount)}.` };
    }
  }
  const expectedTotal = totals.subtotal + totals.taxAmount;
  const total: ArithmeticCheck =
    Math.abs(expectedTotal - totals.total) <= ARITHMETIC_TOLERANCE
      ? { ok: true }
      : { ok: false, expected: expectedTotal, printed: totals.total, note: `Sub-total plus tax is ₹${fmt(expectedTotal)}, but the total prints ₹${fmt(totals.total)}.` };
  return { subtotal, tax, total, ok: subtotal.ok && tax.ok && total.ok };
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
