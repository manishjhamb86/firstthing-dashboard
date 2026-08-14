// CON-11 / CON-01 / CON-01c / CON-22 — the month's money, as a pure module.
//
// Every figure a society is billed on is computed here and nowhere else, for
// the same reason `benchmark-rescale.ts` and `offer.ts` exist: INV-02 needs a
// billed number to trace to something reproducible, and a formula spread
// across three Server Actions cannot be re-derived from a test.
//
// Three separate rules meet in this file and each has cost this project real
// money or real rework already:
//
//   · CON-11's extrapolation is PER LIGHT TYPE, never a society-wide average.
//     The corrected model meters one circuit per operating profile and scales
//     it only across the lights of its own type; the society total is the sum
//     of those independent extrapolations. Scaling one circuit onto every
//     light is the bug this constraint was rewritten to kill.
//   · The revenue split is named for WHOSE share it is. `societyRevenueSharePct`
//     is 58 in the worked example, so FirsThing's fee is the other 42%. This
//     exact inversion has shipped twice in this project — nine places in a
//     mockup deck, and once in this milestone's own planned unit test — so the
//     tests assert the party, not just the number.
//   · CON-01c's "sustained" is two CONSECUTIVE out-of-band months, and month 1
//     never adjusts. The streak is state that outlives a single month's
//     calculation, so it is an input here, not something this file discovers.

import { prorateFinalMonth, prorateFirstMonth, type Proration } from "./billing-start";

export type ComplianceResult = "in_band" | "out_of_band";
export type PricingBasis = "fixed" | "actual_metered";

/** One metered circuit's contracted terms for the month being calculated. */
export type CircuitTerms = {
  circuitId: string;
  lightType: string;
  /** Lights actually on the metered circuit. */
  meteredLightCount: number;
  /** Lights of this same type the circuit stands in for (CON-11). */
  representedLightCount: number;
  /** The contracted benchmark savings %, per circuit (CON-11/CON-20). */
  benchmarkSavingsPct: number;
  /** Pre-install consumption baseline in force for this month, per day. */
  baselineKwhPerDay: number;
  /** The fixed monthly fee this circuit's line was contracted at. */
  contractedMonthlyFee: number;
};

/** What the month's readings actually produced for that circuit. */
export type CircuitMonthReadings = {
  circuitId: string;
  /** Sum of the days that reported — never the calendar month (CON-12). */
  meteredKwh: number;
  /** Days with usable data. */
  coverageDays: number;
  daysInMonth: number;
};

export type CalculationTerms = {
  /** ±5 or ±10 — one value per contract, applied independently per circuit. */
  tolerancePct: number;
  /** The SOCIETY's share. FirsThing's fee is (100 - this). */
  societyRevenueSharePct: number;
  unitElectricityRate: number;
};

export type FeeLine = {
  circuitId: string;
  lightType: string;
  /** CON-11: (represented ÷ metered) × metered units. */
  extrapolatedConsumptionKwh: number;
  /** What the circuit actually saved this month, against its own baseline. */
  measuredSavingsPct: number;
  benchmarkSavingsPct: number;
  /** Signed distance from benchmark. Negative = underperforming. */
  deviationPct: number;
  complianceResult: ComplianceResult;
  /** CON-01d — in band, but within 20% of its edge. GOAL-08's early warning. */
  approaching: boolean;
  pricingBasis: PricingBasis;
  /** Consecutive out-of-band months INCLUDING this one (CON-01c). */
  consecutiveBreachCount: number;
  savedKwh: number;
  savedValue: number;
  /** FirsThing's fee for this circuit, before any proration. */
  amount: number;
};

/**
 * CON-11's extrapolation, on its own so the ratio is testable in isolation.
 *
 * Not rounded. This number multiplies a rupee figure two steps later, and a
 * rounding here is a rounding in what the society is billed (INV-02).
 */
export function extrapolate(input: {
  meteredKwh: number;
  meteredLightCount: number;
  representedLightCount: number;
}): number {
  if (input.meteredLightCount <= 0) {
    throw new Error("A metered circuit with no metered lights cannot extrapolate.");
  }
  return (input.representedLightCount / input.meteredLightCount) * input.meteredKwh;
}

/**
 * The measured savings % for the month, against the baseline in force.
 *
 * Compared per DAY, not per month: a month with 25 of 31 days reporting has a
 * smaller total through no fault of the lighting, and dividing that total by
 * a full-month baseline would read as a saving the circuit did not make. This
 * is the same trap `reading-coverage.ts` documents on the other side.
 */
export function measuredSavingsPct(input: {
  meteredKwh: number;
  coverageDays: number;
  baselineKwhPerDay: number;
}): number {
  if (input.coverageDays <= 0 || input.baselineKwhPerDay <= 0) return 0;
  const actualPerDay = input.meteredKwh / input.coverageDays;
  return ((input.baselineKwhPerDay - actualPerDay) / input.baselineKwhPerDay) * 100;
}

/**
 * CON-01: the monthly reading is a COMPLIANCE CHECK against the contracted
 * band, not a repricing input. Saving *more* than the benchmark is never a
 * breach — the band is one-sided in effect, because a society that saves 80%
 * against a 70% benchmark has no complaint and FirsThing has no shortfall.
 * Only a shortfall beyond the band is out of band.
 */
export function evaluateCompliance(input: {
  measuredSavingsPct: number;
  benchmarkSavingsPct: number;
  tolerancePct: number;
}): { deviationPct: number; complianceResult: ComplianceResult; approaching: boolean } {
  const band = Math.abs(input.tolerancePct);
  const deviationPct = input.measuredSavingsPct - input.benchmarkSavingsPct;
  const complianceResult: ComplianceResult = deviationPct < -band ? "out_of_band" : "in_band";

  // CON-01d — "approaching" is within 20% of the band edge, scaled to each
  // contract's own band rather than a fixed number of percentage points: a
  // ±5% contract goes amber at 4% short, a ±10% contract at 8%. GOAL-08 asks
  // to flag a society *before* it crosses, and a fixed threshold would fire
  // constantly on one contract shape and never on the other.
  const amberEdge = band * 0.8;
  const approaching = complianceResult === "in_band" && deviationPct <= -amberEdge;

  return { deviationPct, complianceResult, approaching };
}

/**
 * CON-01c — "sustained" is two consecutive out-of-band months, and the flip
 * needs a FirsThing-attributable, uncorrected cause (CON-01b). An excluded,
 * society-caused shortfall leaves the bill unchanged however long it runs,
 * which is why `attributable` is a required input rather than an assumption.
 *
 * Month 1 out of band raises the review and starts the correction window; it
 * never adjusts its own bill. That asymmetry is the constraint's own wording
 * ("must be corrected within a month at no cost, or the invoice is adjusted")
 * and is the single most expensive thing in this file to get backwards.
 */
export function resolvePricingBasis(input: {
  complianceResult: ComplianceResult;
  priorConsecutiveBreaches: number;
  /** The prior month's review decided FirsThing-attributable and uncorrected. */
  priorBreachAttributableAndUncorrected: boolean;
}): { pricingBasis: PricingBasis; consecutiveBreachCount: number } {
  if (input.complianceResult === "in_band") {
    return { pricingBasis: "fixed", consecutiveBreachCount: 0 };
  }
  const consecutiveBreachCount = input.priorConsecutiveBreaches + 1;
  const sustained = consecutiveBreachCount >= 2 && input.priorBreachAttributableAndUncorrected;
  return { pricingBasis: sustained ? "actual_metered" : "fixed", consecutiveBreachCount };
}

/**
 * One circuit's fee line.
 *
 * `fixed` is CON-01's normal case: the bill is the contracted monthly amount,
 * not a fresh computation from this month's reading. `actual_metered` is the
 * adjusted case, and only then does the month's own measured saving derive
 * the amount.
 */
export function calculateFeeLine(input: {
  terms: CircuitTerms;
  readings: CircuitMonthReadings;
  contract: CalculationTerms;
  priorConsecutiveBreaches: number;
  priorBreachAttributableAndUncorrected: boolean;
}): FeeLine {
  const { terms, readings, contract } = input;

  const extrapolatedConsumptionKwh = extrapolate({
    meteredKwh: readings.meteredKwh,
    meteredLightCount: terms.meteredLightCount,
    representedLightCount: terms.representedLightCount,
  });

  const measured = measuredSavingsPct({
    meteredKwh: readings.meteredKwh,
    coverageDays: readings.coverageDays,
    baselineKwhPerDay: terms.baselineKwhPerDay,
  });

  const { deviationPct, complianceResult, approaching } = evaluateCompliance({
    measuredSavingsPct: measured,
    benchmarkSavingsPct: terms.benchmarkSavingsPct,
    tolerancePct: contract.tolerancePct,
  });

  const { pricingBasis, consecutiveBreachCount } = resolvePricingBasis({
    complianceResult,
    priorConsecutiveBreaches: input.priorConsecutiveBreaches,
    priorBreachAttributableAndUncorrected: input.priorBreachAttributableAndUncorrected,
  });

  // The saving the society is credited with. On a `fixed` line this is
  // evidence shown on the savings report; on an `actual_metered` line it is
  // also what derives the amount.
  const savedKwh = extrapolatedConsumptionKwh * (terms.benchmarkSavingsPct / 100);
  const savedValue = savedKwh * contract.unitElectricityRate;
  const firsthingSharePct = 100 - contract.societyRevenueSharePct;

  const amount =
    pricingBasis === "fixed"
      ? terms.contractedMonthlyFee
      : extrapolatedConsumptionKwh *
        (measured / 100) *
        contract.unitElectricityRate *
        (firsthingSharePct / 100);

  return {
    circuitId: terms.circuitId,
    lightType: terms.lightType,
    extrapolatedConsumptionKwh,
    measuredSavingsPct: measured,
    benchmarkSavingsPct: terms.benchmarkSavingsPct,
    deviationPct,
    complianceResult,
    approaching,
    pricingBasis,
    consecutiveBreachCount,
    savedKwh,
    savedValue,
    amount,
  };
}

/**
 * The fee a circuit is contracted at, from its own benchmark and terms.
 *
 * This is CON-11's own worked example read forwards: extrapolated consumption
 * × benchmark % = saved units, × unit rate = saved rupees, × FirsThing's share
 * = the fee. Used to set `contractedMonthlyFee` at contract time and asserted
 * by TC-048-1.
 */
export function contractedFeeFor(input: {
  extrapolatedConsumptionKwh: number;
  benchmarkSavingsPct: number;
  unitElectricityRate: number;
  societyRevenueSharePct: number;
}): { savedKwh: number; savedValue: number; firsthingFee: number } {
  const savedKwh = input.extrapolatedConsumptionKwh * (input.benchmarkSavingsPct / 100);
  const savedValue = savedKwh * input.unitElectricityRate;
  const firsthingFee = savedValue * ((100 - input.societyRevenueSharePct) / 100);
  return { savedKwh, savedValue, firsthingFee };
}

export type MonthlyTotals = {
  feeLines: FeeLine[];
  /** Sum of the per-circuit extrapolations — never one circuit scaled up. */
  totalExtrapolatedKwh: number;
  totalSavedKwh: number;
  totalSavedValue: number;
  /** FirsThing's fee before proration. */
  subtotal: number;
  /** Set only on a contract's first billed month (CON-22). */
  proration: Proration | null;
  /** What the invoice is raised for. */
  total: number;
};

/**
 * The society's month.
 *
 * The society total is the SUM of independent per-type extrapolations. There
 * is deliberately no path in this module that averages across light types or
 * scales a single circuit onto the society's whole light count — CON-11 was
 * rewritten specifically because that biases every bill for the term.
 */
export function calculateMonth(input: {
  circuits: Array<{
    terms: CircuitTerms;
    readings: CircuitMonthReadings;
    priorConsecutiveBreaches: number;
    priorBreachAttributableAndUncorrected: boolean;
  }>;
  contract: CalculationTerms;
  /** The completion-certificate signature date, on the first billed month only. */
  firstMonthSignedAt?: Date | null;
  /** The last served day, on a termination month only (FEAT-051-AC-5). */
  finalMonthEndsOn?: Date | null;
}): MonthlyTotals {
  const feeLines = input.circuits.map((c) =>
    calculateFeeLine({
      terms: c.terms,
      readings: c.readings,
      contract: input.contract,
      priorConsecutiveBreaches: c.priorConsecutiveBreaches,
      priorBreachAttributableAndUncorrected: c.priorBreachAttributableAndUncorrected,
    }),
  );

  const totalExtrapolatedKwh = feeLines.reduce((s, l) => s + l.extrapolatedConsumptionKwh, 0);
  const totalSavedKwh = feeLines.reduce((s, l) => s + l.savedKwh, 0);
  const totalSavedValue = feeLines.reduce((s, l) => s + l.savedValue, 0);
  const subtotal = feeLines.reduce((s, l) => s + l.amount, 0);

  // CON-22's proration applies to the whole month's fee rather than to each
  // line separately, so the prorated total can never disagree with the
  // monthly figure the society accepted by a per-line rounding drift.
  const proration = input.firstMonthSignedAt
    ? prorateFirstMonth(input.firstMonthSignedAt)
    : input.finalMonthEndsOn
      ? prorateFinalMonth(input.finalMonthEndsOn)
      : null;
  const total = proration ? subtotal * proration.fraction : subtotal;

  return {
    feeLines,
    totalExtrapolatedKwh,
    totalSavedKwh,
    totalSavedValue,
    subtotal,
    proration,
    total,
  };
}

/**
 * Rounding happens once, here, at the point a figure becomes money.
 *
 * Everything upstream is unrounded on purpose (INV-02): rounding early
 * compounds, and a society auditing a figure has to be able to reproduce it.
 * Indian invoicing is to paise, and `Math.round` on a scaled integer avoids
 * the classic `toFixed` half-even surprise.
 */
export function toRupees(amount: number): number {
  return Math.round(amount * 100) / 100;
}
