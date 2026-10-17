/**
 * A circuit's lights, in two parts (2026-09-27, user-specified):
 *
 * - FULL INSTALLATION — `Circuit.representedLightCount`: the lights FirsThing
 *   fitted across the society in the full installation after the agreement.
 *   It does NOT include the demo lights — those were already in before the
 *   full installation started.
 * - DEMO LIGHTS — the lights FirsThing replaced on the demo circuit: the
 *   initial demo's light count, capped at the lights actually replaced there
 *   (fixtures kept on the circuit were never installed by FirsThing).
 *
 * Everything that is about the society as a whole — lights installed, what an
 * invoice bills, the population a saving is extrapolated to — is the TOTAL,
 * full installation + demo lights. Before this, the stored count was taken to
 * be the total and entered that way; migration
 * 20260927100000_split_demo_lights takes the demo lights off every circuit,
 * using exactly the rule below.
 */

export type DemoLightsInput = {
  meteredLightCount: number;
  /** Every live (non-voided, non-rejected) demo on the circuit, lowest
   *  sequence first. The first one always counts; any OTHER live demo whose
   *  own `combine` is "batch" (different lights from the first — the
   *  circuit's own label, set when the demo was started) genuinely
   *  represents a SEPARATE population and adds its own count on top; one
   *  whose `combine` is "rerun" (the same lights, re-measured) does not, since
   *  it is the identical lights the first demo already counts (2026-10-17,
   *  user-caught: "736 = 614 + 100 + 22" — two real demos on one circuit, not
   *  one demo and a number nobody is counting). */
  demos?: { id?: string; meteredLightCount: number; combine?: "batch" | "rerun" }[];
  /** A line's own `demoId` scopes it to one demo once the circuit's
   *  inventory has been split across them (CircuitDevice.demoId,
   *  2026-10-17); a line with no demoId belongs to every demo, the ordinary
   *  one-demo-per-circuit case. */
  devices?: { count: number; replacementCount: number | null; excludedFromCalculation: boolean; demoId?: string | null }[];
};

/** Select this on a circuit to be able to call `demoLightsInstalled`. */
export const DEMO_LIGHTS_SELECT = {
  meteredLightCount: true,
  demos: {
    where: { voidedAt: null, rejected: false },
    orderBy: { sequence: "asc" as const },
    select: { id: true, meteredLightCount: true, combine: true },
  },
  devices: { select: { count: true, replacementCount: true, excludedFromCalculation: true, demoId: true } },
} as const;

/** The same, as an `include` alongside a circuit's scalar fields. */
export const DEMO_LIGHTS_INCLUDE = {
  demos: DEMO_LIGHTS_SELECT.demos,
  devices: DEMO_LIGHTS_SELECT.devices,
} as const;

/**
 * The demo lights FirsThing installed on this circuit: the first live demo's
 * light count (the circuit's metered count when the demo was on paper, before
 * this system), capped at what was actually replaced on the circuit —
 * PLUS, for a circuit genuinely run as more than one demo, any other live
 * demo's own count the same way, when that demo's own `combine` says it is
 * a separate population rather than the same lights measured again.
 */
export function demoLightsInstalled(c: DemoLightsInput): number {
  const demos = c.demos ?? [];
  const devices = c.devices ?? [];
  const split = devices.some((d) => d.demoId != null);
  const capFor = (count: number, demoId?: string): number => {
    const own = split && demoId != null ? devices.filter((d) => d.demoId == null || d.demoId === demoId) : devices;
    const replaced = own.length > 0
      ? own.filter((d) => !d.excludedFromCalculation).reduce((n, d) => n + (d.replacementCount ?? d.count), 0)
      : null;
    return Math.max(0, replaced === null || replaced === 0 ? count : Math.min(count, replaced));
  };
  const first = demos[0]?.meteredLightCount ?? c.meteredLightCount;
  let total = capFor(first, demos[0]?.id);
  for (const d of demos.slice(1)) {
    if (d.combine === "batch") total += capFor(d.meteredLightCount, d.id);
  }
  return total;
}

/** Every light FirsThing installed of this circuit's type: full installation + demo lights. */
export function totalLights(fullInstallation: number, demoLights: number): number {
  return fullInstallation + demoLights;
}

/** The full installation, given a total (an invoice's billed count, a walked inventory). */
export function fullFromTotal(total: number, demoLights: number): number {
  return Math.max(0, total - demoLights);
}

/**
 * A full-installation count typed by a person. Above zero, keeping the user's
 * rule of 2026-09-08 ("represented lights is always more than circuit light"):
 * the metered demo circuit is a SAMPLE of a light type, and a full
 * installation of nothing prices the offer as though the demo were the whole
 * society — how Indiabulls was once offered on 50 of 50 when the survey had
 * counted 2,000.
 */
export function refuseFullInstallationCount(n: number): string | null {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return "The full installation is the whole number of lights fitted across the society after the agreement, not counting the demo lights — always more than zero.";
  }
  return null;
}

/** "1,655 (1,600 full installation + 55 demo)" — the one wording every screen uses. */
export function describeLights(fullInstallation: number, demoLights: number): string {
  const f = (n: number) => n.toLocaleString("en-IN");
  return `${f(totalLights(fullInstallation, demoLights))} (${f(fullInstallation)} full installation + ${f(demoLights)} demo)`;
}

/**
 * Whether correcting one demo's count moves the total at all — the first
 * live demo always does; any OTHER live demo only does when its own
 * `combine` is "batch" (a separate population, added on top by
 * `demoLightsInstalled`) rather than "rerun" (the same lights the first
 * demo already counts). Callers use this to build
 * `representedCountAfterDemoCorrection`'s own `countsTowardTotal`.
 */
export function demoCountFeedsTotal(
  demos: { id: string; combine?: "batch" | "rerun" }[],
  demoId: string,
): boolean {
  const i = demos.findIndex((d) => d.id === demoId);
  if (i < 0) return false;
  return i === 0 || demos[i].combine === "batch";
}

/**
 * When a demo's own light count is corrected — through `setDemoLightCount`
 * or the inventory's "Correct count" — the circuit's full-installation
 * figure has to absorb the opposite change, so the total actually installed
 * (full installation + demo lights) stays exactly what it always was. A
 * correction says a number was typed wrong, not that new lights went in
 * (2026-10-05, user-asked, from an ATS Greens Paradiso report: 951 installed
 * must still read 951 lights whichever way the demo's own count later moves
 * — 911 full installation + 40 demo becomes 907 full installation + 44
 * demo, not 951 full installation + 44 demo).
 *
 * Only a demo `demoCountFeedsTotal` says counts toward the total feeds the
 * split at all — `demoLightsInstalled()` only adds such a demo's count, so
 * correcting any OTHER demo (a "rerun" of the same lights, not the first)
 * never touches the full-installation figure, and this returns
 * `{changed: false}` for it (2026-10-17, generalised from "the initial demo
 * only" once a circuit's two real demos — 100 and 22 — both turned out to
 * need to count).
 */
export function representedCountAfterDemoCorrection(input: {
  countsTowardTotal: boolean;
  representedLightCount: number;
  oldDemoCount: number;
  newDemoCount: number;
}): { changed: false } | { changed: true; newRepresentedLightCount: number } | { error: string } {
  if (!input.countsTowardTotal || input.oldDemoCount === input.newDemoCount) return { changed: false };
  const next = input.representedLightCount - (input.newDemoCount - input.oldDemoCount);
  const err = refuseFullInstallationCount(next);
  if (err) {
    return {
      error: `Changing the demo's count from ${input.oldDemoCount} to ${input.newDemoCount} would leave the full installation at ${next} lights — ${err}`,
    };
  }
  return { changed: true, newRepresentedLightCount: next };
}

/**
 * The monthly savings report's own figure (2026-10-12, user-specified) —
 * deliberately NOT the invoice-first measured figure the actual bill is
 * reconciled against (that stays untouched, read from the real released
 * fee line). Two facts are frozen forever at the demo (its own baseline and
 * the lights it was measured on — "the demo savings reports will use these
 * two and should never change whether in future the light count on the demo
 * circuit changes"); one is live (the latest benchmark — "changes only if
 * the benchmark savings is changed... it should take the latest"); one is
 * the whole-society total, which a light-count move between circuits never
 * changes (517+42 or 504+55, always 559) — so only the SPLIT needs to move
 * with a rescale, never this formula's own total input.
 *
 * baseline kWh/day for one demo light × total lights × days in the month =
 * what the whole installation would have drawn without FirsThing; × the
 * benchmark = the saving; × the unit rate = the rupee figure.
 */
export function fullInstallSavingsEstimate(input: {
  demoBaselineKwhPerDay: number;
  demoLightCount: number;
  totalLightCount: number;
  benchmarkSavingsPct: number;
  daysInMonth: number;
  unitElectricityRate: number;
}): { baselineKwh: number; savedKwh: number; savedValue: number } {
  const perLightBaseline = input.demoLightCount > 0 ? input.demoBaselineKwhPerDay / input.demoLightCount : 0;
  const baselineKwh = perLightBaseline * input.totalLightCount * input.daysInMonth;
  const savedKwh = baselineKwh * (input.benchmarkSavingsPct / 100);
  const savedValue = savedKwh * input.unitElectricityRate;
  return { baselineKwh, savedKwh, savedValue };
}
