/**
 * CON-47 / ADR-011 / FEAT-110 — the stats behind an invoice-first month.
 *
 * The bill is the benchmark: Zoho raised it from the light count and the
 * per-light rate the agreement fixed, and nothing in this module recomputes
 * it — `amount` on every derived line is the invoice line's own figure,
 * carried through untouched. What this module derives is the money story the
 * society is owed (the user's own framing, 2026-09-15: "saved this much,
 * paid to FirsThing this much, and kept this much"):
 *
 *   AGREED basis — the fee IS FirsThing's share of the saving under the
 *   agreement (CON-11), so the saving is what the fee is a share OF:
 *     saved ₹   = fee ÷ FirsThing's share %      (₹14,050 ÷ 36% = ₹39,027.78)
 *     kept ₹    = saved ₹ − fee                   (₹24,977.78)
 *     saved kWh = saved ₹ ÷ the contract's unit electricity rate
 *   Every figure traces to the invoice line and the contract's term version
 *   (INV-02), and a society can check it against its own bill. A lump-sum
 *   deal has no share to divide by, so it falls back to the baseline
 *   arithmetic: (baseline ÷ metered) × billed × days × benchmark %.
 *
 *   MEASURED basis — where the circuit's readings for the month cover
 *   CON-12's floor AND read as a plausible saving (at or below CON-45's 80%
 *   suspect bound — a dead meter reads as a 97% saving, and 29 zero days in
 *   a real July export is exactly what that bound exists for):
 *     saved kWh = (baseline ÷ metered) × billed × days × measured %
 *     saved ₹   = saved kWh × rate;  kept ₹ = saved ₹ − fee
 *
 * Measured is preferred whenever it is credible; agreed is the fallback, and
 * every line says which it was (`basis`) and why it fell back, so a projected
 * figure can never be shown as a measured one (INV-02). A measured line below
 * the contract's band is reported (`belowBand`) and nothing more — no
 * deviation review, no adjustment: the month was billed and settled (CON-47).
 *
 * Pure, and the only writer of these figures: the SCR-094 preview and the
 * submit both call it, so preview and record cannot disagree, and there is
 * no path anywhere that accepts a derived figure as input (FEAT-110-AC-4).
 * Unrounded throughout — rounding happens once, at presentation (INV-02).
 */

import { prorateFinalMonth, prorateFirstMonth, type Proration } from "./billing-start";
import { measuredSavingsPct } from "./monthly-calculation";
import { SAVINGS_SUSPECT_ABOVE } from "./circuit-load";
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
  /** The SOCIETY's share of the saving; FirsThing's fee is (100 − this). Null on a lump-sum deal. */
  societyRevenueSharePct: number | null;
  /** ±5 / ±10 — informational here (`belowBand`), never a billing consequence. */
  tolerancePct: number | null;
  circuits: InvoiceMonthCircuit[];
  /** Set only when THIS period is the part's first billed month (CON-22). */
  firstMonthSignedAt?: Date | null;
  /** Set only when the part's term ends inside THIS period. */
  finalMonthEndsOn?: Date | null;
};

/** One stored day of readings for a circuit, with what is known about its completeness. */
export type DayReading = {
  /** YYYY-MM-DD */
  date: string;
  kWh: number;
  /** Rows the vendor wrote for the day (24 on an hourly export) — a row of zeros still counts here. */
  intervalCount: number | null;
  /** Hours that carried a non-zero reading, from the meter's own hourly store; null when no store covers the day. */
  dataHours: number | null;
};

export type CircuitMonthReadings = {
  days: DayReading[];
  readingIds: string[];
  rawFileIds: string[];
};

/**
 * Day validity (the user's rule, 2026-09-15): a day counts only when it is
 * COMPLETE — every hour carried a reading, the day used some energy, and the
 * saving it implies is one a working meter can produce. Everything else is
 * named for why it was left out, and the month says how many days it rests
 * on. The vendor writes a 0 for an hour the meter was offline, so "24 rows"
 * is not "24 hours of data" — a whole month of 24-row zero days (stage's
 * July 2026, 29 of them) is a meter that said nothing.
 */
export type DayClass = "complete" | "partial" | "offline" | "suspect";
export const FULL_DAY_HOURS = 24;
/** Complete days needed before a month's saving is called measured — the user's own example uses 4. */
export const MIN_COMPLETE_DAYS_FOR_MEASURED = 4;

export function classifyDay(day: DayReading, baselineKwhPerDay: number): DayClass {
  if (!(day.kWh > 0)) return "offline";
  const hours = day.dataHours ?? day.intervalCount;
  if (hours !== null && hours < FULL_DAY_HOURS) return "partial";
  const savings = baselineKwhPerDay > 0 ? (1 - day.kWh / baselineKwhPerDay) * 100 : 0;
  if (savings > SAVINGS_SUSPECT_ABOVE) return "suspect";
  return "complete";
}

export type DayTally = {
  complete: number;
  partial: number;
  offline: number;
  suspect: number;
  /** Days of the month with no row at all. */
  missing: number;
  daysInMonth: number;
  /** Σ kWh over the complete days only. */
  completeKwh: number;
};

export function tallyDays(days: DayReading[], baselineKwhPerDay: number, daysInMonth: number): DayTally {
  const t: DayTally = { complete: 0, partial: 0, offline: 0, suspect: 0, missing: 0, daysInMonth, completeKwh: 0 };
  for (const d of days) {
    const c = classifyDay(d, baselineKwhPerDay);
    t[c] += 1;
    if (c === "complete") t.completeKwh += d.kWh;
  }
  t.missing = Math.max(0, daysInMonth - days.length);
  return t;
}

/** The sentence the month carries about its readings — a warning when days were left out. */
export function readingsNote(t: DayTally): string | null {
  if (t.complete === t.daysInMonth) return null;
  const left: string[] = [];
  if (t.partial) left.push(`${t.partial} partial`);
  if (t.offline) left.push(`${t.offline} with the meter offline`);
  if (t.suspect) left.push(`${t.suspect} implausibly low`);
  if (t.missing) left.push(`${t.missing} not recorded`);
  const head = t.complete === 0 ? `No day of ${t.daysInMonth} had a complete reading` : `Only ${t.complete} of ${t.daysInMonth} days had complete readings`;
  return `${head}${left.length ? ` — ${left.join(", ")} — those days were not used` : ""}.`;
}

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
  /** The invoice line's own amount, untouched — what the society paid FirsThing. */
  amount: number;
  /** FirsThing's share of the saving under the agreement (100 − society share); null on a lump sum. */
  firsthingSharePct: number | null;
  /** What the society kept: saved ₹ − fee. */
  societyNet: number;
  /** COMPLETE days behind a measured line; 0 on an agreed one. */
  coverageDays: number;
  /** How the month's days classified, when any readings exist. */
  dayTally: DayTally | null;
  /** The warning the month carries about its readings, when days were left out. */
  readingsNote: string | null;
  /** Measured only: short of the benchmark by more than the tolerance. Informational. */
  belowBand: boolean | null;
  provenance: {
    benchmarkSource: BenchmarkSource;
    readingIds: string[];
    rawFileIds: string[];
    /** Why the basis fell back, when it did. */
    fallbackReason: string | null;
    /** How the agreed-basis saving was arrived at. */
    agreedMethod: "fee_over_share" | "baseline_arithmetic" | null;
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
    /** Σ saved − Σ fee: what the society kept. */
    societyNet: number;
  };
};

export function deriveInvoiceMonth(input: {
  period: string;
  parts: InvoiceMonthPart[];
  lines: InvoiceServiceLine[];
  readingsByCircuit: Record<string, CircuitMonthReadings | undefined>;
  minCompleteDays?: number;
}): DerivedMonth {
  const daysInMonth = daysInPeriod(input.period);
  const minComplete = input.minCompleteDays ?? MIN_COMPLETE_DAYS_FOR_MEASURED;

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
    const benchmark = circuit.benchmarkSavingsPct;
    const firsthingShare = part.societyRevenueSharePct === null ? null : 100 - part.societyRevenueSharePct;

    // Is the measured figure credible? Enough COMPLETE days, and a saving a
    // working meter can produce. Partial and offline days are named, never
    // averaged in — a zero day averaged in reads as a saving.
    let measuredPct: number | null = null;
    let fallbackReason: string | null = null;
    let dayTally: DayTally | null = null;
    let note: string | null = null;
    if (readings && readings.days.length > 0) {
      dayTally = tallyDays(readings.days, circuit.baselineKwhPerDay, daysInMonth);
      note = readingsNote(dayTally);
      if (dayTally.complete >= minComplete) {
        const pct = measuredSavingsPct({
          meteredKwh: dayTally.completeKwh,
          coverageDays: dayTally.complete,
          baselineKwhPerDay: circuit.baselineKwhPerDay,
        });
        if (pct > SAVINGS_SUSPECT_ABOVE) {
          fallbackReason = `Even the complete days show a ${pct.toFixed(1)}% saving — above the ${SAVINGS_SUSPECT_ABOVE}% bound a working meter can produce. Check the meter; the agreed figure is used.`;
        } else {
          measuredPct = pct;
        }
      } else {
        fallbackReason = `${dayTally.complete} complete day${dayTally.complete === 1 ? "" : "s"} of ${daysInMonth} — fewer than the ${minComplete} needed to measure the month; the agreed figure is used.`;
      }
    } else {
      fallbackReason = "No readings for this month.";
    }

    const baselineConsumptionKwh = (circuit.baselineKwhPerDay / circuit.meteredLightCount) * line.lightsBilled * billedDays;

    let basis: SavingsBasis;
    let savingsPct: number;
    let savedKwh: number;
    let savedValue: number;
    let agreedMethod: "fee_over_share" | "baseline_arithmetic" | null = null;
    if (measuredPct !== null) {
      basis = "measured";
      savingsPct = measuredPct;
      savedKwh = baselineConsumptionKwh * (savingsPct / 100);
      savedValue = savedKwh * part.unitElectricityRate;
    } else if (firsthingShare !== null && firsthingShare > 0 && line.amount > 0) {
      // The agreement's own arithmetic: the fee is FirsThing's share of the saving.
      basis = "agreed";
      agreedMethod = "fee_over_share";
      savingsPct = benchmark ?? 0;
      savedValue = line.amount / (firsthingShare / 100);
      savedKwh = part.unitElectricityRate > 0 ? savedValue / part.unitElectricityRate : 0;
    } else {
      if (benchmark === null) {
        notDerivable.push({ lineNo: line.lineNo, circuitId: line.circuitId, reason: "Not derivable — no credible readings, no revenue share to divide by, and no agreed benchmark." });
        continue;
      }
      basis = "agreed";
      agreedMethod = "baseline_arithmetic";
      savingsPct = benchmark;
      savedKwh = baselineConsumptionKwh * (savingsPct / 100);
      savedValue = savedKwh * part.unitElectricityRate;
    }

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
      firsthingSharePct: firsthingShare,
      societyNet: savedValue - line.amount,
      coverageDays: basis === "measured" ? dayTally!.complete : 0,
      dayTally,
      readingsNote: note,
      belowBand,
      provenance: {
        benchmarkSource: circuit.benchmarkSource,
        readingIds: basis === "measured" ? readings!.readingIds : [],
        rawFileIds: basis === "measured" ? readings!.rawFileIds : [],
        fallbackReason: basis === "measured" ? null : fallbackReason,
        agreedMethod,
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
      societyNet: lines.reduce((s, l) => s + l.societyNet, 0),
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
