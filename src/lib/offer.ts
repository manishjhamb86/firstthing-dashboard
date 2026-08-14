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

export type OfferTerms = {
  tolerancePct: number;
  revenueSharePct: number;
  unitElectricityRate: number;
  termMonths: number;
  spareStockCount: number;
};

// FEAT-027-AC-3 — tolerance, revenue-share and term are hard requirements to
// issue, because every downstream billing decision reads them. The unit rate
// joins them: FEAT-048/049 cannot turn saved kWh into rupees without it.
export type OfferBlocker =
  | "no-demo-report"
  | "no-benchmark-pct"
  | "invalid-tolerance"
  | "invalid-revenue-share"
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
  if (!Number.isFinite(terms.revenueSharePct) || terms.revenueSharePct <= 0 || terms.revenueSharePct >= 100) {
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
  societyRevenueSharePct: number;
  daysInMonth?: number;
}): number {
  const days = input.daysInMonth ?? 30;
  const monthlySavedValue = input.projectedSavedKwhPerDay * days * input.unitElectricityRate;
  return monthlySavedValue * ((100 - input.societyRevenueSharePct) / 100);
}
