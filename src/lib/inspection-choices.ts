import { db } from "./db";
import { DEMO_LIGHTS_SELECT, demoLightsInstalled, totalLights } from "./light-population";

export type InspectionSocietyChoice = { id: string; name: string; location: string };
export type InspectionCircuitChoice = {
  id: string;
  societyId: string;
  location: string | null;
  lightType: string;
  meteredLightCount: number;
  /** Every light installed on it — full installation + demo lights (2026-09-27). */
  representedLightCount: number;
};

/**
 * What a new inspection can be about: every society, and every live circuit
 * with the number of lights an inspection walks. Shared by the back office's
 * form and the field app's (2026-09-29), so the two offer the same choices
 * and the same default total.
 */
export async function loadInspectionChoices(): Promise<{
  societies: InspectionSocietyChoice[];
  circuits: InspectionCircuitChoice[];
}> {
  const [societies, circuitRows] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, location: true } }),
    db.circuit.findMany({
      where: { voidedAt: null },
      orderBy: { location: "asc" },
      select: {
        id: true,
        societyId: true,
        location: true,
        lightType: true,
        representedLightCount: true,
        ...DEMO_LIGHTS_SELECT,
      },
    }),
  ]);
  const circuits = circuitRows.map(({ demos, devices, meteredLightCount, ...c }) => ({
    id: c.id,
    societyId: c.societyId,
    location: c.location,
    lightType: c.lightType,
    meteredLightCount,
    representedLightCount: totalLights(
      c.representedLightCount,
      demoLightsInstalled({ meteredLightCount, demos, devices }),
    ),
  }));
  return { societies, circuits };
}
