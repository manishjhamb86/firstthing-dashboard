// FEAT-027 — the offer as a WORKSHEET (2026-09-15, the user's redesign).
//
// The old form asked for a revenue-share percentage and derived a fee. That
// is backwards from how the deal is actually negotiated: the committee agrees
// how many lights go in, what those lights burn today, what the retrofit is
// expected to save, and what FirsThing is paid a month. The split is a
// consequence of those figures, not an input — so this module takes the
// figures the conversation actually has and derives everything else, in one
// place, so the form's live preview and the server's stored record cannot
// disagree.
//
// Pure, same convention as offer.ts / demo-report.ts: no db, unit-tested.

export const DAYS_IN_MONTH = 30;

export type WorksheetCircuitInput = {
  circuitId: string;
  lightType: string;
  location: string | null;
  meteredLightCount: number;
  /** kWh/day the METERED lights burned before the retrofit — null on the demo-skip path. */
  preInstallBaseline: number | null;
  /** What the demo measured — null when there was no demo. */
  demoBenchmarkSavingsPct: number | null;
  /** Lights to install as per the agreement — the population the fee is priced on (CON-11). */
  agreedLightCount: number;
  /** The benchmark the offer carries; equals the demo figure unless negotiated. */
  agreedBenchmarkSavingsPct: number;
  /**
   * Demo-skip only: the pre-install consumption of the agreed lights, typed
   * because nothing measured it. Ignored when a baseline exists.
   */
  preInstallKwhPerDayOverride?: number | null;
};

export type WorksheetCircuit = WorksheetCircuitInput & {
  /** kWh/day the agreed population burned before — extrapolated per light from the demo. */
  preInstallKwhPerDay: number;
  savedKwhPerDay: number;
  /** Whether the agreed benchmark departs from what the demo measured. */
  benchmarkNegotiated: boolean;
  /** True when the row cannot produce a figure (no baseline and nothing typed). */
  notDerivable: boolean;
};

export type WorksheetTotals = {
  agreedLightCount: number;
  preInstallKwhPerMonth: number;
  savedKwhPerMonth: number;
  /** Weighted by pre-install consumption, so one big circuit is not averaged with one small one. */
  savingsPct: number | null;
  unitElectricityRate: number;
  /** ₹/month the retrofit is expected to save at the unit rate. */
  savedValuePerMonth: number;
  /** ₹/month payable to FirsThing. */
  monthlyFee: number;
  /** ₹/month the society keeps: saved − fee. */
  societyKeepsPerMonth: number;
  /** The SOCIETY's share of the saving, as CON-11 states it. Null when nothing is saved. */
  societySharePct: number | null;
  firsthingSharePct: number | null;
};

export type Worksheet = { circuits: WorksheetCircuit[]; totals: WorksheetTotals };

export function deriveCircuitRow(c: WorksheetCircuitInput): WorksheetCircuit {
  let pre: number;
  let notDerivable = false;
  if (c.preInstallBaseline != null && c.meteredLightCount > 0) {
    // Per light, then scaled to the agreed population — never a society-wide
    // average (CON-11).
    pre = (c.preInstallBaseline / c.meteredLightCount) * c.agreedLightCount;
  } else if (c.preInstallKwhPerDayOverride != null && Number.isFinite(c.preInstallKwhPerDayOverride)) {
    pre = c.preInstallKwhPerDayOverride;
  } else {
    pre = 0;
    notDerivable = true;
  }
  const pct = Number.isFinite(c.agreedBenchmarkSavingsPct) ? c.agreedBenchmarkSavingsPct : 0;
  return {
    ...c,
    preInstallKwhPerDay: pre,
    savedKwhPerDay: pre * (pct / 100),
    benchmarkNegotiated: c.demoBenchmarkSavingsPct == null || Math.abs(c.demoBenchmarkSavingsPct - pct) > 1e-9,
    notDerivable,
  };
}

/**
 * The whole sheet from its inputs. `monthlyFee` is what FirsThing is paid;
 * the share percentages fall out of it rather than the other way round.
 */
export function deriveWorksheet(input: {
  circuits: WorksheetCircuitInput[];
  unitElectricityRate: number;
  monthlyFee: number;
  daysInMonth?: number;
}): Worksheet {
  const days = input.daysInMonth ?? DAYS_IN_MONTH;
  const circuits = input.circuits.map(deriveCircuitRow);
  const preDay = circuits.reduce((s, c) => s + c.preInstallKwhPerDay, 0);
  const savedDay = circuits.reduce((s, c) => s + c.savedKwhPerDay, 0);
  const rate = Number.isFinite(input.unitElectricityRate) ? input.unitElectricityRate : 0;
  const fee = Number.isFinite(input.monthlyFee) ? input.monthlyFee : 0;
  const savedKwhPerMonth = savedDay * days;
  const savedValue = savedKwhPerMonth * rate;
  const keeps = savedValue - fee;
  return {
    circuits,
    totals: {
      agreedLightCount: circuits.reduce((s, c) => s + c.agreedLightCount, 0),
      preInstallKwhPerMonth: preDay * days,
      savedKwhPerMonth,
      savingsPct: preDay > 0 ? (savedDay / preDay) * 100 : null,
      unitElectricityRate: rate,
      savedValuePerMonth: savedValue,
      monthlyFee: fee,
      societyKeepsPerMonth: keeps,
      societySharePct: savedValue > 0 ? (keeps / savedValue) * 100 : null,
      firsthingSharePct: savedValue > 0 ? (fee / savedValue) * 100 : null,
    },
  };
}

/** The unit rate that makes a typed monthly saving true — the other direction of the same identity. */
export function unitRateForSavedValue(savedKwhPerMonth: number, savedValuePerMonth: number): number | null {
  if (!(savedKwhPerMonth > 0) || !Number.isFinite(savedValuePerMonth)) return null;
  return savedValuePerMonth / savedKwhPerMonth;
}

export type WorksheetBlocker =
  | "no-circuits"
  | "invalid-light-count"
  | "invalid-benchmark"
  | "not-derivable"
  | "invalid-unit-rate"
  | "invalid-fee"
  | "fee-exceeds-saving";

export const WORKSHEET_BLOCKER_MESSAGE: Record<WorksheetBlocker, string> = {
  "no-circuits": "There is no circuit to price this offer on.",
  "invalid-light-count": "Every light type needs the number of lights the agreement installs — a whole number above zero.",
  "invalid-benchmark": "The agreed savings percentage has to sit inside CON-20's 60–80% band on every light type.",
  "not-derivable":
    "A light type has no pre-installation consumption to price from — the demo did not measure it, so type what those lights burn today.",
  "invalid-unit-rate": "Set the unit electricity rate — the saving cannot be turned into rupees without it.",
  "invalid-fee": "Set the monthly amount payable to FirsThing.",
  "fee-exceeds-saving":
    "The monthly fee is more than the whole projected saving — the society would keep less than nothing. Check the unit rate, the savings percentage or the fee.",
};

export function refuseWorksheet(
  ws: Worksheet,
  bounds: { benchmarkMinPct: number; benchmarkMaxPct: number },
): WorksheetBlocker | null {
  if (ws.circuits.length === 0) return "no-circuits";
  for (const c of ws.circuits) {
    if (!Number.isInteger(c.agreedLightCount) || c.agreedLightCount <= 0) return "invalid-light-count";
    if (
      !Number.isFinite(c.agreedBenchmarkSavingsPct) ||
      c.agreedBenchmarkSavingsPct < bounds.benchmarkMinPct ||
      c.agreedBenchmarkSavingsPct > bounds.benchmarkMaxPct
    ) {
      return "invalid-benchmark";
    }
    if (c.notDerivable) return "not-derivable";
  }
  if (!(ws.totals.unitElectricityRate > 0)) return "invalid-unit-rate";
  if (!(ws.totals.monthlyFee > 0)) return "invalid-fee";
  if (ws.totals.monthlyFee >= ws.totals.savedValuePerMonth) return "fee-exceeds-saving";
  return null;
}
