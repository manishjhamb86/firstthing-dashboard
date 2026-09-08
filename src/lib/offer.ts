// FEAT-027/028 — the offer's derived figures and its issue rules, as a pure
// module (same convention as demo-report.ts / benchmark-rescale.ts).

export type OfferCircuitTerm = {
  circuitId: string;
  lightType: string;
  location: string | null;
  meteredLightCount: number;
  representedLightCount: number;
  benchmarkSavingsPct: number;
  preInstallBaseline: number;
  projectedSavedKwhPerDay: number;
};

/**
 * How FirsThing's monthly fee is arrived at.
 *
 * CON-11's own model is a SHARE of what the retrofit saves. CON-01 amendment
 * (2026-09-08, the user's call): a counter may instead put a flat monthly
 * amount on the table — a society that wants a fixed figure rather than a
 * percentage of something it has to trust the arithmetic on.
 *
 * The two are alternatives, never both: a deal priced on a lump sum has no
 * share, which is why `revenueSharePct` is nullable rather than carrying a
 * sentinel somebody could read as an agreed percentage.
 */
export type PricingModel = "revenue_share" | "lump_sum";

export type OfferTerms = {
  tolerancePct: number;
  pricingModel: PricingModel;
  /** The SOCIETY's share, on a revenue-share offer. */
  revenueSharePct: number | null;
  /** The flat monthly fee, on a lump-sum offer. */
  lumpSumMonthlyFee: number | null;
  unitElectricityRate: number;
  termMonths: number;
  spareStockCount: number;
};

/**
 * The fee terms in one sentence, built in ONE place.
 *
 * The split is stated the way the blueprint states it and never the other way
 * round — this project has shipped that inversion twice — and a lump-sum deal
 * has to read as a lump sum on every surface that shows terms, or the offer,
 * the agreement, the contract record and the society's own portal will
 * disagree about what was agreed.
 */
export function describePricing(t: {
  pricingModel: PricingModel | string;
  revenueSharePct: number | null;
  lumpSumMonthlyFee: number | null;
}): string {
  if (t.pricingModel === "lump_sum") {
    return t.lumpSumMonthlyFee == null
      ? "Lump sum — amount not recorded"
      : `₹${t.lumpSumMonthlyFee.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}/month, a flat fee rather than a share`;
  }
  return t.revenueSharePct == null
    ? "Revenue share — split not recorded"
    : `${t.revenueSharePct}% society / ${100 - t.revenueSharePct}% FirsThing`;
}

// FEAT-027-AC-3 — tolerance, revenue-share and term are hard requirements to
// issue, because every downstream billing decision reads them. The unit rate
// joins them: FEAT-048/049 cannot turn saved kWh into rupees without it.
export type OfferBlocker =
  | "no-demo-report"
  | "no-benchmark-pct"
  | "invalid-tolerance"
  | "invalid-revenue-share"
  | "invalid-lump-sum"
  | "invalid-unit-rate"
  | "invalid-term"
  | "already-responded";

export const OFFER_BLOCKER_MESSAGE: Record<OfferBlocker, string> = {
  "no-demo-report":
    "There's no confirmed demo report to price this offer from. Generate it first, or use the demo-skip path with a negotiated benchmark (CON-25).",
  "no-benchmark-pct":
    "A negotiated-fixed offer needs the agreed benchmark percentage, and CON-20 puts it between 60% and 80%.",
  "invalid-tolerance": "Set a tolerance band — CON-01a allows ±5% or ±10%.",
  "invalid-revenue-share": "Set the revenue-share split as the society's share, between 1% and 99%.",
  "invalid-lump-sum":
    "Set the flat monthly fee this offer is priced at — a lump-sum deal is billed on that figure, so it cannot be left open.",
  "invalid-unit-rate": "Set the contracted unit electricity rate — the fee can't be derived without it.",
  "invalid-term": "Set the term length in months.",
  "already-responded": "This offer has already been responded to — record a counter as a new version instead.",
};

export const ALLOWED_TOLERANCE_PCT = [5, 10];
export const BENCHMARK_MIN_PCT = 60;
export const BENCHMARK_MAX_PCT = 80;

export function refuseOffer(input: {
  benchmarkSource: "measured" | "negotiated_fixed";
  demoReportId: string | null;
  negotiatedBenchmarkPct: number | null;
  terms: OfferTerms;
}): OfferBlocker | null {
  const { terms } = input;

  if (input.benchmarkSource === "measured" && !input.demoReportId) return "no-demo-report";
  if (input.benchmarkSource === "negotiated_fixed") {
    const pct = input.negotiatedBenchmarkPct;
    if (pct == null || !Number.isFinite(pct) || pct < BENCHMARK_MIN_PCT || pct > BENCHMARK_MAX_PCT) {
      return "no-benchmark-pct";
    }
  }

  if (!ALLOWED_TOLERANCE_PCT.includes(terms.tolerancePct)) return "invalid-tolerance";
  if (terms.pricingModel === "lump_sum") {
    if (
      terms.lumpSumMonthlyFee == null ||
      !Number.isFinite(terms.lumpSumMonthlyFee) ||
      terms.lumpSumMonthlyFee <= 0
    ) {
      return "invalid-lump-sum";
    }
  } else if (
    terms.revenueSharePct == null ||
    !Number.isFinite(terms.revenueSharePct) ||
    terms.revenueSharePct <= 0 ||
    terms.revenueSharePct >= 100
  ) {
    return "invalid-revenue-share";
  }
  if (!Number.isFinite(terms.unitElectricityRate) || terms.unitElectricityRate <= 0) return "invalid-unit-rate";
  if (!Number.isInteger(terms.termMonths) || terms.termMonths <= 0) return "invalid-term";

  return null;
}

/**
 * The monthly fee this offer projects.
 *
 * CON-11's split, stated the way the blueprint states it and *not* the other
 * way round: `revenueSharePct` is the SOCIETY's share (58 in the worked
 * example), so FirsThing's fee is the remaining 42%. This exact inversion has
 * already been shipped twice in this project — once across nine places in a
 * mockup deck, once in a Phase 9 unit test — so the parameter is named for
 * whose share it is, and the tests assert the party, not just the number.
 */
export function projectedMonthlyFee(input: {
  projectedSavedKwhPerDay: number;
  unitElectricityRate: number;
  societyRevenueSharePct: number | null;
  /** Set on a lump-sum offer — the fee IS this figure, nothing is derived. */
  pricingModel?: PricingModel;
  lumpSumMonthlyFee?: number | null;
  daysInMonth?: number;
}): number {
  // A lump sum is not projected from the demo numbers; it is the agreed
  // amount. The demo figures still appear on the offer as the evidence behind
  // it — what changes is that they no longer DERIVE the fee.
  if (input.pricingModel === "lump_sum") return input.lumpSumMonthlyFee ?? 0;
  const days = input.daysInMonth ?? 30;
  const monthlySavedValue = input.projectedSavedKwhPerDay * days * input.unitElectricityRate;
  return monthlySavedValue * ((100 - (input.societyRevenueSharePct ?? 0)) / 100);
}
