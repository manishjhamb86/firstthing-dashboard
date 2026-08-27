// FEAT-020 — the demo savings report's arithmetic and its refusal rules,
// as a pure module. Same convention as portal-authority.ts and
// benchmark-rescale.ts: the real decision is unit-testable without a live
// request context, and the Server Action is a thin shell around it.

export type DemoReportReading = {
  date: string; // YYYY-MM-DD
  consumptionKwh: number;
};

export type DemoReportCircuitInput = {
  id: string;
  lightType: string;
  location: string | null;
  meteredLightCount: number;
  representedLightCount: number;
  wattage: number;
  preInstallBaseline: number | null;
  benchmarkSavingsPct: number | null;
  state: string;
  preInstallReadings: DemoReportReading[];
  postInstallReadings: DemoReportReading[];
};

export type DemoReportCircuit = {
  circuitId: string;
  lightType: string;
  location: string | null;
  meteredLightCount: number;
  representedLightCount: number;
  // CON-11: the metered circuit stands in for every light of its type, so
  // its measured saving is scaled by this factor and never by a
  // society-wide average.
  extrapolationFactor: number;
  preInstallBaseline: number;
  postInstallAverage: number;
  savedKwhPerDay: number;
  benchmarkSavingsPct: number;
  projectedSavedKwhPerDay: number;
  // INV-02 — the days behind both figures travel with the report, so a
  // society disputing the number can be shown what produced it.
  preInstallReadings: DemoReportReading[];
  postInstallReadings: DemoReportReading[];
};

export type DemoReportFigures = {
  preInstallBaselineTotal: number;
  postInstallAverageTotal: number;
  measuredSavingsPct: number;
  societyLightCount: number;
  meteredLightCount: number;
  extrapolationFactor: number;
  projectedSavingsKwhPerDay: number;
  circuits: DemoReportCircuit[];
};

// FEAT-020-AC-3 — a generation failure names the specific missing input.
// "Report could not be generated" with no cause is exactly the silent
// absence the AC exists to prevent.
export type DemoReportBlocker =
  | "no-circuits"
  | "no-benchmarked-circuits"
  | "circuits-still-commissioning"
  | "no-lighting-inventory"
  | "no-post-install-readings";

export const BLOCKER_MESSAGE: Record<DemoReportBlocker, string> = {
  "no-circuits": "This deal has no demo circuits yet — select and commission at least one first.",
  "no-benchmarked-circuits":
    "No circuit has a confirmed benchmark yet. A report is never generated from an out-of-range result.",
  "circuits-still-commissioning":
    "Some circuits are still mid-commissioning. The report covers the whole demo, so it waits for every circuit to reach a confirmed benchmark.",
  "no-lighting-inventory":
    "The whole-society light count is missing (FEAT-006's lighting inventory) — the extrapolation can't be computed without it.",
  "no-post-install-readings": "A benchmarked circuit has no post-install readings to average.",
};

/**
 * The society-wide light count CON-11's extrapolation scales by, and where
 * it came from.
 *
 * FEAT-006's walked inventory is the normal source. A society commissioned
 * before this system existed never had one walked — its circuits were built
 * from a demo report — so the figure comes instead from what each circuit
 * already records as the population it represents, which is the same
 * quantity read off the first invoice rather than off a clipboard.
 *
 * Falling back rather than blocking matters because the alternative is a
 * report that can never generate: there is no site visit left to make, and
 * asking for one is the dead end this screen has hit before. The source is
 * returned so the report can say which figure it used instead of presenting
 * two different provenances as one number.
 */
export function resolveSocietyLightCount(input: {
  inventoryTotal: number;
  circuits: { representedLightCount: number }[];
}): { count: number; source: "inventory" | "represented" } {
  if (input.inventoryTotal > 0) return { count: input.inventoryTotal, source: "inventory" };
  return {
    count: input.circuits.reduce((s, c) => s + c.representedLightCount, 0),
    source: "represented",
  };
}

export function averageOf(readings: DemoReportReading[]): number {
  if (readings.length === 0) return 0;
  return readings.reduce((sum, r) => sum + r.consumptionKwh, 0) / readings.length;
}

/**
 * Builds the report figures, or names why it can't.
 *
 * Deliberately does no rounding anywhere: these figures feed the offer's
 * projected fee and eventually a rupee amount a society is billed on
 * (INV-02), and rounding at the report stage pushes error downstream where
 * nobody can see where it came from.
 */
export function buildDemoReport(input: {
  circuits: DemoReportCircuitInput[];
  societyLightCount: number;
}): { ok: true; figures: DemoReportFigures } | { ok: false; blocker: DemoReportBlocker } {
  const { circuits, societyLightCount } = input;

  if (circuits.length === 0) return { ok: false, blocker: "no-circuits" };

  const benchmarked = circuits.filter(
    (c) => c.state === "benchmark_confirmed" && c.preInstallBaseline != null && c.benchmarkSavingsPct != null,
  );
  if (benchmarked.length === 0) return { ok: false, blocker: "no-benchmarked-circuits" };

  // A report covering only some of the demo's circuits would understate the
  // result and read as authoritative anyway — so it waits for all of them.
  const stillGoing = circuits.filter(
    (c) => c.state !== "benchmark_confirmed" && c.state !== "ineligible" && c.state !== "retired",
  );
  if (stillGoing.length > 0) return { ok: false, blocker: "circuits-still-commissioning" };

  if (societyLightCount <= 0) return { ok: false, blocker: "no-lighting-inventory" };

  const built: DemoReportCircuit[] = [];
  for (const c of benchmarked) {
    if (c.postInstallReadings.length === 0) return { ok: false, blocker: "no-post-install-readings" };

    const preInstallBaseline = c.preInstallBaseline!;
    const postInstallAverage = averageOf(c.postInstallReadings);
    const savedKwhPerDay = preInstallBaseline - postInstallAverage;
    const extrapolationFactor = c.representedLightCount / c.meteredLightCount;

    built.push({
      circuitId: c.id,
      lightType: c.lightType,
      location: c.location,
      meteredLightCount: c.meteredLightCount,
      representedLightCount: c.representedLightCount,
      extrapolationFactor,
      preInstallBaseline,
      postInstallAverage,
      savedKwhPerDay,
      benchmarkSavingsPct: c.benchmarkSavingsPct!,
      projectedSavedKwhPerDay: savedKwhPerDay * extrapolationFactor,
      preInstallReadings: c.preInstallReadings,
      postInstallReadings: c.postInstallReadings,
    });
  }

  const preInstallBaselineTotal = built.reduce((s, c) => s + c.preInstallBaseline, 0);
  const postInstallAverageTotal = built.reduce((s, c) => s + c.postInstallAverage, 0);
  const meteredLightCount = built.reduce((s, c) => s + c.meteredLightCount, 0);

  return {
    ok: true,
    figures: {
      preInstallBaselineTotal,
      postInstallAverageTotal,
      measuredSavingsPct:
        ((preInstallBaselineTotal - postInstallAverageTotal) / preInstallBaselineTotal) * 100,
      societyLightCount,
      meteredLightCount,
      extrapolationFactor: societyLightCount / meteredLightCount,
      projectedSavingsKwhPerDay: built.reduce((s, c) => s + c.projectedSavedKwhPerDay, 0),
      circuits: built,
    },
  };
}
