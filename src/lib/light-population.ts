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
  /** The circuit's first live demo, if the demo was recorded in the app. */
  demos?: { meteredLightCount: number }[];
  devices?: { count: number; replacementCount: number | null; excludedFromCalculation: boolean }[];
};

/** Select this on a circuit to be able to call `demoLightsInstalled`. */
export const DEMO_LIGHTS_SELECT = {
  meteredLightCount: true,
  demos: {
    where: { voidedAt: null },
    orderBy: { sequence: "asc" as const },
    take: 1,
    select: { meteredLightCount: true },
  },
  devices: { select: { count: true, replacementCount: true, excludedFromCalculation: true } },
} as const;

/** The same, as an `include` alongside a circuit's scalar fields. */
export const DEMO_LIGHTS_INCLUDE = {
  demos: DEMO_LIGHTS_SELECT.demos,
  devices: DEMO_LIGHTS_SELECT.devices,
} as const;

/**
 * The demo lights FirsThing installed on this circuit: the initial demo's
 * light count (the circuit's metered count when the demo was on paper, before
 * this system), capped at what was actually replaced on the circuit.
 */
export function demoLightsInstalled(c: DemoLightsInput): number {
  const demo = c.demos?.[0]?.meteredLightCount ?? c.meteredLightCount;
  const devices = c.devices ?? [];
  const replaced = devices.length > 0
    ? devices.filter((d) => !d.excludedFromCalculation).reduce((n, d) => n + (d.replacementCount ?? d.count), 0)
    : null;
  return Math.max(0, replaced === null || replaced === 0 ? demo : Math.min(demo, replaced));
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
 * When the circuit's INITIAL demo's own light count is corrected — through
 * `setDemoLightCount` or the inventory's "Correct count" — the circuit's
 * full-installation figure has to absorb the opposite change, so the total
 * actually installed (full installation + demo lights) stays exactly what
 * it always was. A correction says a number was typed wrong, not that new
 * lights went in (2026-10-05, user-asked, from an ATS Greens Paradiso
 * report: 951 installed must still read 951 lights whichever way the
 * demo's own count later moves — 911 full installation + 40 demo becomes
 * 907 full installation + 44 demo, not 951 full installation + 44 demo).
 *
 * Only the circuit's current initial (first live, by sequence) demo's count
 * feeds the split at all — `demoLightsInstalled()` reads only that one, so
 * correcting any OTHER demo's count never touches the full-installation
 * figure, and this returns `{changed: false}` for it.
 */
export function representedCountAfterDemoCorrection(input: {
  isInitialDemo: boolean;
  representedLightCount: number;
  oldDemoCount: number;
  newDemoCount: number;
}): { changed: false } | { changed: true; newRepresentedLightCount: number } | { error: string } {
  if (!input.isInitialDemo || input.oldDemoCount === input.newDemoCount) return { changed: false };
  const next = input.representedLightCount - (input.newDemoCount - input.oldDemoCount);
  const err = refuseFullInstallationCount(next);
  if (err) {
    return {
      error: `Changing the demo's count from ${input.oldDemoCount} to ${input.newDemoCount} would leave the full installation at ${next} lights — ${err}`,
    };
  }
  return { changed: true, newRepresentedLightCount: next };
}
