/**
 * A circuit's benchmark, derived from the demos that count.
 *
 * A circuit can be demonstrated more than once, and why decides what the
 * benchmark is (the user, 2026-08-27):
 *
 *   - the first demo ran badly, so it is REJECTED and a second done — the
 *     surviving demo alone decides the benchmark;
 *   - the society is not confident in the first, so a second is run at their
 *     request — both are INCLUDED and the benchmark is the mean of their
 *     savings percentages.
 *
 * The mean is of the PERCENTAGES, not of the consumption. That is existing
 * practice and it is not the same number: Aditya Urban Casa's two demos are
 * 48.28% on 100 lights and 85.19% on 22, whose mean is 66.72% — the figure
 * its signed agreement carries — where weighting by consumption would give
 * 55.97%.
 */

/** CON-20's band. A demo result outside it is not a benchmark. */
export const BAND_MIN_PCT = 60;
export const BAND_MAX_PCT = 80;

export type DemoInput = {
  id: string;
  sequence: number;
  savingsPct: number;
  /** A rejected demo is kept on record and takes no part in the figure. */
  rejected: boolean;
};

export type BenchmarkOverride = {
  pct: number;
  reason: string;
} | null;

export type BenchmarkBasis =
  | { kind: "none"; reason: "no-demos" | "all-rejected" }
  | { kind: "single"; demoId: string; raw: number }
  | { kind: "average"; demoIds: string[]; raw: number }
  | { kind: "override"; raw: number | null; overridePct: number; reason: string };

export type DerivedBenchmark = {
  /**
   * What to store and bill against — null when nothing decides it.
   *
   * Never rounded (the user, 2026-08-27): a stored benchmark is either what
   * the demos measured or what someone deliberately chose, and rounding
   * would make it a third thing that is neither. Anyone wanting 64% rather
   * than 64.16% sets it as an override, which is recorded.
   */
  pct: number | null;
  /** What the demos give, before any override. */
  raw: number | null;
  basis: BenchmarkBasis;
  /**
   * Whether the DEMOS put this circuit inside CON-20's band — judged on what
   * they measured, never on an override, so setting one by hand cannot make
   * FEAT-015's review quietly disappear.
   */
  inBand: boolean;
};

export function deriveBenchmark(
  demos: DemoInput[],
  override: BenchmarkOverride = null,
): DerivedBenchmark {
  const live = demos.filter((d) => !d.rejected).sort((a, b) => a.sequence - b.sequence);

  let raw: number | null = null;
  let basis: BenchmarkBasis;

  if (live.length === 0) {
    basis = { kind: "none", reason: demos.length === 0 ? "no-demos" : "all-rejected" };
  } else if (live.length === 1) {
    raw = live[0].savingsPct;
    basis = { kind: "single", demoId: live[0].id, raw };
  } else {
    raw = live.reduce((sum, d) => sum + d.savingsPct, 0) / live.length;
    basis = { kind: "average", demoIds: live.map((d) => d.id), raw };
  }

  const inBand = raw !== null && raw >= BAND_MIN_PCT && raw <= BAND_MAX_PCT;

  if (override) {
    return {
      pct: override.pct,
      raw,
      basis: { kind: "override", raw, overridePct: override.pct, reason: override.reason },
      inBand,
    };
  }
  return { pct: raw, raw, basis, inBand };
}

/** How the figure came about, for the operator reading the screen. */
export function describeBasis(b: BenchmarkBasis): string {
  switch (b.kind) {
    case "none":
      return b.reason === "no-demos"
        ? "No demo recorded yet"
        : "Every demo on this circuit was rejected — nothing decides the benchmark";
    case "single":
      return "From the one demo that counts";
    case "average":
      return `Mean of ${b.demoIds.length} demos' savings percentages`;
    case "override":
      return b.raw === null
        ? "Set by hand — no demo figure to compare against"
        : `Set by hand, over a measured ${b.raw.toFixed(2)}%`;
  }
}
