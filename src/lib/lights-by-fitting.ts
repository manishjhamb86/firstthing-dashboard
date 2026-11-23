import { groupCircuitsByDeal } from "./circuit-deal-group";
import { fittingLabel, installedCount, meteredOf, type InventoryDevice } from "./inventory-display";
import { totalLights } from "./light-population";

/**
 * Installed lights at a society, by fitting — "Tube light 20W 1,444 ·
 * Surface light 12W 552" (2026-11-23, user-asked: per item, not one total).
 *
 * The figure is the installation record's — the full installation plus the
 * demo lights, the population the bill uses — never the stock ledger, so the
 * per-fitting lines add up to exactly the "LED lights installed" total.
 * A circuit counts once its replacement is recorded; several circuits that
 * stand for one deal (a redone demo) count the full installation once.
 * The fitting is the circuit's own installed light: the replacement on its
 * largest line.
 */
export type FittingCircuit = {
  id: string;
  siteSurveyId?: string | null;
  location: string | null;
  lightType: string;
  representedLightCount: number;
  demoLights: number;
  lightReplacementDate: Date | null;
  devices: InventoryDevice[];
};

export function fittingOf(c: FittingCircuit): string {
  const lines = c.devices.filter((d) => !d.excludedFromCalculation && installedCount(c, d) > 0);
  const main = [...lines].sort((a, b) => installedCount(c, b) - installedCount(c, a))[0];
  if (!main) return c.lightType;
  return main.replacementType ? fittingLabel(main.replacementWattage ?? main.wattage, main.replacementType.name) : fittingLabel(main.wattage, main.deviceType.name);
}

export function lightsByFitting(circuits: FittingCircuit[]): Array<{ fitting: string; count: number }> {
  const installed = circuits.filter((c) => c.lightReplacementDate && meteredOf(c) > 0);
  const { groups, solo } = groupCircuitsByDeal(
    installed.map((c) => ({
      id: c.id,
      siteSurveyId: c.siteSurveyId ?? null,
      location: c.location,
      lightType: c.lightType,
      demoLights: c.demoLights,
      fullInstallation: c.representedLightCount,
      isLive: false,
      state: "",
    })),
  );
  const byId = new Map(installed.map((c) => [c.id, c]));
  const out = new Map<string, number>();
  const add = (fitting: string, n: number) => out.set(fitting, (out.get(fitting) ?? 0) + n);
  for (const g of groups) {
    const full = g.fullInstallationDisagreement ? Math.max(...g.fullInstallationDisagreement) : g.members[0]!.fullInstallation;
    add(fittingOf(byId.get(g.members[0]!.id)!), totalLights(full, g.combinedDemoLights));
  }
  for (const s of solo) {
    const c = byId.get(s.id)!;
    add(fittingOf(c), totalLights(c.representedLightCount, c.demoLights));
  }
  return [...out.entries()].map(([fitting, count]) => ({ fitting, count })).sort((a, b) => b.count - a.count);
}
