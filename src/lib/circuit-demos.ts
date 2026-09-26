import { excludedKwhAt, type Exclusion } from "@/lib/circuit-load";
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

// ── The circuit's figures from its demos (2026-09-26) ──────────────────────

export type DemoFiguresInput = {
  id: string;
  sequence: number;
  rejected: boolean;
  voided: boolean;
  /** How this demo combines with the one before it; the first demo's is ignored. */
  combine: "batch" | "rerun";
  meteredLightCount: number;
  /** The accepted pre-install average (kWh/day), or null until accepted. */
  preAverage: number | null;
  /** The accepted post-install average, or null until accepted. */
  postAverage: number | null;
};

export type CircuitFigures = {
  /** Baseline in force (kWh/day), or null when no demo has an accepted pre set. */
  baseline: number | null;
  /** Lights the baseline covers — a batch demo on different lights adds its own. */
  meteredLightCount: number | null;
  /** The circuit's post-install average, combined the same way as the baseline. */
  postAverage: number | null;
  /** Each counted demo's own measured saving. */
  perDemo: Array<{ id: string; savingsPct: number | null }>;
  benchmark: DerivedBenchmark;
};

/**
 * A demo's saving on the lights it replaced. `ex` describes what stayed on
 * the circuit unreplaced (exclusionOf): its draw X at this before-average
 * comes off both the before and after averages, so the saving is
 * (pre − post) / (pre − X).
 */
export function demoSavingsPct(pre: number | null, post: number | null, ex?: Exclusion): number | null {
  if (pre === null || post === null) return null;
  const replacedPre = pre - excludedKwhAt(pre, ex);
  if (replacedPre <= 0) return null;
  return ((pre - post) / replacedPre) * 100;
}

/**
 * The one derivation of a circuit's baseline and benchmark (2026-09-26).
 *
 * Demos are taken in sequence. The first opens a group; a `rerun` joins the
 * group before it (same lights again — its baseline averages in); a `batch`
 * opens a new group (different lights — its baseline and light count add up).
 * The benchmark is the mean of the counted demos' percentages, as before,
 * unless an agreed override is set.
 */
export function deriveCircuitFigures(
  demos: readonly DemoFiguresInput[],
  override: BenchmarkOverride = null,
  /** What stayed on the circuit unreplaced (exclusionOf). */
  ex?: Exclusion,
): CircuitFigures {
  const live = demos.filter((d) => !d.rejected && !d.voided).sort((a, b) => a.sequence - b.sequence);
  const groups: Array<{ pre: number[]; post: number[]; lights: number }> = [];
  for (const d of live) {
    if (d.preAverage === null) continue;
    if (groups.length === 0 || d.combine === "batch") groups.push({ pre: [d.preAverage], post: [], lights: d.meteredLightCount });
    else groups[groups.length - 1].pre.push(d.preAverage);
    if (d.postAverage !== null) groups[groups.length - 1].post.push(d.postAverage);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const postAverage =
    groups.length > 0 && groups.every((g) => g.post.length > 0) ? groups.reduce((s, g) => s + mean(g.post), 0) : null;
  const baseline = groups.length === 0 ? null : groups.reduce((s, g) => s + g.pre.reduce((a, b) => a + b, 0) / g.pre.length, 0);
  const meteredLightCount = groups.length === 0 ? null : groups.reduce((s, g) => s + g.lights, 0);

  const perDemo = live.map((d) => ({ id: d.id, savingsPct: demoSavingsPct(d.preAverage, d.postAverage, ex) }));
  const measured = perDemo
    .map((p, i) => ({ id: p.id, sequence: live[i].sequence, savingsPct: p.savingsPct, rejected: false }))
    .filter((p): p is { id: string; sequence: number; savingsPct: number; rejected: boolean } => p.savingsPct !== null);
  const benchmark = deriveBenchmark(measured, override);
  return { baseline, meteredLightCount, postAverage, perDemo, benchmark };
}
