import { installedFullByCircuit } from "@/lib/installed-full";
import { db } from "@/lib/db";
import { demoLightsInstalled } from "@/lib/light-population";
import { groupCircuitsByDeal } from "@/lib/circuit-deal-group";
import { meteredOf } from "@/lib/inventory-display";

export type InstalledRow = {
  id: string;
  siteSurveyId: string | null;
  location: string | null;
  lightType: string;
  demoLights: number;
  fullInstallation: number;
};

/**
 * Lights FirsThing has installed at a society: the full installation plus
 * the demo lights (2026-09-27), counting the full installation once per deal
 * group and taking the larger figure where a group's circuits disagree
 * (2026-10-08). The portal's Inventory page and the society's public page
 * both read this, so the two can never state different totals.
 */
export function installedLightTotals(rows: InstalledRow[]): { demo: number; full: number; total: number } {
  const { groups, solo } = groupCircuitsByDeal(rows.map((r) => ({ ...r, isLive: false, state: "" })));
  const full =
    groups.reduce((s, g) => s + (g.fullInstallationDisagreement ? Math.max(...g.fullInstallationDisagreement) : g.members[0]!.fullInstallation), 0) +
    solo.reduce((s, c) => s + c.fullInstallation, 0);
  const demo = rows.reduce((s, r) => s + r.demoLights, 0);
  return { demo, full, total: demo + full };
}

/** The same, read for one society: only circuits whose lights have actually gone in. */
export async function loadSocietyInstalledLights(societyId: string): Promise<{ demo: number; full: number; total: number }> {
  const circuits = await db.circuit.findMany({
    where: { societyId, voidedAt: null },
    select: {
      id: true,
      siteSurveyId: true,
      location: true,
      lightType: true,
      meteredLightCount: true,
      representedLightCount: true,
      demos: { where: { voidedAt: null }, orderBy: { sequence: "asc" }, select: { id: true, meteredLightCount: true, rejected: true, combine: true, lightReplacementDate: true } },
      devices: {
        select: { count: true, replacementCount: true, replacementUnitsInstalled: true, excludedFromCalculation: true, demoId: true, historical: true, wattage: true, replacementWattage: true, deviceType: { select: { name: true } }, replacementType: { select: { name: true } }, id: true },
      },
    },
  });
  // Installed, not billed: a deal's logged installation days (installed-full.ts).
  const installedFull = await installedFullByCircuit(circuits);
  const rows: InstalledRow[] = [];
  for (const c of circuits) {
    const replaced = c.demos.some((d) => !d.rejected && d.lightReplacementDate);
    const lightReplacementDate = replaced ? new Date(0) : null;
    if (!replaced || meteredOf({ lightReplacementDate, devices: c.devices }) <= 0) continue;
    rows.push({
      id: c.id,
      siteSurveyId: c.siteSurveyId,
      location: c.location,
      lightType: c.lightType,
      demoLights: demoLightsInstalled({ meteredLightCount: c.meteredLightCount, demos: c.demos, devices: c.devices }),
      fullInstallation: installedFull.get(c.id) ?? c.representedLightCount,
    });
  }
  return installedLightTotals(rows);
}
